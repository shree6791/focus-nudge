// Backend server for Focus Nudge extension
// Handles Stripe payments and license verification

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createLicense, findUserIdByCustomerId, isValidLicense } = require('./licenseService');
const { initWebhookHandlers } = require('./webhookHandlers');
const db = require('./database');

// Initialize webhook handlers with Stripe instance
const { handleCheckoutCompleted, handleSubscriptionUpdate } = initWebhookHandlers(stripe);

const app = express();
const PORT = process.env.PORT || 3000;

// Constants
const BACKEND_URL = process.env.BACKEND_URL || 'https://focus-nudge-extension.onrender.com';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID; // Required: Your Stripe Price ID (e.g., 'price_xxxxx')

if (!STRIPE_PRICE_ID) {
  console.error('ERROR: STRIPE_PRICE_ID environment variable is required');
  process.exit(1);
}

// Helper: Extract customer ID from Stripe object (handles both string and object)
function extractCustomerId(customer) {
  return typeof customer === 'string' ? customer : customer.id;
}

// CORS Configuration - Allow Chrome extension origins and your backend URL
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    // In production, you might want to restrict this
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow Chrome extension origins (chrome-extension://*)
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Allow your backend URL (for success/cancel pages)
    if (origin === BACKEND_URL || origin.startsWith(BACKEND_URL)) {
      return callback(null, true);
    }
    
    // Block all other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: false,
  optionsSuccessStatus: 200
};

// Rate Limiting Configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter rate limit for checkout/portal endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit to 10 requests per 15 minutes for payment endpoints
  message: 'Too many payment requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors(corsOptions));

// Apply rate limiting to API routes (exclude webhook - it's called by Stripe)
app.use('/api/', (req, res, next) => {
  if (req.path === '/api/webhook') {
    return next(); // Skip rate limiting for webhook
  }
  apiLimiter(req, res, next);
});

// IMPORTANT: Webhook endpoint must receive raw body for signature verification
// Skip JSON parsing for webhook route - it needs raw body
app.use((req, res, next) => {
  if (req.path === '/api/webhook') {
    // Skip JSON parsing for webhook - it will use raw body parser in route handler
    next();
  } else {
    // Parse JSON for all other routes
    express.json()(req, res, next);
  }
});

/**
 * Get license key for user (after successful checkout)
 * GET /api/get-license?userId=xxx
 */
