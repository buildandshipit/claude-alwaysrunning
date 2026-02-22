/**
 * Memory Store - SQLite-based persistent memory for Jarvis
 *
 * Stores conversations, messages, facts, and reminders
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

class MemoryStore {
  constructor(options = {}) {
    this.configDir = options.configDir || path.join(os.homedir(), '.claude-alwaysrunning');
    this.dbPath = options.dbPath || path.join(this.configDir, 'memory.db');

    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  initSchema() {
    this.db.exec(`
      -- Conversation sessions
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        summary TEXT
      );

      -- Individual messages
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      -- Long-term facts/preferences
      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fact TEXT,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Scheduled reminders
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        trigger_at DATETIME,
        cron_expression TEXT,
        channel TEXT DEFAULT 'notification',
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
      CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
      CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders(trigger_at);
    `);
  }

  // =========================================================================
  // Conversations
  // =========================================================================

  /**
   * Start a new conversation session
   */
  startConversation() {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO conversations (id) VALUES (?)
    `).run(id);
    return id;
  }

  /**
   * End a conversation session
   */
  endConversation(id, summary = null) {
    this.db.prepare(`
      UPDATE conversations SET ended_at = CURRENT_TIMESTAMP, summary = ? WHERE id = ?
    `).run(summary, id);
  }

  /**
   * Get conversation by ID
   */
  getConversation(id) {
    return this.db.prepare(`
      SELECT * FROM conversations WHERE id = ?
    `).get(id);
  }

  /**
   * Get recent conversations
   */
  getRecentConversations(limit = 10) {
    return this.db.prepare(`
      SELECT * FROM conversations ORDER BY started_at DESC LIMIT ?
    `).all(limit);
  }

  /**
   * Get conversation count
   */
  getConversationCount() {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM conversations`).get();
    return row.count;
  }

  // =========================================================================
  // Messages
  // =========================================================================

  /**
   * Add a message to a conversation
   */
  addMessage(conversationId, role, content) {
    const result = this.db.prepare(`
      INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)
    `).run(conversationId, role, content);
    return result.lastInsertRowid;
  }

  /**
   * Get messages for a conversation
   */
  getMessages(conversationId, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT ?
    `).all(conversationId, limit);
  }

  /**
   * Get recent messages across all conversations
   */
  getRecentMessages(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?
    `).all(limit);
  }

  /**
   * Get message count
   */
  getMessageCount() {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM messages`).get();
    return row.count;
  }

  // =========================================================================
  // Facts
  // =========================================================================

  /**
   * Add a fact/preference
   */
  addFact(fact, category = 'general') {
    const result = this.db.prepare(`
      INSERT INTO facts (fact, category) VALUES (?, ?)
    `).run(fact, category);
    return result.lastInsertRowid;
  }

  /**
   * Get all facts
   */
  getFacts(category = null) {
    if (category) {
      return this.db.prepare(`
        SELECT * FROM facts WHERE category = ? ORDER BY created_at DESC
      `).all(category);
    }
    return this.db.prepare(`
      SELECT * FROM facts ORDER BY created_at DESC
    `).all();
  }

  /**
   * Search facts
   */
  searchFacts(query) {
    return this.db.prepare(`
      SELECT * FROM facts WHERE fact LIKE ? ORDER BY created_at DESC
    `).all(`%${query}%`);
  }

  /**
   * Remove a fact
   */
  removeFact(id) {
    this.db.prepare(`DELETE FROM facts WHERE id = ?`).run(id);
  }

  /**
   * Get fact count
   */
  getFactCount() {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM facts`).get();
    return row.count;
  }

  // =========================================================================
  // Reminders
  // =========================================================================

  /**
   * Add a reminder
   */
  addReminder(message, triggerAt, cronExpression = null, channel = 'notification') {
    const result = this.db.prepare(`
      INSERT INTO reminders (message, trigger_at, cron_expression, channel)
      VALUES (?, ?, ?, ?)
    `).run(message, triggerAt, cronExpression, channel);
    return result.lastInsertRowid;
  }

  /**
   * Get pending reminders (one-time reminders that are due)
   */
  getDueReminders() {
    return this.db.prepare(`
      SELECT * FROM reminders
      WHERE status = 'pending'
        AND trigger_at IS NOT NULL
        AND datetime(trigger_at) <= datetime('now')
      ORDER BY trigger_at ASC
    `).all();
  }

  /**
   * Get all pending reminders
   */
  getPendingReminders() {
    return this.db.prepare(`
      SELECT * FROM reminders WHERE status = 'pending' ORDER BY trigger_at ASC
    `).all();
  }

  /**
   * Get recurring reminders (cron-based)
   */
  getRecurringReminders() {
    return this.db.prepare(`
      SELECT * FROM reminders
      WHERE status = 'pending' AND cron_expression IS NOT NULL
      ORDER BY created_at ASC
    `).all();
  }

  /**
   * Mark reminder as completed
   */
  completeReminder(id) {
    this.db.prepare(`
      UPDATE reminders SET status = 'completed' WHERE id = ?
    `).run(id);
  }

  /**
   * Cancel a reminder
   */
  cancelReminder(id) {
    this.db.prepare(`
      UPDATE reminders SET status = 'cancelled' WHERE id = ?
    `).run(id);
  }

  /**
   * Get reminder by ID
   */
  getReminder(id) {
    return this.db.prepare(`
      SELECT * FROM reminders WHERE id = ?
    `).get(id);
  }

  /**
   * Get reminder count
   */
  getReminderCount(status = 'pending') {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM reminders WHERE status = ?
    `).get(status);
    return row.count;
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      conversations: this.getConversationCount(),
      messages: this.getMessageCount(),
      facts: this.getFactCount(),
      reminders: {
        pending: this.getReminderCount('pending'),
        completed: this.getReminderCount('completed'),
        cancelled: this.getReminderCount('cancelled')
      }
    };
  }

  /**
   * Clear all memory
   */
  clearAll() {
    this.db.exec(`
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM facts;
      DELETE FROM reminders;
    `);
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton instance
let instance = null;

function getMemoryStore(options = {}) {
  if (!instance) {
    instance = new MemoryStore(options);
  }
  return instance;
}

module.exports = {
  MemoryStore,
  getMemoryStore
};
