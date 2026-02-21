/**
 * API Key Manager
 *
 * Handles generation, storage, and validation of API keys
 * for remote access authentication.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

class APIKeyManager {
  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.claude-alwaysrunning');
    this.keysFile = path.join(this.configDir, 'api-keys.json');
    this.keys = {};

    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Load existing keys
    this.load();
  }

  /**
   * Load keys from file
   */
  load() {
    try {
      if (fs.existsSync(this.keysFile)) {
        const data = fs.readFileSync(this.keysFile, 'utf8');
        this.keys = JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load API keys:', e.message);
      this.keys = {};
    }
  }

  /**
   * Save keys to file
   */
  save() {
    try {
      fs.writeFileSync(this.keysFile, JSON.stringify(this.keys, null, 2));
      // Restrict file permissions (owner read/write only)
      if (os.platform() !== 'win32') {
        fs.chmodSync(this.keysFile, 0o600);
      }
    } catch (e) {
      console.error('Failed to save API keys:', e.message);
    }
  }

  /**
   * Generate a new API key
   * @param {string} name - Human-readable name for the key
   * @returns {{name: string, key: string, created: string}}
   */
  generate(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Key name is required');
    }

    // Check for duplicate names
    if (this.keys[name]) {
      throw new Error(`Key with name "${name}" already exists`);
    }

    // Generate 64-character hex key
    const key = crypto.randomBytes(32).toString('hex');
    const created = new Date().toISOString();

    this.keys[name] = {
      // Store hash of key, not the key itself
      hash: this.hashKey(key),
      created,
      lastUsed: null
    };

    this.save();

    return { name, key, created };
  }

  /**
   * Hash a key for storage
   */
  hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Validate an API key
   * @param {string} key - The API key to validate
   * @returns {{valid: boolean, name?: string}}
   */
  validate(key) {
    if (!key || typeof key !== 'string') {
      return { valid: false };
    }

    const hash = this.hashKey(key);

    for (const [name, data] of Object.entries(this.keys)) {
      if (data.hash === hash) {
        // Update last used timestamp
        data.lastUsed = new Date().toISOString();
        this.save();

        return { valid: true, name };
      }
    }

    return { valid: false };
  }

  /**
   * List all keys (without the actual key values)
   * @returns {Array<{name: string, created: string, lastUsed: string|null}>}
   */
  list() {
    return Object.entries(this.keys).map(([name, data]) => ({
      name,
      created: data.created,
      lastUsed: data.lastUsed
    }));
  }

  /**
   * Remove a key by name
   * @param {string} name - Key name to remove
   * @returns {boolean} - True if removed, false if not found
   */
  remove(name) {
    if (this.keys[name]) {
      delete this.keys[name];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Check if any keys exist
   * @returns {boolean}
   */
  hasKeys() {
    return Object.keys(this.keys).length > 0;
  }

  /**
   * Get count of keys
   * @returns {number}
   */
  count() {
    return Object.keys(this.keys).length;
  }
}

// Singleton instance
let instance = null;

/**
 * Get the API key manager instance
 * @returns {APIKeyManager}
 */
function getAPIKeyManager() {
  if (!instance) {
    instance = new APIKeyManager();
  }
  return instance;
}

module.exports = {
  APIKeyManager,
  getAPIKeyManager
};
