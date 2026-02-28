/**
 * Claude Always Running - Main Module
 */

const { ClaudeService, getServiceStatus, stopService, DEFAULT_PORT } = require('./service');
const { ClaudeClient, runInteractive, sendCommand, showStatus } = require('./client');
const { WhatsAppBridge, runWhatsAppBridge } = require('./whatsapp-bridge');
const { VoiceBridge, runVoiceBridge } = require('./voice-bridge');
const { APIKeyManager, getAPIKeyManager } = require('./auth');
const providers = require('./providers');

// Jarvis features
const { MemoryStore, getMemoryStore, ContextBuilder, getContextBuilder } = require('./memory');
const { SchedulerManager, getSchedulerManager, parseTime, parseCronPattern, parseRelativeTime, parseReminderTime, isValidCron } = require('./scheduler');
const { AlertChannels, getAlertChannels } = require('./alerts');
const { TriggerService, getTriggerService, resetTriggerService } = require('./triggers');

module.exports = {
  // Service
  ClaudeService,
  getServiceStatus,
  stopService,
  DEFAULT_PORT,

  // Client
  ClaudeClient,
  runInteractive,
  sendCommand,
  showStatus,

  // Bridges
  WhatsAppBridge,
  runWhatsAppBridge,
  VoiceBridge,
  runVoiceBridge,

  // Auth
  APIKeyManager,
  getAPIKeyManager,

  // Providers
  ...providers,

  // Memory
  MemoryStore,
  getMemoryStore,
  ContextBuilder,
  getContextBuilder,

  // Scheduler
  SchedulerManager,
  getSchedulerManager,
  parseTime,
  parseCronPattern,
  parseRelativeTime,
  parseReminderTime,
  isValidCron,

  // Alerts
  AlertChannels,
  getAlertChannels,

  // Triggers
  TriggerService,
  getTriggerService,
  resetTriggerService
};
