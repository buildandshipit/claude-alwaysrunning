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
const { spawn } = require('child_process');
const { DEFAULT_PORT } = require('./service');

class ClaudeClient {
  constructor(options = {}) {
    this.port = options.port || this.getServicePort() || DEFAULT_PORT;
    this.host = options.host || '127.0.0.1';
    this.apiKey = options.apiKey || null;
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
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
        // Don't resolve yet if we need to authenticate
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();

        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
          const msg = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 1);

          try {
            const parsed = JSON.parse(msg);

            // Handle auth_required
            if (parsed.type === 'auth_required') {
              if (this.apiKey) {
                this.send({ type: 'auth', key: this.apiKey });
              } else {
                reject(new Error('Authentication required. Provide apiKey option.'));
                this.disconnect();
                return;
              }
            }
            // Handle auth_failed
            else if (parsed.type === 'auth_failed') {
              reject(new Error('Authentication failed: ' + parsed.message));
              this.disconnect();
              return;
            }
            // Handle connected (authenticated or local)
            else if (parsed.type === 'connected') {
              this.authenticated = true;
              resolve();
            }
            // Handle other messages
            else {
              this.handleMessage(parsed);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.authenticated = false;
        if (this.onDisconnect) this.onDisconnect();
      });

      this.socket.on('error', (err) => {
        if (!this.connected) reject(err);
      });
    });
  }

  /**
   * Handle incoming data (used after connection is established)
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
   * Setup data handler after successful connection
   */
  setupDataHandler() {
    // Replace the connect data handler with the regular one
    this.socket.removeAllListeners('data');
    this.socket.on('data', (data) => this.handleData(data));
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
    const hostInfo = client.host !== '127.0.0.1' ? `${client.host}:${client.port}` : `port ${client.port}`;
    console.log(`Connecting to Claude service on ${hostInfo}...`);
    await client.connect();
    client.setupDataHandler();
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
 * Send single command using claude --print for clean output
 */
async function sendCommand(command, options = {}) {
  const maxTimeout = options.max ? parseInt(options.max) * 1000 : 300000; // 5 min max
  const outputFormat = options.json ? 'json' : 'text';

  return new Promise((resolve, reject) => {
    // Escape the command for shell - wrap in quotes and escape internal quotes
    const escapedCommand = command.replace(/"/g, '\\"');
    const fullCommand = `claude --print --dangerously-skip-permissions --output-format ${outputFormat} "${escapedCommand}"`;

    const claude = spawn(fullCommand, [], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        console.error(stderr);
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    claude.on('error', (err) => {
      reject(err);
    });

    // Safety timeout
    setTimeout(() => {
      claude.kill();
      console.log('\n[Max timeout reached]');
      resolve({ stdout, stderr, timeout: true });
    }, maxTimeout);
  });
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