app.get('/api/get-license', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const license = db.getLicenseByUserId(userId);

    if (!license) {
      return res.status(404).json({ error: 'No license found for this user' });
    }

    if (!isValidLicense(license)) {
      return res.status(404).json({ error: 'License found but not active' });
    }
    return res.json({ licenseKey: license.licenseKey });
  } catch (error) {
    console.error('[GET-LICENSE] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Verify license key
 * GET /api/verify-license?userId=xxx&licenseKey=xxx
 */
app.get('/api/verify-license', async (req, res) => {
  try {
    const { userId, licenseKey } = req.query;

    if (!userId || !licenseKey) {
      return res.status(400).json({ error: 'Missing userId or licenseKey' });
    }

    const license = db.getLicenseByUserId(userId);

    if (!license || license.licenseKey !== licenseKey || !isValidLicense(license)) {
      return res.json({ valid: false, isPro: false });
    }

    return res.json({ valid: true, isPro: true });
  } catch (error) {
    console.error('License verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Create Stripe Checkout Session
 * POST /api/create-checkout-session
 */
app.post('/api/create-checkout-session', paymentLimiter, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Use web-accessible success page - extension will pick up payment from localStorage
    const safeBaseUrl = BACKEND_URL.includes('chrome-extension') 
      ? 'https://focus-nudge-extension.onrender.com' 
      : BACKEND_URL;
    
    const successUrl = `${safeBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}&userId=${encodeURIComponent(userId)}`;
    const cancelUrl = `${safeBaseUrl}/cancel`;

    // Build checkout session config
    // Stripe Checkout will automatically show "Have a promo code?" link
    // Users can enter coupon codes directly on the checkout page
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [{
        price: STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { userId },
      // Allow promotion codes to be entered on checkout page
      allow_promotion_codes: true,
    };

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    
    // Return user-friendly error messages
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ 
        error: 'Stripe error',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create Portal Session (for managing subscription)
 * POST /api/create-portal-session
 */
app.post('/api/create-portal-session', paymentLimiter, async (req, res) => {
  try {
    const { userId, returnUrl, licenseKey } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    let license = db.getLicenseByUserId(userId);
    
    // If license not found but licenseKey provided, try to find by licenseKey
    if (!license && licenseKey) {
      license = db.getLicenseByLicenseKey(licenseKey);
    }
    
    // If license not found by userId, try to find by looking up subscription from Stripe
    if (!license) {
      
      // Try to find customer by looking up subscriptions with metadata
      try {
        // First, try to find by checking checkout sessions (more reliable)
        let customerId = null;
        let subscriptionId = null;
        
        try {
          // Try exact match first
          const sessions = await stripe.checkout.sessions.list({
            limit: 100,
            client_reference_id: userId
          });
          
          if (sessions.data.length > 0) {
            const completedSessions = sessions.data.filter(s => s.payment_status === 'paid');
            const latestSession = completedSessions.length > 0 ? completedSessions[0] : sessions.data[0];
            
            if (latestSession.subscription) {
              subscriptionId = latestSession.subscription;
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              customerId = extractCustomerId(subscription.customer);
            }
          } else {
            const allSessions = await stripe.checkout.sessions.list({ limit: 100 });
            const matchingSession = allSessions.data.find(s => 
              s.client_reference_id === userId || 
              s.metadata?.userId === userId
            );
            
            if (matchingSession && matchingSession.subscription) {
              subscriptionId = matchingSession.subscription;
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              customerId = extractCustomerId(subscription.customer);
            }
          }
        } catch (sessionError) {
          // Silent fail, will try subscription search
        }
        
        // Fallback: search all subscriptions
        if (!customerId) {
          const subscriptions = await stripe.subscriptions.list({
            limit: 100,
            expand: ['data.customer'],
            status: 'active'
          });
          
          const matchingSub = subscriptions.data.find(sub => {
            const metadataMatch = sub.metadata?.userId === userId;
            const clientRefMatch = sub.client_reference_id === userId;
            const sessionMetadataMatch = sub.metadata && Object.values(sub.metadata).includes(userId);
            return metadataMatch || clientRefMatch || sessionMetadataMatch;
          });
          
          if (matchingSub && matchingSub.customer) {
            customerId = extractCustomerId(matchingSub.customer);
            subscriptionId = matchingSub.id;
          }
        }
        
        // If we found a customerId, create or find the license
        if (customerId) {
          const existingUserId = findUserIdByCustomerId(customerId);
          
          if (existingUserId) {
            license = db.getLicenseByUserId(existingUserId);
          } else {
            if (!subscriptionId) {
              const customerSubs = await stripe.subscriptions.list({
                customer: customerId,
                limit: 1,
                status: 'active'
              });
              
              if (customerSubs.data.length > 0) {
                subscriptionId = customerSubs.data[0].id;
              }
            }
            
            if (subscriptionId) {
              createLicense(userId, customerId, subscriptionId);
              license = db.getLicenseByUserId(userId);
            }
          }
        }
      } catch (stripeError) {
        console.error('[PORTAL] Stripe lookup error:', stripeError.message);
      }
    }
    
    if (!license) {
      return res.status(404).json({ 
        error: 'No active subscription found',
        details: 'Your subscription may not be active yet, or the server was restarted. Please try again in a few moments, or contact support if the issue persists.'
      });
    }

    if (!license.stripeCustomerId) {
      return res.status(404).json({ 
        error: 'Subscription not linked',
        details: 'Your license exists but is not linked to a Stripe customer. Please contact support.'
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: license.stripeCustomerId,
      return_url: returnUrl || `${req.headers.origin || BACKEND_URL}/options`,
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error('[PORTAL] Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.type === 'StripeInvalidRequestError' ? error.message : 'Failed to create portal session'
    });
  }
});

/**
 * Stripe Webhook Handler
 * Handles subscription events
 * NOTE: This route MUST receive raw body for signature verification
 */
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // req.body is now a Buffer (raw body) - required for signature verification
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        handleSubscriptionUpdate(event.data.object);
        break;

      default:
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Auto-create license from Stripe session (fallback if webhook didn't fire)
 * POST /api/auto-create-license
 * Body: { sessionId: "cs_...", userId: "fn_..." }
 * This is called by the extension as a fallback if webhook is delayed
 */
app.post('/api/auto-create-license', paymentLimiter, async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'Missing sessionId or userId' });
    }

    // Check if license already exists
    const existing = db.getLicenseByUserId(userId);
    if (existing && isValidLicense(existing)) {
      return res.json({ 
        success: true, 
        licenseKey: existing.licenseKey,
        message: 'License already exists' 
      });
    }

    // Retrieve and validate session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Validate session
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }
    if (session.mode !== 'subscription') {
      return res.status(400).json({ error: 'Not a subscription session' });
    }

    // Get subscription and validate
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(400).json({ error: `Subscription status is ${subscription.status}, not active` });
    }

    // Create license using shared function
    const customerId = extractCustomerId(subscription.customer);
    const licenseKey = createLicense(userId, customerId, subscription.id);
    
    
    res.json({ 
      success: true, 
      licenseKey,
      message: 'License created successfully' 
    });
  } catch (error) {
    console.error('[AUTO-CREATE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoints (only in development)
 * These are disabled in production for security
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

if (IS_DEV) {
  /**
   * Debug endpoint: Manually create license from Stripe customer
   * GET /api/debug/create-license?userId=xxx&customerId=xxx
   */
  app.get('/api/debug/create-license', async (req, res) => {
    try {
      const { userId, customerId } = req.query;

      if (!userId || !customerId) {
        return res.status(400).json({ error: 'Missing userId or customerId' });
      }

      // Verify customer exists in Stripe
      await stripe.customers.retrieve(customerId);
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 1 });

      if (subscriptions.data.length === 0) {
        return res.status(404).json({ error: 'No subscription found for this customer' });
      }

      const subscription = subscriptions.data[0];
      
      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        return res.status(400).json({ error: `Subscription status is ${subscription.status}, not active` });
      }

      // Create license using shared function
      const licenseKey = createLicense(userId, customerId, subscription.id);
      
      
      res.json({ 
        success: true, 
        licenseKey,
        message: 'License created successfully' 
      });
    } catch (error) {
      console.error('[DEBUG] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Debug endpoint: List all licenses (for debugging)
   * GET /api/debug/licenses
   */
  app.get('/api/debug/licenses', (req, res) => {
    const allLicenses = db.getAllLicenses();
    const licenseList = allLicenses.map(license => ({
      userId: license.userId,
      licenseKey: license.licenseKey,
      customerId: license.stripeCustomerId,
      status: license.status
    }));
    
    res.json({ count: allLicenses.length, licenses: licenseList });
  });
}


/**
 * Success page (after Stripe checkout)
 * Stores payment info in localStorage - extension will pick it up automatically
 */
app.get('/success', (req, res) => {
  const { session_id, userId } = req.query;
  
  // Store payment info in localStorage (extension will check this)
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Payment Successful</title>
  <meta charset="utf-8">
</head>
<body style="font-family:system-ui;text-align:center;padding:50px">
  <h1>✅ Payment Successful!</h1>
  <p><strong>Your Pro subscription is being activated...</strong></p>
  <p style="color:#666;margin-top:30px">Open the Focus Nudge extension options page to see your Pro features activate automatically.</p>
  <p style="color:#999;font-size:14px;margin-top:20px">Right-click the extension icon → Options</p>
  <script>
    try {
      ${session_id ? `localStorage.setItem('focusNudgePaymentSessionId',${JSON.stringify(session_id)});` : ''}
      ${userId ? `localStorage.setItem('focusNudgePaymentUserId',${JSON.stringify(userId)});` : ''}
      localStorage.setItem('focusNudgePaymentTime',Date.now().toString());
    }catch(e){}
  </script>
</body>
</html>`);
});

/**
 * Cancel page (if user cancels checkout)
 */
app.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled - Focus Nudge</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: system-ui, -apple-system, Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 500px;
        }
        h1 { color: #666; margin: 0 0 20px 0; }
        p { color: #666; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Payment Cancelled</h1>
        <p>You can return to the extension and try again anytime.</p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Focus Nudge backend server running on port ${PORT}`);
  console.log(`Stripe webhook endpoint: http://localhost:${PORT}/api/webhook`);
});
