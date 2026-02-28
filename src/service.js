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
const WebSocket = require('ws');
const { getAPIKeyManager } = require('./auth');
const { getSchedulerManager } = require('./scheduler');
const { getAlertChannels } = require('./alerts');
const { getMemoryStore } = require('./memory');
const { getTriggerService } = require('./triggers');

const DEFAULT_PORT = 3377;
const RESTART_DELAY = 2000;
const MAX_RESTART_ATTEMPTS = 10;
const RESTART_RESET_TIME = 60000;

class ClaudeService {
  constructor(options = {}) {
    this.port = options.port || DEFAULT_PORT;
    this.configDir = path.join(os.homedir(), '.claude-alwaysrunning');
    this.remoteMode = options.remote || false;

    // State
    this.ptyProcess = null;
    this.server = null;
    this.wsServer = null;
    this.clients = new Map();
    this.wsClients = new Map();
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
    this.permissionsAccepted = false;

    // Authentication
    this.apiKeyManager = this.remoteMode ? getAPIKeyManager() : null;

    // Scheduler and alerts
    this.scheduler = getSchedulerManager();
    this.alertChannels = getAlertChannels();

    // Memory store for UI access
    this.memoryStore = getMemoryStore();

    // Trigger service for periodic jobs
    this.triggers = getTriggerService();

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

    // Start WebSocket server
    await this.startWebSocketServer();

    // Start scheduler for reminders
    this.startScheduler();

    // Setup and start triggers
    this.setupTriggers();

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
        // Use --dangerously-skip-permissions to avoid the confirmation dialog in daemon mode
        const claudeCmd = 'claude --dangerously-skip-permissions';
        const shellArgs = isWindows ? ['/c', claudeCmd] : ['-c', claudeCmd];

        this.log('Starting Claude process...');

        // Reset ready state
        this.claudeReady = false;
        this.lastOutputTime = Date.now();
        this.permissionsAccepted = false;
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

        // Notify WebSocket clients
        this.broadcastWs({ type: 'ready', ready: true });

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
      const { clientId, msg, isWs } = this.commandQueue.shift();
      this.log(`Processing queued command from ${isWs ? 'WS' : 'TCP'} client ${clientId}`);
      if (isWs) {
        this.executeWsCommand(clientId, msg);
      } else {
        this.executeCommand(clientId, msg);
      }
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

    // Auto-accept permissions dialog if detected
    // Look for "Yes, I accept" which indicates the bypass permissions warning
    if (!this.permissionsAccepted && data.includes('Yes, I accept')) {
      this.log('Detected permissions dialog, auto-accepting...');
      this.permissionsAccepted = true;
      // Send "2" to select option 2, then Enter to confirm
      setTimeout(() => {
        if (this.ptyProcess && !this.isShuttingDown) {
          this.ptyProcess.write('2');
          setTimeout(() => {
            if (this.ptyProcess && !this.isShuttingDown) {
              this.ptyProcess.write('\r');
              this.log('Sent auto-accept sequence for permissions dialog');
            }
          }, 100);
        }
      }, 100);
    }

    // Buffer output
    this.outputBuffer.push({ time: Date.now(), data });
    while (this.outputBuffer.length > this.maxBufferSize) {
      this.outputBuffer.shift();
    }

    // Broadcast to TCP clients
    this.broadcast({ type: 'output', data });

    // Broadcast to WebSocket clients
    this.broadcastWs({ type: 'output', data });
  }

