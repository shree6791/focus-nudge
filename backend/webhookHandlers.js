// Webhook Handlers: Process Stripe webhook events
const { createLicense, findUserIdByCustomerId } = require('./licenseService');
const db = require('./database');

/**
 * Initialize webhook handlers with Stripe instance
 * @param {Object} stripeInstance - Initialized Stripe instance
 */
function initWebhookHandlers(stripeInstance) {

  /**
   * Handle checkout.session.completed event
   * Creates license when payment is completed
   */
  async function handleCheckoutCompleted(session) {
    const userId = session.client_reference_id || session.metadata?.userId;
    
    if (!userId || session.mode !== 'subscription') {
      return;
    }

    try {
      const subscription = await stripeInstance.subscriptions.retrieve(session.subscription);
      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;
      
      // Check if license already exists
      const existing = db.getLicenseByUserId(userId);
      if (existing && existing.status === 'active') {
        return;
      }
      
      createLicense(userId, customerId, subscription.id);
    } catch (error) {
      console.error(`[WEBHOOK] Error processing checkout.session.completed:`, error);
      throw error;
    }
  }

  /**
   * Handle subscription update/delete events
   * Updates license status based on subscription status
   */
  function handleSubscriptionUpdate(subscription) {
    const customerId = typeof subscription.customer === 'string' 
      ? subscription.customer 
      : subscription.customer.id;
    const userId = findUserIdByCustomerId(customerId);
    
    if (!userId) {
      console.warn(`[WEBHOOK] ⚠️ Subscription update for unknown customer: ${customerId}`);
      return;
    }
    
    const license = db.getLicenseByUserId(userId);
    if (!license) {
      return;
    }
    
    // Update license status based on subscription status
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    db.updateLicenseStatus(userId, isActive ? 'active' : 'canceled');
  }

  return {
    handleCheckoutCompleted,
    handleSubscriptionUpdate
  };
}

module.exports = { initWebhookHandlers };
