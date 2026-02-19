/**
 * Claude Always Running - Main Module
 */

const { ClaudeService, getServiceStatus, stopService, DEFAULT_PORT } = require('./service');
const { ClaudeClient, runInteractive, sendCommand, showStatus } = require('./client');

module.exports = {
  ClaudeService,
  getServiceStatus,
  stopService,
  DEFAULT_PORT,
  ClaudeClient,
  runInteractive,
  sendCommand,
  showStatus
};
