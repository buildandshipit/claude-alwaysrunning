/**
 * Scheduler Manager - Manage cron jobs and reminders
 *
 * Features:
 * - Check for due reminders every minute
 * - Run recurring cron-based reminders
 * - Trigger alerts via configured channels
 */

const cron = require('node-cron');
const { getMemoryStore } = require('../memory');
const { parseReminderTime, isValidCron } = require('./parser');

class SchedulerManager {
  constructor(options = {}) {
    this.store = options.store || getMemoryStore();
    this.alertHandler = options.alertHandler || null;
    this.checkInterval = options.checkInterval || 60000; // 1 minute

    // Active cron jobs for recurring reminders
    this.cronJobs = new Map();

    // Main check interval
    this.mainInterval = null;

    // Running state
    this.running = false;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.log('Scheduler started');

    // Start main check interval for one-time reminders
    this.mainInterval = setInterval(() => {
      this.checkDueReminders();
    }, this.checkInterval);

    // Do an immediate check
    this.checkDueReminders();

    // Set up recurring reminders
    this.setupRecurringReminders();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Clear main interval
    if (this.mainInterval) {
      clearInterval(this.mainInterval);
      this.mainInterval = null;
    }

    // Stop all cron jobs
    for (const [id, job] of this.cronJobs) {
      job.stop();
    }
    this.cronJobs.clear();

    this.log('Scheduler stopped');
  }

  /**
   * Check for due one-time reminders
   */
  async checkDueReminders() {
    try {
      const dueReminders = this.store.getDueReminders();

      for (const reminder of dueReminders) {
        await this.triggerReminder(reminder);
        this.store.completeReminder(reminder.id);
      }
    } catch (err) {
      this.log(`Error checking reminders: ${err.message}`);
    }
  }

  /**
   * Set up cron jobs for recurring reminders
   */
  setupRecurringReminders() {
    const recurring = this.store.getRecurringReminders();

    for (const reminder of recurring) {
      this.scheduleRecurring(reminder);
    }
  }

  /**
   * Schedule a recurring reminder
   */
  scheduleRecurring(reminder) {
    if (!reminder.cron_expression || !isValidCron(reminder.cron_expression)) {
      this.log(`Invalid cron expression for reminder ${reminder.id}`);
      return;
    }

    // Don't schedule if already exists
    if (this.cronJobs.has(reminder.id)) {
      return;
    }

    try {
      const job = cron.schedule(reminder.cron_expression, () => {
        this.triggerReminder(reminder);
      });

      this.cronJobs.set(reminder.id, job);
      this.log(`Scheduled recurring reminder ${reminder.id}: "${reminder.message}"`);
    } catch (err) {
      this.log(`Failed to schedule reminder ${reminder.id}: ${err.message}`);
    }
  }

  /**
   * Trigger a reminder alert
   */
  async triggerReminder(reminder) {
    this.log(`Triggering reminder: "${reminder.message}"`);

    if (this.alertHandler) {
      try {
        await this.alertHandler(reminder);
      } catch (err) {
        this.log(`Alert handler error: ${err.message}`);
      }
    }
  }

  /**
   * Add a new reminder
   * @param {string} message - Reminder message
   * @param {string} timeSpec - Time specification (natural language or cron)
   * @param {string} channel - Alert channel
   * @returns {Object} Created reminder info
   */
  addReminder(message, timeSpec, channel = 'notification') {
    const parsed = parseReminderTime(timeSpec);

    if (!parsed) {
      throw new Error(`Could not parse time: "${timeSpec}"`);
    }

    let id;

    if (parsed.type === 'recurring') {
      // Cron-based recurring reminder
      id = this.store.addReminder(message, null, parsed.cron, channel);

      // Schedule immediately if running
      if (this.running) {
        const reminder = this.store.getReminder(id);
        this.scheduleRecurring(reminder);
      }

      return {
        id,
        type: 'recurring',
        message,
        cron: parsed.cron,
        description: parsed.description,
        channel
      };
    } else {
      // One-time reminder
      const triggerAt = parsed.date.toISOString();
      id = this.store.addReminder(message, triggerAt, null, channel);

      return {
        id,
        type: 'once',
        message,
        triggerAt: parsed.date,
        channel
      };
    }
  }

  /**
   * Cancel a reminder
   */
  cancelReminder(id) {
    // Stop cron job if recurring
    const job = this.cronJobs.get(id);
    if (job) {
      job.stop();
      this.cronJobs.delete(id);
    }

    this.store.cancelReminder(id);
    this.log(`Cancelled reminder ${id}`);
  }

  /**
   * List pending reminders
   */
  listReminders() {
    return this.store.getPendingReminders();
  }

  /**
   * Set alert handler function
   */
  setAlertHandler(handler) {
    this.alertHandler = handler;
  }

  /**
   * Log message
   */
  log(message) {
    console.log(`[Scheduler] ${message}`);
  }
}

// Singleton instance
let instance = null;

function getSchedulerManager(options = {}) {
  if (!instance) {
    instance = new SchedulerManager(options);
  }
  return instance;
}

module.exports = {
  SchedulerManager,
  getSchedulerManager
};
