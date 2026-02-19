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
  showStatus
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
  .action(async (options) => {
    const status = await getServiceStatus();

    if (status.running) {
      console.log(`Service already running (PID: ${status.pid}, Port: ${status.port})`);
      console.log('Use "claude-always stop" to stop it first.');
      return;
    }

    if (options.foreground) {
      const svc = new ClaudeService({ port: parseInt(options.port) });
      await svc.start();
    } else {
      console.log('Starting Claude service...');

      const child = spawn(process.execPath, [__filename, 'start', '-f', '-p', options.port], {
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
        console.log('');
        console.log('Commands:');
        console.log('  claude-always connect        Interactive session');
        console.log('  claude-always send "text"    Send a command');
        console.log('  claude-always status         Check status');
        console.log('  claude-always stop           Stop service');
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
  .action(async (options) => {
    await runInteractive(options);
  });

program
  .command('send')
  .description('Send a command to Claude and show response')
  .argument('<command>', 'Command to send')
  .option('-w, --wait <seconds>', 'Max wait time in seconds (default: 5, use 0 to not wait)')
  .option('-p, --port <port>', 'Service port')
  .action(async (command, options) => {
    await sendCommand(command, options);
  });

program.parse();
