# Claude Always Running

Run Claude Code as a persistent background service that auto-restarts and accepts commands from any terminal.

## Features

- **Always Running**: Claude runs as a background daemon
- **Auto-Restart**: Automatically restarts if Claude crashes (up to 10 attempts)
- **Send Commands**: Send commands from any terminal via TCP socket
- **Receive Responses**: See Claude's output in real-time
- **Interactive Mode**: Connect for a full interactive session
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Installation

```bash
cd claude-alwaysrunning
npm install
npm link
```

## Quick Start

```bash
# Start the background service
claude-always start

# Send a command
claude-always send "help me with my code"

# Connect interactively
claude-always connect

# Stop the service
claude-always stop
```

## Commands

### Service Management

```bash
# Start service in background
claude-always start

# Start on custom port
claude-always start -p 4000

# Start in foreground (for debugging)
claude-always start -f

# Stop service
claude-always stop

# Restart service
claude-always restart

# Check status
claude-always status

# View logs
claude-always logs
claude-always logs -f    # Follow mode
claude-always logs -n 100  # Last 100 lines
```

### Sending Commands

```bash
# Send a command
claude-always send "explain this code"

# Send and wait for response (5 seconds)
claude-always send "what is 2+2" -w 5

# Send to specific port
claude-always send "hello" -p 4000
```

### Interactive Session

```bash
# Connect to Claude interactively
claude-always connect

# Press Ctrl+C to disconnect
```

## Architecture

```
┌─────────────────────────────────────────┐
│          Claude Service (Daemon)         │
│  ┌─────────────┐     ┌──────────────┐   │
│  │  Claude PTY │     │  TCP Server  │   │
│  │  (node-pty) │     │  (port 3377) │   │
│  └─────────────┘     └──────────────┘   │
│         │                    ▲           │
│         │ auto-restart       │           │
│         ▼                    │           │
│    [If crashes]              │           │
└─────────────────────────────────────────┘
                               │
         ┌─────────────────────┤
         │       TCP           │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│   Terminal 1    │   │   Terminal 2    │
│ claude-always   │   │ claude-always   │
│    connect      │   │  send "..."     │
└─────────────────┘   └─────────────────┘
```

## How It Works

1. **Start**: Service spawns Claude in a PTY and starts TCP server on port 3377
2. **Auto-Restart**: If Claude exits, service restarts it after 2 seconds
3. **Connect**: Clients connect via TCP to send commands and receive output
4. **Stop**: Graceful shutdown notifies clients and kills Claude process

## Configuration

Files stored in `~/.claude-alwaysrunning/`:

| File | Purpose |
|------|---------|
| `service.pid` | Service process ID |
| `service.port` | TCP port number |
| `service.log` | Service logs |

## API

### TCP Protocol

The service uses newline-delimited JSON over TCP (port 3377):

**Send command:**
```json
{"type": "command", "data": "your command here"}
```

**Get status:**
```json
{"type": "status"}
```

**Get history:**
```json
{"type": "history", "limit": 100}
```

### Programmatic Usage

```javascript
const { ClaudeClient } = require('claude-alwaysrunning');

const client = new ClaudeClient();
await client.connect();

// Send command
client.sendCommand('hello');

// Get status
const status = await client.getStatus();
console.log(status);

// Handle output
client.outputHandler = (data) => console.log(data);

client.disconnect();
```

## Troubleshooting

### Service won't start

```bash
# Check if already running
claude-always status

# Check logs
claude-always logs

# Try foreground mode
claude-always start -f
```

### Can't connect

```bash
# Verify service is running
claude-always status

# Check port
netstat -an | findstr 3377  # Windows
netstat -an | grep 3377     # Linux/macOS
```

### "claude" not found

Make sure Claude Code is installed and in PATH:
```bash
where claude  # Windows
which claude  # Linux/macOS
```

## Requirements

- Node.js 18+
- Claude Code CLI installed and in PATH

## License

MIT
