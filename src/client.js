/**
 * Claude Always Running - Client
 *
 * Connect to the running Claude service to:
 * - Send commands
 * - Receive responses
 * - Interactive session
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULT_PORT } = require('./service');

class ClaudeClient {
  constructor(options = {}) {
    this.port = options.port || this.getServicePort() || DEFAULT_PORT;
    this.host = '127.0.0.1';
    this.socket = null;
    this.connected = false;
    this.buffer = '';
    this.outputHandler = null;
    this.pendingResolve = null;
  }

  /**
   * Get port from service file
   */
  getServicePort() {
    const portFile = path.join(os.homedir(), '.claude-alwaysrunning', 'service.port');
    try {
      if (fs.existsSync(portFile)) {
        return parseInt(fs.readFileSync(portFile, 'utf8'));
      }
    } catch (e) {}
    return null;
  }

  /**
   * Connect to service
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port: this.port, host: this.host });

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.socket.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.connected = true;
        resolve();
      });

      this.socket.on('data', (data) => this.handleData(data));

      this.socket.on('close', () => {
        this.connected = false;
        if (this.onDisconnect) this.onDisconnect();
      });

      this.socket.on('error', (err) => {
        if (!this.connected) reject(err);
      });
    });
  }

  /**
   * Handle incoming data
   */
  handleData(data) {
    this.buffer += data.toString();

    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const msg = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);

      try {
        this.handleMessage(JSON.parse(msg));
      } catch (e) {}
    }
  }

  /**
   * Handle parsed message
   */
  handleMessage(msg) {
    if (msg.type === 'output' && this.outputHandler) {
      this.outputHandler(msg.data);
    }

    if (this.pendingResolve && (msg.type === this.pendingType || this.pendingType === '*')) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingType = null;
      resolve(msg);
    }

    if (msg.type === 'shutdown') {
      console.log('\nService shutting down...');
      this.disconnect();
    }
  }

  /**
   * Send message
   */
  send(msg) {
    if (!this.connected) throw new Error('Not connected');
    this.socket.write(JSON.stringify(msg) + '\n');
  }

  /**
   * Send and wait for response
   */
  sendAndWait(msg, type = '*', timeout = 30000) {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingType = type;
      this.send(msg);

      setTimeout(() => {
        if (this.pendingResolve) {
          this.pendingResolve = null;
          reject(new Error('Response timeout'));
        }
      }, timeout);
    });
  }

  /**
   * Send raw input to Claude (for interactive mode)
   */
  sendInput(data) {
    this.send({ type: 'input', data: data });
  }

  /**
   * Send command to Claude (adds newline)
   */
  sendCommand(command) {
    this.send({ type: 'command', data: command });
  }

  /**
   * Get status
   */
  getStatus() {
    return this.sendAndWait({ type: 'status' }, 'status');
  }

  /**
   * Get output history
   */
  getHistory(limit = 100) {
    return this.sendAndWait({ type: 'history', limit }, 'history');
  }

  /**
   * Resize terminal
   */
  resize(cols, rows) {
    this.send({ type: 'resize', cols, rows });
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
  }
}

/**
 * Interactive session
 */
async function runInteractive(options = {}) {
  const client = new ClaudeClient(options);

  try {
    console.log(`Connecting to Claude service on port ${client.port}...`);
    await client.connect();
    console.log('Connected! Press Ctrl+C to disconnect.\n');

    // Output handler
    client.outputHandler = (data) => process.stdout.write(data);

    // Input handler - raw mode sends keystrokes directly
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      if (data.length === 1 && data[0] === 3) { // Ctrl+C
        console.log('\nDisconnecting...');
        process.stdin.setRawMode(false);
        client.disconnect();
        process.exit(0);
      }
      // Send raw input without modification
      client.sendInput(data.toString());
    });

    // Resize handler
    process.stdout.on('resize', () => {
      client.resize(process.stdout.columns, process.stdout.rows);
    });
    client.resize(process.stdout.columns || 80, process.stdout.rows || 24);

    // Get history
    const history = await client.getHistory(50);
    if (history.data) process.stdout.write(history.data);

    // Disconnect handler
    client.onDisconnect = () => {
      console.log('\nDisconnected.');
      process.exit(0);
    };

  } catch (err) {
    console.error(`Failed to connect: ${err.message}`);
    console.log('\nStart the service with: claude-always start');
    process.exit(1);
  }
}

/**
 * Send single command
 */
async function sendCommand(command, options = {}) {
  const client = new ClaudeClient(options);
  const waitTime = options.wait ? parseInt(options.wait) * 1000 : 5000; // Default 5s
  const noWait = options.wait === '0' || options.wait === 0;

  try {
    await client.connect();

    let lastOutputTime = Date.now();
    let outputReceived = false;

    // Always show output
    client.outputHandler = (data) => {
      process.stdout.write(data);
      lastOutputTime = Date.now();
      outputReceived = true;
    };

    // Send the command
    client.sendCommand(command);

    if (noWait) {
      // Just send and exit
      await new Promise(r => setTimeout(r, 100));
      client.disconnect();
      return;
    }

    // Wait for response, exit when output stops for 2 seconds
    const checkInterval = setInterval(() => {
      const silenceTime = Date.now() - lastOutputTime;

      // If we got output and it's been quiet for 2s, we're done
      if (outputReceived && silenceTime > 2000) {
        clearInterval(checkInterval);
        console.log(''); // New line at end
        client.disconnect();
        process.exit(0);
      }
    }, 500);

    // Max wait time as fallback
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log(''); // New line at end
      client.disconnect();
      process.exit(0);
    }, waitTime);

    // Keep process alive
    await new Promise(() => {});

  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.log('Start the service with: claude-always start');
    process.exit(1);
  }
}

/**
 * Show status
 */
async function showStatus(options = {}) {
  const client = new ClaudeClient(options);

  try {
    await client.connect();
    const status = await client.getStatus();

    console.log('Claude Always Running - Status');
    console.log('==============================');
    console.log(`Running: ${status.running ? 'Yes' : 'No'}`);
    console.log(`PID: ${status.pid}`);
    console.log(`Port: ${status.port}`);
    console.log(`Connected clients: ${status.clients}`);
    if (status.restarts > 0) {
      console.log(`Restarts: ${status.restarts}`);
    }

    client.disconnect();

  } catch (err) {
    console.log('Claude Always Running - Status');
    console.log('==============================');
    console.log('Running: No');
    console.log('\nStart with: claude-always start');
  }
}

module.exports = {
  ClaudeClient,
  runInteractive,
  sendCommand,
  showStatus
};
