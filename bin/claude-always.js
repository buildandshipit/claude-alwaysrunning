#!/usr/bin/env node

const { program } = require('commander');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  ClaudeService,
  getServiceStatus,
  stopService,
  runInteractive,
  sendCommand,
  showStatus,
  runWhatsAppBridge,
  runVoiceBridge,
  getAPIKeyManager
} = require('../src');

program
  .name('claude-always')
  .description('Run Claude Code as an always-running background service')
  .version('1.0.0');

// ============================================================================
// Service Management
// ============================================================================

program
  .command('start')
  .description('Start the Claude service')
  .option('-p, --port <port>', 'TCP port', '3377')
  .option('-f, --foreground', 'Run in foreground')
  .option('-r, --remote', 'Enable remote access (binds to 0.0.0.0, requires API key auth)')
  .action(async (options) => {
    const status = await getServiceStatus();

    if (status.running) {
      console.log(`Service already running (PID: ${status.pid}, Port: ${status.port})`);
      console.log('Use "claude-always stop" to stop it first.');
      return;
    }

    if (options.foreground) {
      const svc = new ClaudeService({
        port: parseInt(options.port),
        remote: options.remote
      });
      await svc.start();
    } else {
      console.log('Starting Claude service...');

      const args = ['start', '-f', '-p', options.port];
      if (options.remote) args.push('-r');

      const child = spawn(process.execPath, [__filename, ...args], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
        env: process.env
      });
      child.unref();

      // Wait for startup
      await new Promise(r => setTimeout(r, 2000));

      const newStatus = await getServiceStatus();
      if (newStatus.running) {
        console.log(`Service started (PID: ${newStatus.pid}, Port: ${newStatus.port})`);
        if (options.remote) {
          console.log('Remote mode: ENABLED (API key authentication required)');
        }
        console.log('');
        console.log('Commands:');
        console.log('  claude-always connect        Interactive session');
        console.log('  claude-always send "text"    Send a command');
        console.log('  claude-always status         Check status');
        console.log('  claude-always stop           Stop service');
        if (options.remote) {
          console.log('');
          console.log('Remote access:');
          console.log('  claude-always keys add <name>    Generate API key');
          console.log('  claude-always keys list          List API keys');
        }
      } else {
        console.log('Service may have failed to start.');
        console.log('Check logs: claude-always logs');
      }
    }
  });

program
  .command('stop')
  .description('Stop the Claude service')
  .action(async () => {
    const status = await getServiceStatus();

    if (!status.running) {
      console.log('Service is not running.');
      return;
    }

    console.log(`Stopping service (PID: ${status.pid})...`);
    const result = await stopService();
    console.log(result.success ? 'Service stopped.' : `Failed: ${result.message}`);
  });

program
  .command('restart')
  .description('Restart the Claude service')
  .option('-p, --port <port>', 'TCP port')
  .action(async (options) => {
    console.log('Restarting service...');

    const status = await getServiceStatus();
    if (status.running) {
      await stopService();
      await new Promise(r => setTimeout(r, 1000));
    }

    const args = ['start'];
    if (options.port) args.push('-p', options.port);

    const child = spawn(process.execPath, [__filename, ...args], {
      stdio: 'inherit'
    });
    child.on('exit', () => process.exit(0));
  });

program
  .command('status')
  .description('Show service status')
  .action(async () => {
    const status = await getServiceStatus();

    console.log('Claude Always Running - Status');
    console.log('==============================');

    if (status.running) {
      console.log('Running: Yes');
      console.log(`PID: ${status.pid}`);
      console.log(`Port: ${status.port}`);

      try {
        await showStatus({ port: status.port });
      } catch (e) {}
    } else {
      console.log('Running: No');
      console.log('');
      console.log('Start with: claude-always start');
    }
  });

program
  .command('logs')
  .description('Show service logs')
  .option('-n, --lines <count>', 'Lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .action((options) => {
    const logFile = path.join(os.homedir(), '.claude-alwaysrunning', 'service.log');

    if (!fs.existsSync(logFile)) {
      console.log('No logs found.');
      return;
    }

    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n').slice(-parseInt(options.lines));
    console.log(lines.join('\n'));

    if (options.follow) {
      console.log('\n--- Following (Ctrl+C to stop) ---\n');
      let lastSize = fs.statSync(logFile).size;

      setInterval(() => {
        const currentSize = fs.statSync(logFile).size;
        if (currentSize > lastSize) {
          const fd = fs.openSync(logFile, 'r');
          const buf = Buffer.alloc(currentSize - lastSize);
          fs.readSync(fd, buf, 0, buf.length, lastSize);
          fs.closeSync(fd);
          process.stdout.write(buf.toString());
          lastSize = currentSize;
        }
      }, 500);
    }
  });

