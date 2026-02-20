/**
 * Claude Always Running - WhatsApp Bridge
 *
 * Connects WhatsApp (via whatsapp-web.js) to Claude.
 * Listens for messages in self-chat and responds via Claude.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

class WhatsAppBridge {
  constructor(options = {}) {
    this.sessionDir = path.join(os.homedir(), '.claude-alwaysrunning', 'whatsapp-session');
    this.client = null;
    this.ready = false;
    this.processing = false;
    this.myNumber = null;
    this.maxTimeout = options.maxTimeout || 300000; // 5 minutes
    this.groupName = options.groupName || 'claudebot'; // Target group name
    this.sentMessages = new Set(); // Track messages we've sent to avoid loops
  }

  /**
   * Start the WhatsApp bridge
   */
  async start() {
    // Ensure session directory exists
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    console.log('Starting WhatsApp Bridge...');
    console.log('Session will be stored in:', this.sessionDir);
    console.log('');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.sessionDir
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    // QR Code handler
    this.client.on('qr', (qr) => {
      console.log('Scan this QR code with WhatsApp:');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
      console.log('Open WhatsApp > Settings > Linked Devices > Link a Device');
    });

    // Ready handler
    this.client.on('ready', async () => {
      this.ready = true;
      const info = this.client.info;
      this.myNumber = info.wid.user;
      console.log('');
      console.log('WhatsApp Bridge connected!');
      console.log(`Logged in as: ${info.pushname} (${this.myNumber})`);
      console.log(`Listening for messages in group: "${this.groupName}"`);
      console.log('');
      console.log('Create a group named "' + this.groupName + '" and send messages there.');
      console.log('Press Ctrl+C to stop.');
      console.log('');
    });

    // Message handler - message_create catches all messages including own
    this.client.on('message_create', async (message) => {
      await this.handleMessage(message);
    });

    // Disconnected handler
    this.client.on('disconnected', (reason) => {
      console.log('WhatsApp disconnected:', reason);
      this.ready = false;
    });

    // Auth failure handler
    this.client.on('auth_failure', (msg) => {
      console.error('WhatsApp auth failed:', msg);
    });

    // Catch any errors
    this.client.on('error', (err) => {
      console.error('[Error]', err);
    });

    // Initialize
    await this.client.initialize();
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message) {
    const chat = await message.getChat();

    // Skip messages we sent (bot responses) - check both tracked IDs and fromMe while processing
    if (this.sentMessages.has(message.id._serialized)) {
      return;
    }

    // Skip own messages while we're processing (prevents loops)
    if (message.fromMe && this.processing) {
      return;
    }

    // Only process messages from the target group
    if (!chat.isGroup || chat.name.toLowerCase() !== this.groupName.toLowerCase()) {
      return;
    }

    // Skip if we're already processing
    if (this.processing) {
      console.log('[Skipped] Already processing a message');
      return;
    }

    // Skip status updates and media-only messages
    if (message.isStatus || (!message.body && !message.hasMedia)) {
      return;
    }

    const text = message.body.trim();
    if (!text) return;

    console.log(`[Received] ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

    this.processing = true;

    try {
      const response = await this.sendToClaude(text);

      if (response) {
        // WhatsApp has message length limits, split if needed
        const chunks = this.splitMessage(response, 4000);

        for (const chunk of chunks) {
          const sent = await chat.sendMessage(chunk);
          this.sentMessages.add(sent.id._serialized);
        }

        console.log(`[Replied] ${response.substring(0, 50)}${response.length > 50 ? '...' : ''}`);
      }
    } catch (err) {
      console.error('[Error]', err.message);
      const errMsg = await chat.sendMessage(`Error: ${err.message}`);
      this.sentMessages.add(errMsg.id._serialized);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Send message to Claude and get response
   */
  sendToClaude(text) {
    return new Promise((resolve, reject) => {
      const escapedText = text.replace(/"/g, '\\"');
      const command = `claude --print --dangerously-skip-permissions "${escapedText}"`;

      const claude = spawn(command, [], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      claude.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      claude.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Claude exited with code ${code}`));
        }
      });

      claude.on('error', (err) => {
        reject(err);
      });

      // Timeout
      setTimeout(() => {
        claude.kill();
        reject(new Error('Claude timeout'));
      }, this.maxTimeout);
    });
  }

  /**
   * Split long messages into chunks
   */
  splitMessage(text, maxLength) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at newline or space
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
  }

  /**
   * Stop the bridge
   */
  async stop() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
      this.ready = false;
    }
  }
}

/**
 * Run the WhatsApp bridge
 */
async function runWhatsAppBridge(options = {}) {
  const bridge = new WhatsAppBridge(options);

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\nStopping WhatsApp Bridge...');
    await bridge.stop();
    process.exit(0);
  });

  try {
    await bridge.start();
  } catch (err) {
    console.error('Failed to start WhatsApp Bridge:', err.message);
    process.exit(1);
  }
}

module.exports = {
  WhatsAppBridge,
  runWhatsAppBridge
};
