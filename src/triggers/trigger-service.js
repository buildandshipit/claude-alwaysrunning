/**
 * TriggerService - Generic periodic job scheduler
 *
 * A hybrid scheduler that manages timing + handlers + metadata.
 * Supports both interval-based and cron-based scheduling.
 *
 * Features:
 * - Named jobs with configurable intervals
 * - Job metadata tracking (runCount, lastRun, errors)
 * - Lifecycle events for observability
 * - Start/stop individual jobs or all jobs
 * - Async handler support
 *
 * Usage:
 *   const { getTriggerService } = require('./triggers');
 *   const triggers = getTriggerService();
 *
 *   triggers.register('session-save', {
 *     interval: 60 * 60 * 1000,  // 1 hour
 *     handler: () => sessionManager.save(),
 *     immediate: true
 *   });
 *
 *   triggers.on('jobComplete', ({ name, duration }) => {
 *     console.log(`${name} completed in ${duration}ms`);
 *   });
 */

const EventEmitter = require('events');

class TriggerService extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.started = false;
  }

  /**
   * Register a periodic job
   * @param {string} name - Unique job identifier
   * @param {object} options - Job configuration
   * @param {number} options.interval - Interval in milliseconds
   * @param {function} options.handler - Function to execute (can be async)
   * @param {boolean} [options.immediate=false] - Run immediately on register
   * @param {boolean} [options.enabled=true] - Start enabled
   * @param {string} [options.description] - Human-readable description
   * @returns {TriggerService} - Returns this for chaining
   */
  register(name, { interval, handler, immediate = false, enabled = true, description = '' }) {
    if (this.jobs.has(name)) {
      throw new Error(`Job "${name}" already registered`);
    }

    if (typeof interval !== 'number' || interval <= 0) {
      throw new Error(`Invalid interval for job "${name}": must be a positive number`);
    }

    if (typeof handler !== 'function') {
      throw new Error(`Invalid handler for job "${name}": must be a function`);
    }

    const job = {
      name,
      interval,
      handler,
      description,
      enabled,
      timer: null,
      runCount: 0,
      lastRun: null,
      lastDuration: null,
      lastError: null,
      createdAt: Date.now(),
    };

    this.jobs.set(name, job);

    if (enabled && this.started) {
      this._startJob(job, immediate);
    }

    this.emit('registered', { name, interval, description });
    return this;
  }

  /**
   * Start the trigger service (enables all registered jobs)
   */
  start() {
    if (this.started) return;

    this.started = true;

    for (const job of this.jobs.values()) {
      if (job.enabled && !job.timer) {
        this._startJob(job, false);
      }
    }

    this.emit('started', { jobCount: this.jobs.size });
  }

  /**
   * Internal: Start a single job's timer
   */
  _startJob(job, immediate = false) {
    if (job.timer) {
      clearInterval(job.timer);
    }

    if (immediate) {
      // Run immediately but don't block
      setImmediate(() => this._executeJob(job));
    }

    job.timer = setInterval(() => {
      this._executeJob(job);
    }, job.interval);

    // Don't block Node.js exit
    job.timer.unref();
  }

  /**
   * Internal: Execute a job and track metadata
   */
  async _executeJob(job) {
    const startTime = Date.now();

    this.emit('jobStart', {
      name: job.name,
      time: startTime,
      runCount: job.runCount,
    });

    try {
      await job.handler();

      job.runCount++;
      job.lastRun = startTime;
      job.lastDuration = Date.now() - startTime;
      job.lastError = null;

      this.emit('jobComplete', {
        name: job.name,
        duration: job.lastDuration,
        runCount: job.runCount,
      });

    } catch (error) {
      job.lastRun = startTime;
      job.lastDuration = Date.now() - startTime;
      job.lastError = {
        message: error.message,
        stack: error.stack,
        time: startTime,
      };

      this.emit('jobError', {
        name: job.name,
        error,
        runCount: job.runCount,
      });
    }
  }

  /**
   * Stop a specific job
   * @param {string} name - Job name
   */
  stop(name) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" not found`);
    }

    if (job.timer) {
      clearInterval(job.timer);
      job.timer = null;
    }
    job.enabled = false;

    this.emit('jobStopped', { name });
  }

  /**
   * Start a previously stopped job
   * @param {string} name - Job name
   * @param {boolean} [immediate=false] - Run immediately
   */
  startJob(name, immediate = false) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" not found`);
    }

    if (job.enabled && job.timer) {
      return; // Already running
    }

    job.enabled = true;

    if (this.started) {
      this._startJob(job, immediate);
    }

    this.emit('jobStarted', { name });
  }

  /**
   * Unregister a job completely
   * @param {string} name - Job name
   */
  unregister(name) {
    const job = this.jobs.get(name);
    if (!job) {
      return false;
    }

    if (job.timer) {
      clearInterval(job.timer);
    }

    this.jobs.delete(name);
    this.emit('unregistered', { name });
    return true;
  }

  /**
   * Update a job's interval
   * @param {string} name - Job name
   * @param {number} newInterval - New interval in milliseconds
   */
  updateInterval(name, newInterval) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" not found`);
    }

    if (typeof newInterval !== 'number' || newInterval <= 0) {
      throw new Error('Invalid interval: must be a positive number');
    }

    const oldInterval = job.interval;
    job.interval = newInterval;

    // Restart if running
    if (job.enabled && job.timer && this.started) {
      this._startJob(job, false);
    }

    this.emit('intervalUpdated', { name, oldInterval, newInterval });
  }

  /**
   * Trigger a job immediately (outside of schedule)
   * @param {string} name - Job name
   */
  async trigger(name) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" not found`);
    }

    await this._executeJob(job);
  }

  /**
   * Get status of a specific job
   * @param {string} name - Job name
   * @returns {object|null} - Job status or null if not found
   */
  getStatus(name) {
    const job = this.jobs.get(name);
    if (!job) return null;

    return {
      name: job.name,
      description: job.description,
      enabled: job.enabled,
      running: !!job.timer,
      interval: job.interval,
      intervalHuman: this._formatInterval(job.interval),
      runCount: job.runCount,
      lastRun: job.lastRun ? new Date(job.lastRun).toISOString() : null,
      lastDuration: job.lastDuration,
      lastError: job.lastError ? job.lastError.message : null,
      nextRun: this._getNextRun(job),
      createdAt: new Date(job.createdAt).toISOString(),
    };
  }

  /**
   * Get status of all jobs
   * @returns {object} - Map of job name to status
   */
  getAllStatus() {
    const status = {};
    for (const name of this.jobs.keys()) {
      status[name] = this.getStatus(name);
    }
    return status;
  }

  /**
   * Get a summary report of all jobs
   * @returns {object} - Summary with stats and job details
   */
  getReport() {
    const jobs = Array.from(this.jobs.values());

    return {
      summary: {
        total: jobs.length,
        enabled: jobs.filter(j => j.enabled).length,
        running: jobs.filter(j => j.timer).length,
        healthy: jobs.filter(j => !j.lastError).length,
        errored: jobs.filter(j => j.lastError).length,
        totalRuns: jobs.reduce((sum, j) => sum + j.runCount, 0),
      },
      jobs: this.getAllStatus(),
    };
  }

  /**
   * Stop all jobs
   */
  stopAll() {
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
      job.enabled = false;
    }

    this.started = false;
    this.emit('stoppedAll', { jobCount: this.jobs.size });
  }

  /**
   * Shutdown the service (stop all and clear)
   */
  shutdown() {
    this.stopAll();
    this.jobs.clear();
    this.emit('shutdown');
  }

  /**
   * Internal: Calculate next run time
   */
  _getNextRun(job) {
    if (!job.enabled || !job.timer) {
      return null;
    }

    const baseTime = job.lastRun || job.createdAt;
    const nextRun = new Date(baseTime + job.interval);

    // If next run is in the past, calculate from now
    if (nextRun.getTime() < Date.now()) {
      return new Date(Date.now() + job.interval).toISOString();
    }

    return nextRun.toISOString();
  }

  /**
   * Internal: Format interval as human-readable string
   */
  _formatInterval(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton TriggerService instance
 * @returns {TriggerService}
 */
function getTriggerService() {
  if (!instance) {
    instance = new TriggerService();
  }
  return instance;
}

/**
 * Reset the singleton (mainly for testing)
 */
function resetTriggerService() {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}

module.exports = {
  TriggerService,
  getTriggerService,
  resetTriggerService,
};
