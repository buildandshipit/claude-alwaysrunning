# Architecture

Claude Always Running - Persistent Jarvis-like assistant with voice, memory, reminders, and multiple interfaces.

## Directory Structure

```
src/
├── service.js          # Main daemon - spawns Claude PTY, TCP/WebSocket server (port 3377)
├── client.js           # CLI client - send/connect commands, remote connection support
├── index.js            # Module exports
├── voice-bridge.js     # Voice mode - push-to-talk, STT/TTS integration
├── whatsapp-bridge.js  # WhatsApp Web bridge using whatsapp-web.js
├── providers/
│   ├── stt/            # Speech-to-text providers
│   │   ├── base.js     # Base STT class
│   │   ├── whisper.js  # Whisper CLI integration (local)
│   │   └── index.js
│   └── tts/            # Text-to-speech providers
│       ├── base.js     # Base TTS class
│       ├── edge-tts.js # Microsoft Edge TTS (free neural voices)
│       ├── piper.js    # Piper TTS (offline alternative)
│       └── index.js
├── audio/
│   ├── recorder.js     # Cross-platform audio recording
│   ├── player.js       # Cross-platform audio playback
│   └── index.js
├── auth/
│   ├── api-key.js      # API key auth (SHA-256 hashed storage)
│   └── index.js
├── memory/
│   ├── store.js        # SQLite-backed fact storage
│   ├── context.js      # Context injection for Claude
│   └── index.js
├── scheduler/
│   ├── parser.js       # Natural language date parsing (chrono-node)
│   ├── manager.js      # Reminder/task scheduling (node-cron)
│   └── index.js
├── schedule/
│   ├── schedule-service.js  # Generic periodic job scheduler
│   └── index.js
└── alerts/
    ├── channels.js     # Notification channels (desktop, etc.)
    └── index.js

electron/                # Desktop GUI (React + Vite + Electron)
├── main/
│   ├── index.ts        # Electron main process
│   ├── window.ts       # Window management
│   ├── tray.ts         # System tray
│   ├── ipc-handlers.ts # IPC communication
│   └── service-bridge.ts
├── preload/
│   └── index.ts
└── renderer/src/
    ├── App.tsx
    ├── pages/          # ChatPage, ServicePage, MemoryPage, RemindersPage
    ├── components/     # UI components per feature
    └── hooks/          # useService, useMemory, useReminders, useChat

bin/
└── claude-always.js    # CLI entry point (commander)

deploy/
├── ecosystem.config.js # PM2 config for VPS
├── oracle-setup.sh     # Oracle Cloud ARM setup
└── install-whisper.sh  # Whisper installation

.claude/skills/         # Claude Code skills
├── deploy/SKILL.md
├── stop/SKILL.md
└── schedule/SKILL.md
```

## Key Components

### Service (src/service.js)
- Spawns Claude Code in a PTY (node-pty)
- TCP server on port 3377 for client connections
- WebSocket support for real-time communication
- Handles remote access with API key authentication
- Integrates ScheduleService for periodic jobs

### Client (src/client.js)
- `send` command: Uses `claude --print` for one-shot queries
- `connect` command: Interactive PTY session via TCP
- Supports remote connections with `-h host -k apikey`

### Voice Bridge (src/voice-bridge.js)
- Push-to-talk with SPACE key
- STT via Whisper (auto-downloads models to ~/.claude-alwaysrunning/whisper-models/)
- TTS via Edge TTS or Piper
- Whisper path: Uses local whisper-cli.exe

### WhatsApp Bridge (src/whatsapp-bridge.js)
- whatsapp-web.js integration
- Listens to configurable group (default: "claudebot")
- Uses message_create event for solo group support
- Tracks sent message IDs to prevent loops

### Schedule Service (src/schedule/schedule-service.js)
- Generic periodic job scheduler (singleton)
- Named jobs with interval, handler, metadata
- Lifecycle events: jobStart, jobComplete, jobError
- Built-in jobs: session-save (1h), buffer-cleanup (30m), log-check (2h)

### Memory (src/memory/)
- SQLite storage via better-sqlite3
- Stores facts with categories and timestamps
- Context builder injects relevant facts into prompts

## CLI Commands

```
claude-always start [--remote]  # Start daemon (--remote binds 0.0.0.0)
claude-always stop              # Stop daemon
claude-always status            # Check if running
claude-always restart           # Restart daemon
claude-always logs              # View logs
claude-always connect [-h] [-k] # Interactive session (supports remote)
claude-always send <message>    # One-shot query
claude-always voice [options]   # Voice mode (--stt, --tts, --voice)
claude-always whatsapp [--group]# WhatsApp bridge
claude-always keys add|list|remove  # API key management
```

## WebSocket API

Events emitted by service:
- `output` - Claude response chunks
- `schedule:status` - Job statuses
- `schedule:report` - Summary with stats
- `schedule:run/stop/start` - Job control

## Tech Stack

- **Runtime:** Node.js >= 18
- **PTY:** node-pty
- **Database:** better-sqlite3
- **Scheduling:** node-cron, chrono-node
- **Desktop:** Electron + React + Vite + Tailwind
- **WhatsApp:** whatsapp-web.js
- **Voice:** Whisper (STT), Edge TTS / Piper (TTS)