// ============================================================================
// Client Commands
// ============================================================================

program
  .command('connect')
  .description('Connect to Claude interactively')
  .option('-p, --port <port>', 'Service port')
  .option('-h, --host <host>', 'Remote host (default: 127.0.0.1)')
  .option('-k, --key <apikey>', 'API key for remote authentication')
  .action(async (options) => {
    await runInteractive({
      port: options.port ? parseInt(options.port) : undefined,
      host: options.host,
      apiKey: options.key
    });
  });

program
  .command('send')
  .description('Send a command to Claude (uses claude --print for clean output)')
  .argument('<command>', 'Command to send')
  .option('-m, --max <seconds>', 'Max timeout in seconds (default: 300)')
  .option('-j, --json', 'Output in JSON format')
  .action(async (command, options) => {
    try {
      await sendCommand(command, options);
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// WhatsApp Bridge
// ============================================================================

program
  .command('whatsapp')
  .description('Start WhatsApp bridge (messages in group go to Claude)')
  .option('-g, --group <name>', 'Group name to listen to (default: claudebot)')
  .option('-m, --max <seconds>', 'Max timeout per message in seconds (default: 300)')
  .action(async (options) => {
    const maxTimeout = options.max ? parseInt(options.max) * 1000 : 300000;
    const groupName = options.group || 'claudebot';
    await runWhatsAppBridge({ maxTimeout, groupName });
  });

// ============================================================================
// Voice Mode
// ============================================================================

program
  .command('voice')
  .description('Start voice mode (push-to-talk with STT/TTS)')
  .option('--stt <provider>', 'STT provider (default: whisper)', 'whisper')
  .option('--tts <provider>', 'TTS provider (default: edge-tts)', 'edge-tts')
  .option('--voice <name>', 'TTS voice (default: en-US-AriaNeural)', 'en-US-AriaNeural')
  .option('--model <size>', 'Whisper model size: tiny, base, small (default: base.en)', 'base.en')
  .option('-m, --max <seconds>', 'Max timeout per request in seconds (default: 300)')
  .action(async (options) => {
    const maxTimeout = options.max ? parseInt(options.max) * 1000 : 300000;
    await runVoiceBridge({
      sttProvider: options.stt,
      ttsProvider: options.tts,
      sttOptions: { model: options.model },
      ttsOptions: { voice: options.voice },
      maxTimeout
    });
  });

// ============================================================================
// API Key Management
// ============================================================================

const keysCmd = program
  .command('keys')
  .description('Manage API keys for remote access');

keysCmd
  .command('list')
  .description('List all API keys')
  .action(() => {
    const manager = getAPIKeyManager();
    const keys = manager.list();

    if (keys.length === 0) {
      console.log('No API keys configured.');
      console.log('');
      console.log('Generate one with: claude-always keys add <name>');
      return;
    }

    console.log('API Keys:');
    console.log('=========');
    for (const key of keys) {
      const lastUsed = key.lastUsed ? new Date(key.lastUsed).toLocaleString() : 'Never';
      const created = new Date(key.created).toLocaleString();
      console.log(`  ${key.name}`);
      console.log(`    Created: ${created}`);
      console.log(`    Last used: ${lastUsed}`);
      console.log('');
    }
  });

keysCmd
  .command('add <name>')
  .description('Generate a new API key')
  .action((name) => {
    const manager = getAPIKeyManager();

    try {
      const result = manager.generate(name);

      console.log('');
      console.log('New API key generated:');
      console.log('======================');
      console.log(`Name: ${result.name}`);
      console.log(`Key:  ${result.key}`);
      console.log('');
      console.log('IMPORTANT: Save this key now! It cannot be retrieved later.');
      console.log('');
      console.log('Use this key to authenticate remote connections:');
      console.log('  1. Connect to the service');
      console.log('  2. Send: {"type": "auth", "key": "<your-key>"}');
      console.log('');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

keysCmd
  .command('remove <name>')
  .description('Remove an API key')
  .action((name) => {
    const manager = getAPIKeyManager();

    if (manager.remove(name)) {
      console.log(`API key "${name}" removed.`);
    } else {
      console.error(`API key "${name}" not found.`);
      process.exit(1);
    }
  });

program.parse();
