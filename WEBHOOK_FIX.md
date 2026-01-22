# Webhook Fix - Raw Body Issue

## Problem Found ✅

The webhook was failing with this error:
```
Webhook payload must be provided as a string or a Buffer instance representing the _raw_ request body.
Payload was provided as a parsed JavaScript object instead.
```

## Root Cause

Express was parsing the JSON body **before** the webhook handler could verify the signature. Stripe needs the **raw body** to verify webhook signatures.

## Fix Applied

Changed the middleware order so:
1. **Webhook route gets raw body** (for signature verification)
2. **All other routes get parsed JSON** (for normal API calls)

## What Changed

**Before:**
```javascript
app.use(express.json()); // Parses all requests as JSON
app.use(express.raw({ type: 'application/json' })); // Too late - already parsed
```

**After:**
```javascript
// Webhook gets raw body FIRST
app.use('/api/webhook', express.raw({ type: 'application/json' }));
// Then other routes get JSON parsing
app.use(express.json());
```

## Next Steps

1. **Push the fix to GitHub**:
   ```bash
   git add backend/server.js
   git commit -m "Fix webhook - ensure raw body for signature verification"
   git push origin main
   ```

2. **Wait for Render to deploy** (1-2 minutes)

3. **Test the webhook**:
   - Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
   - Click on your webhook endpoint
   - Click "Send test webhook"
   - Select event: `checkout.session.completed`
   - Check Render logs - should see `[WEBHOOK] Received event` without errors

4. **Test payment flow**:
   - Make a test payment
   - Webhook should now fire automatically
   - License should activate without manual intervention!

## Verification

After deployment, check Render logs when you make a payment. You should see:
```
[WEBHOOK] Received event: checkout.session.completed, id: evt_...
[WEBHOOK] Checkout completed - userId: fn_..., mode: subscription
[WEBHOOK] ✅ License activated for userId: fn_..., licenseKey: fn_...
```

If you see these logs, the webhook is working! 🎉
