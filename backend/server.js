// Backend server for Focus Nudge extension
// Handles Stripe payments and license verification

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createLicense, findUserIdByCustomerId, isValidLicense } = require('./licenseService');
const { initWebhookHandlers } = require('./webhookHandlers');

// Initialize webhook handlers with Stripe instance
const { handleCheckoutCompleted, handleSubscriptionUpdate } = initWebhookHandlers(stripe);

const app = express();
const PORT = process.env.PORT || 3000;

// Constants
const BACKEND_URL = process.env.BACKEND_URL || 'https://focus-nudge-extension.onrender.com';
const SUBSCRIPTION_PRICE_CENTS = 999; // $9.99
const SUBSCRIPTION_INTERVAL = 'month';

// Middleware
app.use(cors());

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

// In-memory license store (replace with database in production)
const licenses = new Map(); // userId -> { licenseKey, stripeCustomerId, status, expiresAt }

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

    const license = licenses.get(userId);

    if (!isValidLicense(license)) {
      return res.status(404).json({ error: 'No active license found' });
    }

    return res.json({ licenseKey: license.licenseKey });
  } catch (error) {
    console.error('Get license error:', error);
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

    const license = licenses.get(userId);

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
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { userId, returnUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Stripe can't redirect to chrome-extension:// URLs
    // Always use web-accessible success page on our backend
    const safeBaseUrl = BACKEND_URL.includes('chrome-extension') 
      ? 'https://focus-nudge-extension.onrender.com' 
      : BACKEND_URL;
    
    const successUrl = `${safeBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}&userId=${encodeURIComponent(userId)}`;
    const cancelUrl = (returnUrl && returnUrl.startsWith('http') && !returnUrl.includes('chrome-extension'))
      ? returnUrl 
      : `${safeBaseUrl}/cancel`;
    
    console.log(`[CHECKOUT] Creating session for userId: ${userId}`);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Focus Nudge Pro',
            description: 'Unlock customizable nudges and advanced features',
          },
          unit_amount: SUBSCRIPTION_PRICE_CENTS,
          recurring: {
            interval: SUBSCRIPTION_INTERVAL,
          },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { userId },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create Portal Session (for managing subscription)
 * POST /api/create-portal-session
 */
app.post('/api/create-portal-session', async (req, res) => {
  try {
    const { userId, returnUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const license = licenses.get(userId);
    if (!license || !license.stripeCustomerId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: license.stripeCustomerId,
      return_url: returnUrl || `${req.headers.origin}/options`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: error.message });
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
    console.log(`[WEBHOOK] Received event: ${event.type}, id: ${event.id}`);
    
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, licenses);
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        handleSubscriptionUpdate(event.data.object, licenses);
        break;

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
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
app.post('/api/auto-create-license', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'Missing sessionId or userId' });
    }

    // Check if license already exists
    const existing = licenses.get(userId);
    if (isValidLicense(existing)) {
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
    const licenseKey = createLicense(userId, subscription.customer, subscription.id, licenses);
    
    console.log(`[AUTO-CREATE] License created for userId: ${userId}, sessionId: ${sessionId}`);
    
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
      const licenseKey = createLicense(userId, customerId, subscription.id, licenses);
      
      console.log(`[DEBUG] License manually created for userId: ${userId}, customerId: ${customerId}`);
      
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
    const licenseList = Array.from(licenses.entries()).map(([userId, license]) => ({
      userId,
      licenseKey: license.licenseKey,
      customerId: license.stripeCustomerId,
      status: license.status
    }));
    
    res.json({ count: licenses.size, licenses: licenseList });
  });
}

/**
 * Get public configuration (publishable key)
 * GET /api/config
 */
app.get('/api/config', (req, res) => {
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      return res.status(500).json({ error: 'Stripe publishable key not configured' });
    }

    // Security check: Ensure it's a publishable key, not a secret key
    if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
      console.error('SECURITY WARNING: STRIPE_PUBLISHABLE_KEY appears to be a secret key!');
      return res.status(500).json({ 
        error: 'Invalid publishable key format. Must start with pk_test_ or pk_live_' 
      });
    }

    res.json({ 
      stripePublishableKey: publishableKey 
    });
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Success page (after Stripe checkout)
 * Shows success message and instructions to return to extension
 */
app.get('/success', (req, res) => {
  const { session_id, userId } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful - Focus Nudge</title>
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
        h1 { color: #4CAF50; margin: 0 0 20px 0; }
        p { color: #666; line-height: 1.6; }
        .button {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 24px;
          background: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 600;
        }
        .button:hover { background: #45a049; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✅ Payment Successful!</h1>
        <p>Your Focus Nudge Pro subscription is now active.</p>
        <p><strong>Next steps:</strong></p>
        <ol style="text-align: left; max-width: 400px; margin: 20px auto;">
          <li>Return to the Focus Nudge extension</li>
          <li>Open the Options page (right-click extension icon → Options)</li>
          <li>Refresh the page if needed</li>
          <li>You should now see "Pro" status!</li>
        </ol>
        <p style="font-size: 14px; color: #999; margin-top: 30px;">
          The license will be activated automatically. If you don't see Pro status, wait 10-20 seconds and refresh the options page.
        </p>
      </div>
      <script>
        // Don't try to redirect to chrome-extension URL (doesn't work)
        // Instead, show instructions and let user manually return to extension
        console.log('Payment successful. Session ID:', '${session_id || ''}');
        
        // Store success flag in localStorage as backup (extension can check this)
        if ('${session_id || ''}') {
          try {
            localStorage.setItem('focusNudgePaymentSuccess', '${session_id || ''}');
            localStorage.setItem('focusNudgePaymentTime', Date.now().toString());
          } catch(e) {
            console.warn('Could not store payment success in localStorage');
          }
        }
      </script>
    </body>
    </html>
  `);
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
