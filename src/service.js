/**
 * Claude Always Running - Service Daemon
 *
 * Runs Claude Code as a persistent background service with:
 * - Auto-restart on crash
 * - TCP socket for receiving commands
 * - Response streaming to connected clients
 */

const net = require('net');
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PORT = 3377;
const RESTART_DELAY = 2000;
const MAX_RESTART_ATTEMPTS = 10;
const RESTART_RESET_TIME = 60000;

class ClaudeService {
  constructor(options = {}) {
    this.port = options.port || DEFAULT_PORT;
    this.configDir = path.join(os.homedir(), '.claude-alwaysrunning');

    // State
    this.ptyProcess = null;
    this.server = null;
    this.clients = new Map();
    this.clientIdCounter = 0;
    this.outputBuffer = [];
    this.maxBufferSize = 500;
    this.restartAttempts = 0;
    this.lastRestartTime = 0;
    this.isShuttingDown = false;

    // Claude ready state (wait for startup to complete)
    this.claudeReady = false;
    this.lastOutputTime = 0;
    this.commandQueue = [];
    this.readyCheckInterval = null;

    // Files
    this.pidFile = path.join(this.configDir, 'service.pid');
    this.portFile = path.join(this.configDir, 'service.port');
    this.logFile = path.join(this.configDir, 'service.log');

    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Start the service
   */
  async start() {
    this.log('Starting Claude Always Running service...');

    if (await this.isRunning()) {
      throw new Error('Service is already running');
    }

    // Save PID
    fs.writeFileSync(this.pidFile, process.pid.toString());

    // Start Claude
    await this.startClaude();

    // Start TCP server
    await this.startServer();

    // Setup signal handlers
    this.setupSignalHandlers();

    this.log(`Service started - PID: ${process.pid}, Port: ${this.port}`);
    return { port: this.port, pid: process.pid };
  }

  /**
   * Start Claude in a PTY
   */
  async startClaude() {
    return new Promise((resolve, reject) => {
      try {
        const isWindows = os.platform() === 'win32';
        const shell = isWindows ? 'cmd.exe' : process.env.SHELL || '/bin/bash';
        const shellArgs = isWindows ? ['/c', 'claude'] : ['-c', 'claude'];

        this.log('Starting Claude process...');

        // Reset ready state
        this.claudeReady = false;
        this.lastOutputTime = Date.now();
        this.startReadyCheck();

        this.ptyProcess = pty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: process.env.HOME || process.env.USERPROFILE,
          env: process.env
        });

        this.ptyProcess.onData((data) => {
          this.handleOutput(data);
        });

        this.ptyProcess.onExit(({ exitCode }) => {
          this.log(`Claude exited with code ${exitCode}`);
          this.handleClaudeExit(exitCode);
        });

        this.log(`Claude started - PID: ${this.ptyProcess.pid}`);
        resolve();
      } catch (err) {
        this.log(`Failed to start Claude: ${err.message}`);
        reject(err);
      }
    });
  }

  /**
   * Start checking if Claude is ready (startup complete)
   */
  startReadyCheck() {
    // Clear any existing interval
    if (this.readyCheckInterval) {
      clearInterval(this.readyCheckInterval);
    }

    // Check every 500ms if output has settled
    this.readyCheckInterval = setInterval(() => {
      const silenceTime = Date.now() - this.lastOutputTime;

      // Claude is ready after 4 seconds of silence (welcome screen done)
      if (silenceTime > 4000 && !this.claudeReady) {
        this.claudeReady = true;
        clearInterval(this.readyCheckInterval);
        this.readyCheckInterval = null;
        this.log('Claude is ready (startup complete)');

        // Send a "wake up" Enter to prime Claude for input
        // This fixes an issue where the first command after start is ignored
        if (this.ptyProcess) {
          this.ptyProcess.write('\r');
          this.log('Sent wake-up Enter');
        }

        // Process any queued commands
        this.processCommandQueue();
      }
    }, 500);
  }

  /**
   * Process queued commands after Claude is ready
   */
  processCommandQueue() {
    while (this.commandQueue.length > 0) {
      const { clientId, msg } = this.commandQueue.shift();
      this.log(`Processing queued command from client ${clientId}`);
      this.executeCommand(clientId, msg);
    }
  }

  /**
   * Handle Claude exit - auto restart
   */
  handleClaudeExit(exitCode) {
    if (this.isShuttingDown) return;

    const now = Date.now();

    // Reset counter if stable for a while
    if (now - this.lastRestartTime > RESTART_RESET_TIME) {
      this.restartAttempts = 0;
    }

    this.restartAttempts++;
    this.lastRestartTime = now;

    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      this.log(`Max restart attempts exceeded. Stopping.`);
      this.broadcast({ type: 'error', message: 'Claude crashed too many times' });
      this.stop();
      return;
    }

    this.log(`Restarting Claude in ${RESTART_DELAY}ms (attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
    this.broadcast({ type: 'status', message: `Restarting Claude (attempt ${this.restartAttempts})...` });

    setTimeout(() => {
      this.startClaude().catch(err => {
        this.log(`Restart failed: ${err.message}`);
      });
    }, RESTART_DELAY);
  }

  /**
   * Handle output from Claude
   */
  handleOutput(data) {
    // Track last output time for ready detection
    this.lastOutputTime = Date.now();

    // Buffer output
    this.outputBuffer.push({ time: Date.now(), data });
    while (this.outputBuffer.length > this.maxBufferSize) {
      this.outputBuffer.shift();
    }

    // Broadcast to clients
    this.broadcast({ type: 'output', data });
  }

  /**
   * Start TCP server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.log(`Port ${this.port} in use, trying ${this.port + 1}`);
          this.port++;
          this.server.listen(this.port, '127.0.0.1');
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        fs.writeFileSync(this.portFile, this.port.toString());
        this.log(`TCP server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Handle client connection
   */
  handleClient(socket) {
    const clientId = ++this.clientIdCounter;
    this.log(`Client ${clientId} connected`);
    this.clients.set(clientId, socket);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const msg = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);

        try {
          this.handleMessage(clientId, JSON.parse(msg));
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    socket.on('close', () => {
      this.log(`Client ${clientId} disconnected`);
      this.clients.delete(clientId);
    });

    socket.on('error', () => {
      this.clients.delete(clientId);
    });

    // Welcome message
    this.sendTo(clientId, { type: 'connected', port: this.port });
  }

  /**
   * Handle message from client
   */
  handleMessage(clientId, msg) {
    switch (msg.type) {
      case 'input':
        // Raw input - send directly without modification (for interactive mode)
        if (this.ptyProcess) {
          this.ptyProcess.write(msg.data);
        } else {
          this.sendTo(clientId, { type: 'error', message: 'Claude not running' });
        }
        break;

      case 'command':
        // Queue command if Claude isn't ready yet (still starting up)
        if (!this.claudeReady) {
          this.log(`Claude not ready, queuing command from client ${clientId}`);
          this.sendTo(clientId, { type: 'status', message: 'Waiting for Claude to be ready...' });
          this.commandQueue.push({ clientId, msg });
        } else {
          this.executeCommand(clientId, msg);
        }
        break;

      case 'status':
        this.sendTo(clientId, {
          type: 'status',
          running: !!this.ptyProcess,
          ready: this.claudeReady,
          pid: process.pid,
          port: this.port,
          clients: this.clients.size,
          restarts: this.restartAttempts,
          queuedCommands: this.commandQueue.length
        });
        break;

      case 'history':
        const limit = msg.limit || 100;
        const history = this.outputBuffer.slice(-limit);
        this.sendTo(clientId, {
          type: 'history',
          data: history.map(h => h.data).join('')
        });
        break;

      case 'resize':
        if (this.ptyProcess && msg.cols && msg.rows) {
          this.ptyProcess.resize(msg.cols, msg.rows);
        }
        break;

      case 'ping':
        this.sendTo(clientId, { type: 'pong' });
        break;
    }
  }

  /**
   * Execute a command (after Claude is ready)
   */
  executeCommand(clientId, msg) {
    if (this.ptyProcess) {
      this.log(`Client ${clientId}: ${msg.data.substring(0, 50)}...`);
      this.log(`PTY pid=${this.ptyProcess.pid}, writing command...`);
      // Send command first
      const written = this.ptyProcess.write(msg.data);
      this.log(`Command written: ${written}`);
      // Delay then send Enter - Claude Code needs time to process input
      setTimeout(() => {
        if (this.ptyProcess && !this.isShuttingDown) {
          const enterWritten = this.ptyProcess.write('\r');
          this.log(`Sent Enter for client ${clientId}: ${enterWritten}`);
        }
      }, 200);
    } else {
      this.sendTo(clientId, { type: 'error', message: 'Claude not running' });
    }
  }

  /**
   * Send to specific client
   */
  sendTo(clientId, msg) {
    const socket = this.clients.get(clientId);
    if (socket && !socket.destroyed) {
      socket.write(JSON.stringify(msg) + '\n');
    }
  }

  /**
   * Broadcast to all clients
   */
  broadcast(msg) {
    const data = JSON.stringify(msg) + '\n';
    for (const [, socket] of this.clients) {
      if (!socket.destroyed) socket.write(data);
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    this.log('Stopping service...');
    this.isShuttingDown = true;

    // Clear ready check interval
    if (this.readyCheckInterval) {
      clearInterval(this.readyCheckInterval);
      this.readyCheckInterval = null;
    }

    this.broadcast({ type: 'shutdown' });

    for (const [, socket] of this.clients) {
      socket.end();
    }
    this.clients.clear();

    if (this.server) this.server.close();
    if (this.ptyProcess) this.ptyProcess.kill();

    this.cleanup();
    this.log('Service stopped');
  }

  /**
   * Clean up state files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);
      if (fs.existsSync(this.portFile)) fs.unlinkSync(this.portFile);
    } catch (e) {}
  }

  /**
   * Check if service is running
   */
  async isRunning() {
    if (!fs.existsSync(this.pidFile)) return false;

    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf8'));
      process.kill(pid, 0);
      return true;
    } catch (e) {
      this.cleanup();
      return false;
    }
  }

  /**
   * Setup signal handlers
   */
  setupSignalHandlers() {
    const shutdown = () => this.stop().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * Log message
   */
  log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    try {
      fs.appendFileSync(this.logFile, line + '\n');
    } catch (e) {}
  }
}

/**
 * Get service status
 */
function getServiceStatus() {
  const configDir = path.join(os.homedir(), '.claude-alwaysrunning');
  const pidFile = path.join(configDir, 'service.pid');
  const portFile = path.join(configDir, 'service.port');

  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    process.kill(pid, 0);
    const port = fs.existsSync(portFile) ? parseInt(fs.readFileSync(portFile, 'utf8')) : DEFAULT_PORT;
    return { running: true, pid, port };
  } catch (e) {
    return { running: false };
  }
}

/**
 * Stop service externally
 */
function stopService() {
  const configDir = path.join(os.homedir(), '.claude-alwaysrunning');
  const pidFile = path.join(configDir, 'service.pid');

  if (!fs.existsSync(pidFile)) {
    return { success: false, message: 'Service not running' };
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    process.kill(pid, 'SIGTERM');
    return { success: true, message: `Stopped process ${pid}` };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

module.exports = {
  ClaudeService,
  getServiceStatus,
  stopService,
  DEFAULT_PORT
};
