# Focus Nudge Backend

Backend API for Stripe payment processing and license verification.

> **📖 For complete setup instructions, see [STRIPE_SETUP.md](../STRIPE_SETUP.md)**

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment (see STRIPE_SETUP.md for details)
cp .env.example .env
# Edit .env with your Stripe keys

# Run server
npm start
```

## Environment Variables

Required:
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
- `STRIPE_PRICE_ID` - Your Stripe Price ID (required)

Optional:
- `PORT` - Server port (default: 3000)
- `BACKEND_URL` - Backend URL (default: render.com URL)
- `NODE_ENV` - Environment (production/development)

## API Endpoints

See [STRIPE_SETUP.md](../STRIPE_SETUP.md#api-reference) for detailed API documentation.

- `GET /api/verify-license` - Verify Pro license
- `POST /api/create-checkout-session` - Create Stripe Checkout session
- `POST /api/create-portal-session` - Create Customer Portal session
- `POST /api/webhook` - Stripe webhook handler

## License Storage

### SQLite Database

The backend uses **SQLite** for persistent license storage:
- ✅ **File-based**: No separate database server needed
- ✅ **Persistent**: Survives server restarts
- ✅ **Fast**: Excellent performance for this use case
- ✅ **Simple**: Single file (`licenses.db`) in the backend directory
- ✅ **Production-ready**: Perfect for small to medium scale deployments

The database file (`licenses.db`) is automatically created on first run. It's included in `.gitignore` to prevent committing license data.

**For larger scale deployments**, you can migrate to PostgreSQL/MongoDB if needed, but SQLite should handle thousands of licenses efficiently.

## Production Considerations (Render Deployment)

### ✅ Already Handled
- **Backup**: Render automatically persists `licenses.db` on persistent disk
- **User ID**: Using stable Chrome extension ID (`fn_${extensionId}_${timestamp}`)
- **Monitoring**: Render provides built-in logging dashboard
- **Deployment**: Configured for Render

### 🔒 Security Features (Implemented)

✅ **Rate Limiting**: 
- General API routes: 100 requests per 15 minutes per IP
- Payment endpoints: 10 requests per 15 minutes per IP
- Webhook endpoint excluded (protected by Stripe signature verification)

✅ **CORS Restrictions**: 
- Only allows Chrome extension origins (`chrome-extension://*`)
- Allows backend URL for success/cancel pages
- Blocks all other origins

✅ **Webhook Security**: 
- Stripe signature verification (already implemented)
- Payment processing handled by Stripe (not your API)

**Optional Enhancement:**
- **Authentication**: Not critical since webhook has signature verification, Stripe handles payment auth, and license verification is read-only
