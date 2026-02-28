---
name: triggers
description: Manage periodic trigger jobs (status, run, stop, start)
disable-model-invocation: true
allowed-tools: Bash, Read
argument-hint: "[status|report|run|stop|start] [job-name]"
---

# Trigger Management

Manage periodic jobs in the claude-alwaysrunning TriggerService.

## Arguments

- No args or `status`: Show all trigger statuses
- `report`: Show detailed report with summary stats
- `run <name>`: Manually execute a trigger immediately
- `stop <name>`: Stop a running trigger
- `start <name>`: Start a stopped trigger
- `list`: List all registered triggers

## Available Triggers

| Name | Interval | Description |
|------|----------|-------------|
| `session-save` | 1 hour | Auto-save session info to memory |
| `buffer-cleanup` | 30 min | Clean up old output buffer entries |
| `log-check` | 2 hours | Check log file size and rotate if needed |

## Commands

### View Status (default)

Show current status of all triggers:

```bash
# Connect to WebSocket and query status
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3378');
ws.on('open', () => ws.send(JSON.stringify({ type: 'triggers:status' })));
ws.on('message', (data) => { console.log(JSON.parse(data).data); ws.close(); });
"
```

### View Report

Show summary with stats:

```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3378');
ws.on('open', () => ws.send(JSON.stringify({ type: 'triggers:report' })));
ws.on('message', (data) => {
  const report = JSON.parse(data).data;
  console.log('=== Summary ===');
  console.log(report.summary);
  console.log('\n=== Jobs ===');
  Object.entries(report.jobs).forEach(([name, job]) => {
    console.log(\`\n\${name}:\`);
    console.log(\`  Enabled: \${job.enabled}, Interval: \${job.intervalHuman}\`);
    console.log(\`  Runs: \${job.runCount}, Last: \${job.lastRun || 'never'}\`);
    if (job.lastError) console.log(\`  Error: \${job.lastError}\`);
  });
  ws.close();
});
"
```

### Run Trigger Manually

Execute a trigger immediately (outside of schedule):

```bash
# Replace JOB_NAME with: session-save, buffer-cleanup, or log-check
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3378');
ws.on('open', () => ws.send(JSON.stringify({ type: 'triggers:run', name: 'JOB_NAME' })));
ws.on('message', (data) => { console.log(JSON.parse(data)); ws.close(); });
"
```

### Stop a Trigger

Stop a trigger from running:

```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3378');
ws.on('open', () => ws.send(JSON.stringify({ type: 'triggers:stop', name: 'JOB_NAME' })));
ws.on('message', (data) => { console.log(JSON.parse(data)); ws.close(); });
"
```

### Start a Trigger

Start a previously stopped trigger:

```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3378');
ws.on('open', () => ws.send(JSON.stringify({ type: 'triggers:start', name: 'JOB_NAME', immediate: false })));
ws.on('message', (data) => { console.log(JSON.parse(data)); ws.close(); });
"
```

## Execution Instructions

Based on the argument provided:

1. **No args / `status` / `list`**: Run the status command to show all triggers
2. **`report`**: Run the report command for detailed stats
3. **`run <name>`**: Replace JOB_NAME with the provided name and run the trigger
4. **`stop <name>`**: Replace JOB_NAME with the provided name and stop it
5. **`start <name>`**: Replace JOB_NAME with the provided name and start it

Parse `$ARGUMENTS` to determine which command to run.

## Prerequisites

- Service must be running (`claude-always start`)
- WebSocket server must be accessible on port 3378

Check if service is running first:
```bash
claude-always status
```

## Programmatic Usage

For direct Node.js usage:

```javascript
const { getTriggerService } = require('claude-alwaysrunning');
const triggers = getTriggerService();

// Get status
console.log(triggers.getAllStatus());

// Get report
console.log(triggers.getReport());

// Run manually
await triggers.trigger('session-save');

// Stop/start
triggers.stop('session-save');
triggers.startJob('session-save');
```
