# Current State

## Version
3.0.0

## Git Status
- **Branch:** main
- **Status:** Clean

## Recent Changes (newest first)

### 2026-03-14 - Context optimization + service fixes
- Added architecture.md and state.md for faster Claude context loading
- Removed `--dangerously-skip-permissions` flag from service startup
- Removed auto-accept permissions dialog logic
- Fixed async/await syntax error in `handleWsMessage`

### 2026-02-28 - ScheduleService
- Renamed TriggerService to ScheduleService
- Added `/schedule` skill for managing periodic jobs
- Built-in jobs: session-save, buffer-cleanup, log-check
- WebSocket API for job control

### 2026-02-21 - Voice Mode + Remote Access
- Voice mode with push-to-talk (SPACE key)
- Whisper STT (local, auto-downloads models)
- Edge TTS + Piper TTS options
- Remote access with API key auth
- VPS deployment configs (PM2, Oracle Cloud)

### 2026-02-21 - WhatsApp Bridge
- whatsapp-web.js integration
- Group message listening
- Loop prevention via message ID tracking

## Current Work
None - all changes committed.

## Known Issues
None documented.

## Skills Available
- `/deploy` - VPS deployment
- `/stop` - Stop the service
- `/schedule` - Manage periodic jobs (status/report/run/stop/start)

## Environment Notes
- Whisper binary: Local installation required (whisper-cli.exe)
- Models auto-download to: ~/.claude-alwaysrunning/whisper-models/
- Service port: 3377
- Remote mode binds to 0.0.0.0 (requires API key)
