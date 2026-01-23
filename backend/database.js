// Database Service: SQLite-based license storage
// Provides persistent storage that survives server restarts

const Database = require('better-sqlite3');
const path = require('path');

// Database file location (in backend directory)
const DB_PATH = path.join(__dirname, 'licenses.db');

// Initialize database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

/**
 * Initialize database schema
 */
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      userId TEXT PRIMARY KEY,
      licenseKey TEXT NOT NULL UNIQUE,
      stripeCustomerId TEXT NOT NULL,
      stripeSubscriptionId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expiresAt INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_customer_id ON licenses(stripeCustomerId);
    CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(licenseKey);
    CREATE INDEX IF NOT EXISTS idx_status ON licenses(status);
  `);
}

// Initialize on module load
initDatabase();

/**
 * Get license by userId
 * @param {string} userId
 * @returns {Object|null} License object or null
 */
function getLicenseByUserId(userId) {
  const stmt = db.prepare('SELECT * FROM licenses WHERE userId = ?');
  const row = stmt.get(userId);
  return row ? rowToLicense(row) : null;
}

/**
 * Get license by licenseKey
 * @param {string} licenseKey
 * @returns {Object|null} License object or null
 */
function getLicenseByLicenseKey(licenseKey) {
  const stmt = db.prepare('SELECT * FROM licenses WHERE licenseKey = ?');
  const row = stmt.get(licenseKey);
  return row ? rowToLicense(row) : null;
}

/**
 * Get userId by Stripe customer ID
 * @param {string} customerId
 * @returns {string|null} UserId or null
 */
function getUserIdByCustomerId(customerId) {
  const stmt = db.prepare('SELECT userId FROM licenses WHERE stripeCustomerId = ? LIMIT 1');
  const row = stmt.get(customerId);
  return row ? row.userId : null;
}

/**
 * Create or update license
 * @param {string} userId
 * @param {string} licenseKey
 * @param {string} customerId
 * @param {string} subscriptionId
 * @param {string} status - 'active' or 'canceled'
 * @returns {Object} License object
 */
function upsertLicense(userId, licenseKey, customerId, subscriptionId, status = 'active') {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO licenses (userId, licenseKey, stripeCustomerId, stripeSubscriptionId, status, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      licenseKey = excluded.licenseKey,
      stripeCustomerId = excluded.stripeCustomerId,
      stripeSubscriptionId = excluded.stripeSubscriptionId,
      status = excluded.status,
      updatedAt = excluded.updatedAt
  `);
  
  stmt.run(userId, licenseKey, customerId, subscriptionId, status, now);
  
  return getLicenseByUserId(userId);
}

/**
 * Update license status
 * @param {string} userId
 * @param {string} status
 */
function updateLicenseStatus(userId, status) {
  const now = Math.floor(Date.now() / 1000);
  const stmt = db.prepare('UPDATE licenses SET status = ?, updatedAt = ? WHERE userId = ?');
  stmt.run(status, now, userId);
}

/**
 * Get all licenses (for debugging)
 * @returns {Array} Array of objects with userId and license data
 */
function getAllLicenses() {
  const stmt = db.prepare('SELECT * FROM licenses ORDER BY createdAt DESC');
  const rows = stmt.all();
  return rows.map(row => ({
    userId: row.userId,
    ...rowToLicense(row)
  }));
}

/**
 * Get license count
 * @returns {number}
 */
function getLicenseCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM licenses');
  return stmt.get().count;
}

/**
 * Convert database row to license object
 * @param {Object} row
 * @returns {Object}
 */
function rowToLicense(row) {
  return {
    licenseKey: row.licenseKey,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    status: row.status,
    expiresAt: row.expiresAt ? new Date(row.expiresAt * 1000) : null,
  };
}

/**
 * Close database connection (for graceful shutdown)
 */
function close() {
  db.close();
}

module.exports = {
  getLicenseByUserId,
  getLicenseByLicenseKey,
  getUserIdByCustomerId,
  upsertLicense,
  updateLicenseStatus,
  getAllLicenses,
  getLicenseCount,
  close,
};
