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
  getAPIKeyManager,
  getMemoryStore,
  getSchedulerManager,
  parseReminderTime
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
  .description('Start WhatsApp bridge (text & voice messages go to Claude, responds with text)')
  .option('-g, --group <name>', 'Group name to listen to (default: claudebot)')
  .option('-m, --max <seconds>', 'Max timeout per message in seconds (default: 300)')
  .option('--no-voice', 'Disable voice message transcription')
  .action(async (options) => {
    const maxTimeout = options.max ? parseInt(options.max) * 1000 : 300000;
    const groupName = options.group || 'claudebot';

    await runWhatsAppBridge({
      maxTimeout,
      groupName,
      voice: options.voice // Default true, --no-voice sets to false
    });
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

// ============================================================================
// Memory Management
// ============================================================================

const memoryCmd = program
  .command('memory')
  .description('Manage Jarvis memory (conversations, facts, reminders)');

memoryCmd
  .command('stats')
  .description('Show memory statistics')
  .action(() => {
    const store = getMemoryStore();
    const stats = store.getStats();

    console.log('Jarvis Memory Stats');
    console.log('===================');
    console.log(`Conversations: ${stats.conversations}`);
    console.log(`Messages: ${stats.messages}`);
    console.log(`Facts: ${stats.facts}`);
    console.log(`Reminders:`);
    console.log(`  Pending: ${stats.reminders.pending}`);
    console.log(`  Completed: ${stats.reminders.completed}`);
    console.log(`  Cancelled: ${stats.reminders.cancelled}`);
  });

memoryCmd
  .command('facts')
  .description('List stored facts and preferences')
  .option('-c, --category <category>', 'Filter by category')
  .action((options) => {
    const store = getMemoryStore();
    const facts = store.getFacts(options.category);

    if (facts.length === 0) {
      console.log('No facts stored.');
      return;
    }

    console.log('Stored Facts');
    console.log('============');

    // Group by category
    const grouped = {};
    for (const fact of facts) {
      const cat = fact.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(fact);
    }

    for (const [category, catFacts] of Object.entries(grouped)) {
      console.log(`\n[${category}]`);
      for (const fact of catFacts) {
        const date = new Date(fact.created_at).toLocaleDateString();
        console.log(`  ${fact.id}. ${fact.fact} (${date})`);
      }
    }
  });

memoryCmd
  .command('add-fact')
  .description('Add a fact or preference')
  .argument('<fact>', 'The fact to remember')
  .option('-c, --category <category>', 'Category (default: general)', 'general')
  .action((fact, options) => {
    const store = getMemoryStore();
    const id = store.addFact(fact, options.category);
    console.log(`Fact added (ID: ${id})`);
  });

memoryCmd
  .command('remove-fact <id>')
  .description('Remove a fact by ID')
  .action((id) => {
    const store = getMemoryStore();
    store.removeFact(parseInt(id));
    console.log(`Fact ${id} removed.`);
  });

memoryCmd
  .command('clear')
  .description('Clear all memory (conversations, facts, reminders)')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options) => {
    if (!options.yes) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        rl.question('Are you sure you want to clear ALL memory? (yes/no): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('Cancelled.');
        return;
      }
    }

    const store = getMemoryStore();
    store.clearAll();
    console.log('All memory cleared.');
  });

// ============================================================================
// Reminders
// ============================================================================

program
  .command('remind')
  .description('Set a reminder')
  .argument('<message>', 'Reminder message')
  .option('--at <time>', 'Trigger at specific time (e.g., "5pm", "tomorrow at 9am")')
  .option('--in <duration>', 'Trigger after duration (e.g., "30 minutes", "2 hours")')
  .option('--cron <expression>', 'Cron expression for recurring (e.g., "0 9 * * 1-5")')
  .option('-c, --channel <channel>', 'Alert channel: notification, voice, whatsapp', 'notification')
  .action((message, options) => {
    const store = getMemoryStore();

    let timeSpec;
    if (options.at) {
      timeSpec = options.at;
    } else if (options.in) {
      timeSpec = `in ${options.in}`;
    } else if (options.cron) {
      // Direct cron expression
      const id = store.addReminder(message, null, options.cron, options.channel);
      console.log(`Recurring reminder set (ID: ${id})`);
      console.log(`  Message: ${message}`);
      console.log(`  Cron: ${options.cron}`);
      console.log(`  Channel: ${options.channel}`);
      return;
    } else {
      console.error('Please specify --at, --in, or --cron');
      process.exit(1);
    }

    const parsed = parseReminderTime(timeSpec);
    if (!parsed) {
      console.error(`Could not parse time: "${timeSpec}"`);
      process.exit(1);
    }

    if (parsed.type === 'recurring') {
      const id = store.addReminder(message, null, parsed.cron, options.channel);
      console.log(`Recurring reminder set (ID: ${id})`);
      console.log(`  Message: ${message}`);
      console.log(`  Schedule: ${parsed.description}`);
      console.log(`  Channel: ${options.channel}`);
    } else {
      const triggerAt = parsed.date.toISOString();
      const id = store.addReminder(message, triggerAt, null, options.channel);
      console.log(`Reminder set (ID: ${id})`);
      console.log(`  Message: ${message}`);
      console.log(`  Time: ${parsed.date.toLocaleString()}`);
      console.log(`  Channel: ${options.channel}`);
    }
  });

program
  .command('reminders')
  .description('List pending reminders')
  .action(() => {
    const store = getMemoryStore();
    const reminders = store.getPendingReminders();

    if (reminders.length === 0) {
      console.log('No pending reminders.');
      return;
    }

    console.log('Pending Reminders');
    console.log('=================');

    for (const reminder of reminders) {
      console.log(`\n${reminder.id}. ${reminder.message}`);
      if (reminder.trigger_at) {
        const time = new Date(reminder.trigger_at).toLocaleString();
        console.log(`   Time: ${time}`);
      }
      if (reminder.cron_expression) {
        console.log(`   Cron: ${reminder.cron_expression}`);
      }
      console.log(`   Channel: ${reminder.channel}`);
    }
  });

program
  .command('cancel-reminder <id>')
  .description('Cancel a reminder by ID')
  .action((id) => {
    const store = getMemoryStore();
    const reminder = store.getReminder(parseInt(id));

    if (!reminder) {
      console.error(`Reminder ${id} not found.`);
      process.exit(1);
    }

    store.cancelReminder(parseInt(id));
    console.log(`Reminder ${id} cancelled: "${reminder.message}"`);
  });

program.parse();
