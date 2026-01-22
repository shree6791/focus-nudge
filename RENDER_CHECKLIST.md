# Render Setup Checklist

## ✅ Completed

- [x] Code pushed to GitHub
- [x] Backend deployed to Render
- [x] Render URL: `https://focus-nudge-extension.onrender.com`
- [x] Extension API URL updated in `plan.js`
- [x] Manifest host_permissions updated

## 🔲 To Do

### 1. Get Stripe Keys

1. Go to [Stripe Dashboard → API Keys](https://dashboard.stripe.com/apikeys)
2. Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
3. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

### 2. Configure Render Environment Variables

Go to Render dashboard → Your service → Environment → Add:

- `STRIPE_SECRET_KEY` = `sk_test_...` (your secret key)
- `STRIPE_PUBLISHABLE_KEY` = `pk_test_...` (your publishable key)
- `STRIPE_WEBHOOK_SECRET` = `whsec_...` (get this after webhook setup)
- `PORT` = `3000`
- `NODE_ENV` = `production`

### 3. Set Up Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://focus-nudge-extension.onrender.com/api/webhook`
4. **Select Events**:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. **Copy the webhook signing secret** (starts with `whsec_`)
7. **Add to Render**: Go to Render → Environment → Add `STRIPE_WEBHOOK_SECRET` = `whsec_...`

### 4. Update Extension Stripe Key

Edit `extension/src/ui/options/options.js` (line 42):

```javascript
stripePublishableKey = 'pk_test_...'; // Replace with your publishable key from Stripe Dashboard
```

**Important**: Use the **Publishable key** (starts with `pk_test_`), NOT the secret key!

### 5. Test Backend

```bash
# Test health endpoint
curl https://focus-nudge-extension.onrender.com/health

# Should return: {"status":"ok","timestamp":"..."}
```

### 6. Test Payment Flow

1. **Reload Extension**: Reload in Chrome (`chrome://extensions`)
2. **Open Options**: Right-click extension → Options
3. **Click "Upgrade to Pro"**: Should redirect to Stripe Checkout
4. **Use Test Card**:
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - ZIP: `12345`
5. **Complete Payment**: After payment, webhook activates license
6. **Verify Pro**: Options page should show "Pro" status

## Quick Reference

- **Backend URL**: `https://focus-nudge-extension.onrender.com`
- **Health Check**: `https://focus-nudge-extension.onrender.com/health`
- **Webhook URL**: `https://focus-nudge-extension.onrender.com/api/webhook`
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Render Dashboard**: https://dashboard.render.com

## Troubleshooting

**Backend not responding?**
- Check Render logs: Render dashboard → Your service → Logs
- Verify environment variables are set
- Check that root directory is set to `backend/` in Render

**Webhook not working?**
- Verify webhook URL in Stripe matches Render URL
- Check `STRIPE_WEBHOOK_SECRET` in Render matches Stripe
- Check Render logs for webhook events

**Payment not working?**
- Verify Stripe publishable key in `options.js` (must start with `pk_test_`)
- Check browser console for errors
- Verify backend is accessible