  /**
   * Start TCP server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      // Bind to 0.0.0.0 in remote mode, 127.0.0.1 otherwise
      const bindAddress = this.remoteMode ? '0.0.0.0' : '127.0.0.1';

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.log(`Port ${this.port} in use, trying ${this.port + 1}`);
          this.port++;
          this.server.listen(this.port, bindAddress);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, bindAddress, () => {
        fs.writeFileSync(this.portFile, this.port.toString());
        const modeStr = this.remoteMode ? ' (REMOTE MODE - auth required)' : '';
        this.log(`TCP server listening on ${bindAddress}:${this.port}${modeStr}`);

        if (this.remoteMode) {
          const keyCount = this.apiKeyManager.count();
          if (keyCount === 0) {
            this.log('WARNING: No API keys configured. Run "claude-always keys add <name>" to create one.');
          } else {
            this.log(`${keyCount} API key(s) configured for authentication`);
          }
        }

        resolve();
      });
    });
  }

  /**
   * Start WebSocket server on port+1 for Electron UI
   */
  async startWebSocketServer() {
    return new Promise((resolve, reject) => {
      const wsPort = this.port + 1;
      const bindAddress = this.remoteMode ? '0.0.0.0' : '127.0.0.1';

      this.wsServer = new WebSocket.Server({
        port: wsPort,
        host: bindAddress
      });

      this.wsServer.on('connection', (ws, req) => {
        this.handleWebSocketClient(ws, req);
      });

      this.wsServer.on('listening', () => {
        this.log(`WebSocket server listening on ${bindAddress}:${wsPort}`);
        resolve();
      });

      this.wsServer.on('error', (err) => {
        this.log(`WebSocket server error: ${err.message}`);
        reject(err);
      });
    });
  }

  /**
   * Handle WebSocket client connection
   */
  handleWebSocketClient(ws, req) {
    const clientId = ++this.clientIdCounter;
    const remoteAddr = req.socket.remoteAddress;
    const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';

    this.log(`WebSocket client ${clientId} connected from ${remoteAddr}`);

    const clientState = {
      ws,
      authenticated: !this.remoteMode || isLocal,
      keyName: isLocal ? 'local' : null
    };

    this.wsClients.set(clientId, clientState);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (!clientState.authenticated) {
          if (msg.type === 'auth') {
            this.handleWsAuth(clientId, msg);
          } else {
            this.sendToWs(clientId, { type: 'error', message: 'Authentication required' });
          }
        } else {
          this.handleWsMessage(clientId, msg);
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      this.log(`WebSocket client ${clientId} disconnected`);
      this.wsClients.delete(clientId);
    });

    ws.on('error', () => {
      this.wsClients.delete(clientId);
    });

