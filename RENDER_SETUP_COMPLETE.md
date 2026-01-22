# Render Setup Complete! ✅

Your backend is now deployed at: **https://focus-nudge-extension.onrender.com**

## Next Steps

### 1. Set Up Stripe Webhook

1. **Go to Stripe Dashboard**: [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. **Click "Add endpoint"**
3. **Endpoint URL**: `https://focus-nudge-extension.onrender.com/api/webhook`
4. **Select Events**:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. **Copy Webhook Secret**: After creating, copy the signing secret (starts with `whsec_`)
6. **Add to Render**: 
   - Go to Render dashboard → Your service → Environment
   - Add variable: `STRIPE_WEBHOOK_SECRET` = `whsec_...` (the secret you copied)

### 2. Verify Environment Variables in Render

Make sure these are set in Render → Your service → Environment:

- ✅ `STRIPE_SECRET_KEY` = `sk_test_...` (or `sk_live_...` for production)
- ✅ `STRIPE_PUBLISHABLE_KEY` = `pk_test_...` (or `pk_live_...` for production)
- ✅ `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from webhook setup)
- ✅ `PORT` = `3000` (Render sets this automatically, but good to have)
- ✅ `NODE_ENV` = `production`

### 3. Update Extension Stripe Key

Edit `extension/src/ui/options/options.js`:

Find this line (around line 42):
```javascript
stripePublishableKey = 'pk_test_...'; // TODO: Replace with your Stripe publishable key
```

Replace with your actual Stripe publishable key:
```javascript
stripePublishableKey = 'pk_test_uveTRX3EcM76PDJU0ZccAS95'; // Your key
```

### 4. Test the Backend

Test your backend is working:

```bash
# Health check
curl https://focus-nudge-extension.onrender.com/health

# Should return: {"status":"ok","timestamp":"..."}
```

### 5. Test Payment Flow

1. **Load Extension**: Load unpacked extension in Chrome
2. **Open Options**: Right-click extension → Options
3. **Click "Upgrade to Pro"**: Should redirect to Stripe Checkout
4. **Use Test Card**:
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/34` (any future date)
   - CVC: `123` (any 3 digits)
   - ZIP: `12345` (any 5 digits)
5. **Complete Payment**: After payment, webhook should activate license
6. **Verify Pro**: Options page should show "Pro" status

## Troubleshooting

### Backend Not Responding

- Check Render logs: Render dashboard → Your service → Logs
- Verify environment variables are set correctly
- Check that `backend/` is set as root directory in Render

### Webhook Not Working

- Verify webhook URL in Stripe Dashboard matches: `https://focus-nudge-extension.onrender.com/api/webhook`
- Check `STRIPE_WEBHOOK_SECRET` in Render matches Stripe Dashboard
- Check Render logs for webhook events

### Extension Can't Connect

- Verify `API_BASE_URL` in `plan.js` is: `https://focus-nudge-extension.onrender.com`
- Check `host_permissions` in manifest includes Render URL
- Open DevTools → Network tab to see if requests are being made

## Your Configuration

- **Backend URL**: `https://focus-nudge-extension.onrender.com`
- **Extension API URL**: Already updated in `plan.js`
- **Manifest Permissions**: Already updated
- **Stripe Publishable Key**: Update in `options.js` (line 42)

## Ready to Test! 🚀

Once you:
1. ✅ Set up Stripe webhook
2. ✅ Add webhook secret to Render
3. ✅ Update Stripe publishable key in options.js

You're ready to test the complete payment flow!
