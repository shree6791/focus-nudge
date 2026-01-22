# Payment Successful - Next Steps

## ✅ Payment Completed!

You've successfully completed payment. The session ID is: `cs_test_a1cje2vwUT0W5Gx7PhZWp8xXOjeiI1seIfP4EfN0sPHJ6avinK0KXz4S0D`

## What Happens Next

The webhook should automatically create your license, but it might take a few seconds.

## Option 1: Use "Check for License" Button (Easiest)

1. **Return to the extension Options page**
2. **Click the "Check for License" button** (below "Upgrade to Pro")
3. It will poll the backend for your license
4. If found, Pro will activate automatically!

## Option 2: Manual License Creation (If webhook didn't fire)

If the "Check for License" button doesn't work, use the manual method:

1. **Get your Customer ID from Stripe**:
   - Go to [Stripe Dashboard → Customers](https://dashboard.stripe.com/customers)
   - Find your latest payment
   - Click on the customer
   - Copy the Customer ID (starts with `cus_`)

2. **Create license manually**:
   ```
   https://focus-nudge-extension.onrender.com/api/debug/create-license?userId=fn_meibfhdipbiohpbijholkpdidigmehfc_1769065906226&customerId=YOUR_CUSTOMER_ID
   ```
   (Replace `YOUR_CUSTOMER_ID` with the one from Stripe)

3. **Refresh the Options page** - Should now show "Pro"!

## Option 3: Check Webhook Status

To see if the webhook fired:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click on your webhook endpoint
3. Check the "Events" tab
4. Look for `checkout.session.completed` event
5. Check Render logs to see if it was received

## Quick Test

Try the "Check for License" button first - it's the easiest! If that doesn't work within 20 seconds, use the manual method.
