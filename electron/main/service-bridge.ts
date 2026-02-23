import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const DEFAULT_PORT = 3377;
const WS_PORT_OFFSET = 1;
const RECONNECT_DELAY = 3000;

interface ServiceStatus {
  running: boolean;
  ready: boolean;
  pid?: number;
  port?: number;
  wsPort?: number;
  clients?: number;
  wsClients?: number;
}

export class ServiceBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private port: number = DEFAULT_PORT;
  private wsPort: number = DEFAULT_PORT + WS_PORT_OFFSET;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private configDir: string;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private requestId: number = 0;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.claude-alwaysrunning');
  }

  async connect(): Promise<void> {
    // Read port from file if exists
    const portFile = path.join(this.configDir, 'service.port');
    if (fs.existsSync(portFile)) {
      try {
        this.port = parseInt(fs.readFileSync(portFile, 'utf8'));
        this.wsPort = this.port + WS_PORT_OFFSET;
      } catch {
        // Use default
      }
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://127.0.0.1:${this.wsPort}`);

        this.ws.on('open', () => {
          this.connected = true;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          this.handleDisconnect();
        });

        this.ws.on('error', (err) => {
          if (!this.connected) {
            reject(err);
          }
          this.handleDisconnect();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private handleDisconnect(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.ws = null;

    if (wasConnected) {
      this.emit('disconnected');
    }

    // Try to reconnect
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect().catch(() => {
          // Will retry again
        });
      }, RECONNECT_DELAY);
    }
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'connected':
          this.emit('status', {
            running: msg.running,
            ready: msg.ready,
            port: msg.port,
            wsPort: msg.wsPort
          });
          break;

        case 'output':
          this.emit('output', msg.data);
          break;

        case 'ready':
          this.emit('ready', msg.ready);
          break;

        case 'status':
          this.emit('status', msg);
          break;

        case 'shutdown':
          this.emit('shutdown');
          break;

        case 'memory:stats':
        case 'memory:facts':
        case 'memory:factAdded':
        case 'memory:factDeleted':
        case 'memory:conversations':
        case 'memory:messages':
        case 'reminders:list':
        case 'reminders:added':
        case 'reminders:cancelled':
        case 'logs:content':
          this.emit(msg.type, msg.data);
          break;

        case 'history':
          this.emit('history', msg.data);
          break;

        case 'error':
          this.emit('error', msg.message);
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(type: string, data: any = {}): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  sendCommand(command: string): void {
    this.send('command', { data: command });
  }

  sendInput(input: string): void {
    this.send('input', { data: input });
  }

  requestStatus(): void {
    this.send('status');
  }

  requestHistory(limit: number = 100): void {
    this.send('history', { limit });
  }

  // Memory operations
  requestMemoryStats(): void {
    this.send('memory:stats');
  }

  requestFacts(category?: string): void {
    this.send('memory:facts', { category });
  }

  addFact(fact: string, category: string = 'general'): void {
    this.send('memory:addFact', { fact, category });
  }

  deleteFact(id: number): void {
    this.send('memory:deleteFact', { id });
  }

  requestConversations(limit: number = 10): void {
    this.send('memory:conversations', { limit });
  }

  requestMessages(conversationId: string, limit: number = 100): void {
    this.send('memory:messages', { conversationId, limit });
  }

  // Reminder operations
  requestReminders(): void {
    this.send('reminders:list');
  }

  addReminder(message: string, time: string, channel: string = 'notification'): void {
    this.send('reminders:add', { message, time, channel });
  }

  cancelReminder(id: number): void {
    this.send('reminders:cancel', { id });
  }

  // Logs
  requestLogs(lines: number = 100): void {
    this.send('logs:get', { lines });
  }

  // Service lifecycle
  async startService(): Promise<boolean> {
    return new Promise((resolve) => {
      // When compiled, __dirname is electron/dist-main/main
      // Need to go up 3 levels to reach project root
      const projectRoot = path.join(__dirname, '../../..');
      const cliPath = path.join(projectRoot, 'bin/claude-always.js');

      console.log('Starting service from:', cliPath);
      console.log('Working directory:', projectRoot);

      // Spawn detached process
      const child = spawn('node', [cliPath, 'start'], {
        detached: true,
        stdio: 'ignore',
        cwd: projectRoot,
        shell: true
      });

      child.unref();

      // Wait a bit then try to connect
      setTimeout(async () => {
        try {
          await this.connect();
          resolve(true);
        } catch {
          resolve(false);
        }
      }, 5000);
    });
  }

  async stopService(): Promise<boolean> {
    const pidFile = path.join(this.configDir, 'service.pid');

    if (!fs.existsSync(pidFile)) {
      return false;
    }

    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      process.kill(pid, 'SIGTERM');
      this.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  async restartService(): Promise<boolean> {
    await this.stopService();
    // Wait for service to stop
    await new Promise(resolve => setTimeout(resolve, 2000));
    return this.startService();
  }

  getServiceStatus(): ServiceStatus {
    const pidFile = path.join(this.configDir, 'service.pid');
    const portFile = path.join(this.configDir, 'service.port');

    if (!fs.existsSync(pidFile)) {
      return { running: false, ready: false };
    }

    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
      process.kill(pid, 0); // Check if process exists
      const port = fs.existsSync(portFile) ? parseInt(fs.readFileSync(portFile, 'utf8')) : DEFAULT_PORT;
      return {
        running: true,
        ready: this.connected,
        pid,
        port,
        wsPort: port + WS_PORT_OFFSET
      };
    } catch {
      return { running: false, ready: false };
    }
  }
}