    // Welcome message
    if (clientState.authenticated) {
      this.sendToWs(clientId, {
        type: 'connected',
        port: this.port,
        wsPort: this.port + 1,
        ready: this.claudeReady,
        running: !!this.ptyProcess
      });
    } else {
      this.sendToWs(clientId, { type: 'auth_required', message: 'Please authenticate with API key' });
    }
  }

  /**
   * Handle WebSocket authentication
   */
  handleWsAuth(clientId, msg) {
    const clientState = this.wsClients.get(clientId);
    if (!clientState) return;

    const result = this.apiKeyManager.validate(msg.key);

    if (result.valid) {
      clientState.authenticated = true;
      clientState.keyName = result.name;
      this.log(`WebSocket client ${clientId} authenticated as "${result.name}"`);
      this.sendToWs(clientId, {
        type: 'connected',
        port: this.port,
        wsPort: this.port + 1,
        authenticated: true,
        ready: this.claudeReady,
        running: !!this.ptyProcess
      });
    } else {
      this.log(`WebSocket client ${clientId} authentication failed`);
      this.sendToWs(clientId, { type: 'auth_failed', message: 'Invalid API key' });
      setTimeout(() => clientState.ws.close(), 1000);
    }
  }

  /**
   * Handle WebSocket message
   */
  handleWsMessage(clientId, msg) {
    switch (msg.type) {
      case 'input':
        if (this.ptyProcess) {
          this.ptyProcess.write(msg.data);
        } else {
          this.sendToWs(clientId, { type: 'error', message: 'Claude not running' });
        }
        break;

      case 'command':
        if (!this.claudeReady) {
          this.log(`Claude not ready, queuing command from WS client ${clientId}`);
          this.sendToWs(clientId, { type: 'status', message: 'Waiting for Claude to be ready...' });
          this.commandQueue.push({ clientId, msg, isWs: true });
        } else {
          this.executeWsCommand(clientId, msg);
        }
        break;

      case 'status':
        this.sendToWs(clientId, {
          type: 'status',
          running: !!this.ptyProcess,
          ready: this.claudeReady,
          pid: process.pid,
          port: this.port,
          wsPort: this.port + 1,
          clients: this.clients.size,
          wsClients: this.wsClients.size,
          restarts: this.restartAttempts,
          queuedCommands: this.commandQueue.length
        });
        break;

      case 'history':
        const limit = msg.limit || 100;
        const history = this.outputBuffer.slice(-limit);
        this.sendToWs(clientId, {
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
        this.sendToWs(clientId, { type: 'pong' });
        break;

      // Memory operations
      case 'memory:stats':
        this.sendToWs(clientId, {
          type: 'memory:stats',
          data: this.memoryStore.getStats()
        });
        break;

      case 'memory:facts':
        this.sendToWs(clientId, {
          type: 'memory:facts',
          data: this.memoryStore.getFacts(msg.category || null)
        });
        break;

      case 'memory:addFact':
        const factId = this.memoryStore.addFact(msg.fact, msg.category || 'general');
        this.sendToWs(clientId, {
          type: 'memory:factAdded',
          data: { id: factId, fact: msg.fact, category: msg.category || 'general' }
        });
        break;

      case 'memory:deleteFact':
        this.memoryStore.removeFact(msg.id);
        this.sendToWs(clientId, {
          type: 'memory:factDeleted',
          data: { id: msg.id }
        });
        break;

      case 'memory:conversations':
        this.sendToWs(clientId, {
          type: 'memory:conversations',
          data: this.memoryStore.getRecentConversations(msg.limit || 10)
        });
        break;

      case 'memory:messages':
        this.sendToWs(clientId, {
          type: 'memory:messages',
          data: this.memoryStore.getMessages(msg.conversationId, msg.limit || 100)
        });
        break;

      // Reminder operations
      case 'reminders:list':
        this.sendToWs(clientId, {
          type: 'reminders:list',
          data: this.scheduler.listReminders()
        });
        break;

      case 'reminders:add':
        try {
          const reminder = this.scheduler.addReminder(msg.message, msg.time, msg.channel || 'notification');
          this.sendToWs(clientId, {
            type: 'reminders:added',
            data: reminder
          });
        } catch (err) {
          this.sendToWs(clientId, {
            type: 'error',
            message: `Failed to add reminder: ${err.message}`
          });
        }
        break;

      case 'reminders:cancel':
        this.scheduler.cancelReminder(msg.id);
        this.sendToWs(clientId, {
          type: 'reminders:cancelled',
          data: { id: msg.id }
        });
        break;

      // Logs
      case 'logs:get':
        try {
          const logContent = fs.existsSync(this.logFile)
            ? fs.readFileSync(this.logFile, 'utf8')
            : '';
          const lines = logContent.split('\n').filter(Boolean);
          const lastLines = lines.slice(-(msg.lines || 100));
          this.sendToWs(clientId, {
            type: 'logs:content',
            data: lastLines.join('\n')
          });
        } catch (err) {
          this.sendToWs(clientId, {
            type: 'error',
            message: `Failed to read logs: ${err.message}`
          });
        }
        break;

      // Trigger operations
      case 'triggers:status':
        this.sendToWs(clientId, {
          type: 'triggers:status',
          data: this.triggers.getAllStatus()
        });
        break;

      case 'triggers:report':
        this.sendToWs(clientId, {
          type: 'triggers:report',
          data: this.triggers.getReport()
        });
        break;

      case 'triggers:run':
        try {
          await this.triggers.trigger(msg.name);
          this.sendToWs(clientId, {
            type: 'triggers:triggered',
            data: { name: msg.name, status: this.triggers.getStatus(msg.name) }
          });
        } catch (err) {
          this.sendToWs(clientId, {
            type: 'error',
            message: `Failed to run trigger: ${err.message}`
          });
        }
        break;

      case 'triggers:stop':
        try {
          this.triggers.stop(msg.name);
          this.sendToWs(clientId, {
            type: 'triggers:stopped',
            data: { name: msg.name }
          });
        } catch (err) {
          this.sendToWs(clientId, {
            type: 'error',
            message: `Failed to stop trigger: ${err.message}`
          });
        }
        break;

      case 'triggers:start':
        try {
          this.triggers.startJob(msg.name, msg.immediate || false);
          this.sendToWs(clientId, {
            type: 'triggers:started',
            data: { name: msg.name }
          });
        } catch (err) {
          this.sendToWs(clientId, {
            type: 'error',
            message: `Failed to start trigger: ${err.message}`
          });
        }
        break;
    }
  }

  /**
   * Execute command from WebSocket client
   */
  executeWsCommand(clientId, msg) {
    if (this.ptyProcess) {
      this.log(`WS Client ${clientId}: ${msg.data.substring(0, 50)}...`);
      this.ptyProcess.write(msg.data);
      setTimeout(() => {
        if (this.ptyProcess && !this.isShuttingDown) {
          this.ptyProcess.write('\r');
        }
      }, 200);
    } else {
      this.sendToWs(clientId, { type: 'error', message: 'Claude not running' });
    }
  }

  /**
   * Send to specific WebSocket client
   */
  sendToWs(clientId, msg) {
    const clientState = this.wsClients.get(clientId);
    if (clientState && clientState.ws.readyState === WebSocket.OPEN) {
      clientState.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Broadcast to all authenticated WebSocket clients
   */
  broadcastWs(msg) {
    const data = JSON.stringify(msg);
    for (const [, clientState] of this.wsClients) {
      if (clientState.authenticated && clientState.ws.readyState === WebSocket.OPEN) {
        clientState.ws.send(data);
      }
    }
  }

  /**
   * Handle client connection
   */
  handleClient(socket) {
    const clientId = ++this.clientIdCounter;
    const remoteAddr = socket.remoteAddress;
    const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';

    this.log(`Client ${clientId} connected from ${remoteAddr}`);

    // Client state
    const clientState = {
      socket,
      authenticated: !this.remoteMode || isLocal, // Local connections auto-authenticated
      keyName: isLocal ? 'local' : null
    };

    this.clients.set(clientId, clientState);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const msg = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);

        try {
          const parsed = JSON.parse(msg);

          // Check authentication for non-local connections
          if (!clientState.authenticated) {
            if (parsed.type === 'auth') {
              this.handleAuth(clientId, parsed);
            } else {
              this.sendTo(clientId, { type: 'error', message: 'Authentication required' });
            }
          } else {
            this.handleMessage(clientId, parsed);
          }
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

    // Welcome message with auth requirement
    if (clientState.authenticated) {
      this.sendTo(clientId, { type: 'connected', port: this.port });
    } else {
      this.sendTo(clientId, { type: 'auth_required', message: 'Please authenticate with API key' });
    }
  }

  /**
   * Handle authentication message
   */
  handleAuth(clientId, msg) {
    const clientState = this.clients.get(clientId);
    if (!clientState) return;

    const result = this.apiKeyManager.validate(msg.key);

    if (result.valid) {
      clientState.authenticated = true;
      clientState.keyName = result.name;
      this.log(`Client ${clientId} authenticated as "${result.name}"`);
      this.sendTo(clientId, { type: 'connected', port: this.port, authenticated: true });
    } else {
      this.log(`Client ${clientId} authentication failed`);
      this.sendTo(clientId, { type: 'auth_failed', message: 'Invalid API key' });

      // Disconnect after failed auth
      setTimeout(() => {
        if (clientState.socket && !clientState.socket.destroyed) {
          clientState.socket.end();
        }
      }, 1000);
    }
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
    const clientState = this.clients.get(clientId);
    if (clientState && clientState.socket && !clientState.socket.destroyed) {
      clientState.socket.write(JSON.stringify(msg) + '\n');
    }
  }

  /**
   * Broadcast to all authenticated clients
   */
  broadcast(msg) {
    const data = JSON.stringify(msg) + '\n';
    for (const [, clientState] of this.clients) {
      if (clientState.authenticated && clientState.socket && !clientState.socket.destroyed) {
        clientState.socket.write(data);
      }
    }
  }

  /**
   * Start the scheduler for reminders
   */
  startScheduler() {
    // Set up alert handler
    this.scheduler.setAlertHandler(async (reminder) => {
      await this.alertChannels.send(reminder);
    });

    // Start the scheduler
    this.scheduler.start();
    this.log('Scheduler started for reminders');
  }

  /**
   * Setup and start periodic triggers
   */
  setupTriggers() {
    // Register periodic jobs

    // Session auto-save: every 1 hour
    this.triggers.register('session-save', {
      interval: 60 * 60 * 1000,  // 1 hour
      description: 'Auto-save session info to memory',
      handler: async () => {
        await this.saveSession();
      },
    });

    // Output buffer cleanup: every 30 minutes
    this.triggers.register('buffer-cleanup', {
      interval: 30 * 60 * 1000,  // 30 minutes
      description: 'Clean up old output buffer entries',
      handler: () => {
        const before = this.outputBuffer.length;
        // Keep only last 500 entries
        if (this.outputBuffer.length > this.maxBufferSize) {
          this.outputBuffer = this.outputBuffer.slice(-this.maxBufferSize);
        }
        const removed = before - this.outputBuffer.length;
        if (removed > 0) {
          this.log(`Buffer cleanup: removed ${removed} old entries`);
        }
      },
    });

    // Log rotation check: every 2 hours
    this.triggers.register('log-check', {
      interval: 2 * 60 * 60 * 1000,  // 2 hours
      description: 'Check log file size and rotate if needed',
      handler: () => {
        try {
          const stats = fs.statSync(this.logFile);
          const sizeMB = stats.size / (1024 * 1024);
          if (sizeMB > 10) {
            // Rotate log file if > 10MB
            const rotatedFile = `${this.logFile}.${Date.now()}.old`;
            fs.renameSync(this.logFile, rotatedFile);
            this.log(`Log rotated: ${sizeMB.toFixed(2)}MB -> ${rotatedFile}`);
          }
        } catch (e) {
          // Ignore if file doesn't exist
        }
      },
    });

    // Setup lifecycle event logging
    this.triggers.on('jobStart', ({ name }) => {
      this.log(`[Trigger] Starting: ${name}`);
    });

    this.triggers.on('jobComplete', ({ name, duration, runCount }) => {
      this.log(`[Trigger] Completed: ${name} (${duration}ms, run #${runCount})`);
    });

    this.triggers.on('jobError', ({ name, error }) => {
      this.log(`[Trigger] Error in ${name}: ${error.message}`);
    });

    // Start all triggers
    this.triggers.start();
    this.log(`Triggers started: ${this.triggers.jobs.size} jobs registered`);
  }

  /**
   * Save current session info to memory
   */
  async saveSession() {
    try {
      const sessionInfo = {
        timestamp: Date.now(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        clientCount: this.clients.size + this.wsClients.size,
        restartAttempts: this.restartAttempts,
        outputBufferSize: this.outputBuffer.length,
      };

      // Store session summary as a fact for persistence
      const summary = `Session snapshot at ${new Date().toISOString()}: ` +
        `${sessionInfo.clientCount} clients, ` +
        `${sessionInfo.outputBufferSize} buffered messages, ` +
        `uptime ${Math.floor(sessionInfo.uptime / 60)} minutes`;

      this.memoryStore.addFact(summary, 'session');
      this.log(`Session saved: ${summary}`);
    } catch (error) {
      this.log(`Failed to save session: ${error.message}`);
      throw error;  // Let trigger service track the error
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    this.log('Stopping service...');
    this.isShuttingDown = true;

    // Stop scheduler
    if (this.scheduler) {
      this.scheduler.stop();
    }

    // Stop triggers
    if (this.triggers) {
      this.triggers.stopAll();
      this.log('Triggers stopped');
    }

    // Clear ready check interval
    if (this.readyCheckInterval) {
      clearInterval(this.readyCheckInterval);
      this.readyCheckInterval = null;
    }

    this.broadcast({ type: 'shutdown' });
    this.broadcastWs({ type: 'shutdown' });

    for (const [, clientState] of this.clients) {
      if (clientState.socket) {
        clientState.socket.end();
      }
    }
    this.clients.clear();

    for (const [, clientState] of this.wsClients) {
      if (clientState.ws) {
        clientState.ws.close();
      }
    }
    this.wsClients.clear();

    if (this.server) this.server.close();
    if (this.wsServer) this.wsServer.close();
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
