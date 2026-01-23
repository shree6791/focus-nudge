// License Service: Centralized license management logic
// Handles license creation, validation, and storage

const db = require('./database');

/**
 * Generate a unique license key
 * @returns {string} License key in format: fn_timestamp_random
 */
function generateLicenseKey() {
  return `fn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a license entry
 * @param {string} userId - User identifier
 * @param {string} customerId - Stripe customer ID
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {string} Generated license key
 */
function createLicense(userId, customerId, subscriptionId) {
  const licenseKey = generateLicenseKey();
  db.upsertLicense(userId, licenseKey, customerId, subscriptionId, 'active');
  return licenseKey;
}

/**
 * Find user ID by Stripe customer ID
 * @param {string} customerId - Stripe customer ID
 * @returns {string|null} User ID if found, null otherwise
 */
function findUserIdByCustomerId(customerId) {
  return db.getUserIdByCustomerId(customerId);
}

/**
 * Validate license status
 * @param {Object} license - License object
 * @returns {boolean} True if license is valid and active
 */
function isValidLicense(license) {
  if (!license || license.status !== 'active') {
    return false;
  }
  
  // Check expiration if set
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    return false;
  }
  
  return true;
}

module.exports = {
  generateLicenseKey,
  createLicense,
  findUserIdByCustomerId,
  isValidLicense
};
