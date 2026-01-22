# Deployment Check

## Issue: Still seeing chrome-extension redirect

If you're still seeing the chrome-extension redirect error, the backend changes haven't been deployed yet.

## Steps to Fix

### 1. Push Changes to GitHub

```bash
git add backend/server.js extension/src/ui/options/options.js
git commit -m "Fix Stripe redirect - explicitly reject chrome-extension URLs"
git push origin main
```

### 2. Wait for Render Deployment

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your service: `focus-nudge-extension`
3. Check the "Events" or "Logs" tab
4. Wait for "Deploy successful" message (usually 1-2 minutes)

### 3. Verify Deployment

Test the endpoint to see what URL it's using:

```bash
# Create a test checkout session (replace YOUR_USER_ID)
curl -X POST https://focus-nudge-extension.onrender.com/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"userId":"YOUR_USER_ID"}'
```

Check the response - the `url` should redirect to `https://checkout.stripe.com/...` and the success URL should be `https://focus-nudge-extension.onrender.com/success`.

### 4. Check Render Logs

After creating a checkout session, check Render logs for:
```
[CHECKOUT] Creating session for userId: ...
[CHECKOUT] Success URL: https://focus-nudge-extension.onrender.com/success?...
[CHECKOUT] Cancel URL: https://focus-nudge-extension.onrender.com/cancel
```

If you see `chrome-extension://` in the logs, the old code is still running.

### 5. Clear Browser Cache

Sometimes browsers cache checkout sessions. Try:
- Using an incognito/private window
- Clearing browser cache
- Using a different browser

### 6. Test Again

After deployment:
1. Reload the extension
2. Try subscribing again
3. Should redirect to `https://focus-nudge-extension.onrender.com/success` (not chrome-extension)

## If Still Not Working

If you still see chrome-extension redirects after deployment:

1. **Check Render Logs**: Look for the `[CHECKOUT]` log messages to see what URLs are being generated
2. **Verify Environment Variable**: Check if `BACKEND_URL` is set in Render (should be `https://focus-nudge-extension.onrender.com`)
3. **Test Directly**: Use the curl command above to test the API directly
4. **Check Stripe Dashboard**: Look at the checkout session in Stripe to see what success_url was set
