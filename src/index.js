/**
 * Claude Always Running - Main Module
 */

const { ClaudeService, getServiceStatus, stopService, DEFAULT_PORT } = require('./service');
const { ClaudeClient, runInteractive, sendCommand, showStatus } = require('./client');
const { WhatsAppBridge, runWhatsAppBridge } = require('./whatsapp-bridge');

module.exports = {
  ClaudeService,
  getServiceStatus,
  stopService,
  DEFAULT_PORT,
  ClaudeClient,
  runInteractive,
  sendCommand,
  showStatus,
  WhatsAppBridge,
  runWhatsAppBridge
};
