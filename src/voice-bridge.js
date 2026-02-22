/**
 * Claude Always Running - Voice Bridge
 *
 * Push-to-talk voice interface for Claude.
 * Uses STT for speech recognition and TTS for responses.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const { createSTTProvider } = require('./providers/stt');
const { createTTSProvider } = require('./providers/tts');
const { AudioRecorder } = require('./audio/recorder');
const { AudioPlayer } = require('./audio/player');

class VoiceBridge {
  constructor(options = {}) {
    this.sttProvider = options.sttProvider || 'whisper';
    this.ttsProvider = options.ttsProvider || 'edge-tts';
    this.sttOptions = options.sttOptions || {};
    this.ttsOptions = options.ttsOptions || {};
    this.maxTimeout = options.maxTimeout || 300000;
    this.continuous = options.continuous || false;

    this.stt = null;
    this.tts = null;
    this.recorder = null;
    this.player = null;
    this.recording = false;
    this.processing = false;
    this.running = false;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('Initializing Voice Bridge...');
    console.log('');

    // Initialize STT
    console.log(`Setting up STT (${this.sttProvider})...`);
    this.stt = createSTTProvider(this.sttProvider, this.sttOptions);
    await this.stt.initialize();

    // Initialize TTS
    console.log(`Setting up TTS (${this.ttsProvider})...`);
    this.tts = createTTSProvider(this.ttsProvider, this.ttsOptions);
    await this.tts.initialize();

    // Initialize audio recorder
    console.log('Setting up audio recorder...');
    this.recorder = new AudioRecorder();
    await this.recorder.initialize();

    // Initialize audio player
    console.log('Setting up audio player...');
    this.player = new AudioPlayer();
    await this.player.initialize();

    console.log('');
    console.log('Voice Bridge ready!');
  }

  /**
   * Start the voice bridge
   */
  async start() {
    this.running = true;

    console.log('');
    console.log('============================================');
    console.log('  JARVIS Voice Mode');
    console.log('============================================');
    console.log('');
    console.log('Controls:');
    console.log('  SPACE    - Toggle recording (push-to-talk)');
    console.log('  ENTER    - Send current recording');
    console.log('  Q        - Quit');
    console.log('');
    console.log('Waiting for input...');
    console.log('');

    // Set up keyboard input
    await this.setupKeyboardInput();
  }

  /**
   * Setup keyboard input handling
   */
  async setupKeyboardInput() {
    // Enable raw mode for immediate keypress detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        await this.stop();
        process.exit(0);
        return;
      }

      // Handle Q to quit
      if (key.toLowerCase() === 'q') {
        await this.stop();
        process.exit(0);
        return;
      }

      // Handle SPACE to toggle recording
      if (key === ' ') {
        if (this.processing) {
          console.log('[Busy processing, please wait...]');
          return;
        }

        if (this.recording) {
          await this.stopRecordingAndProcess();
        } else {
          this.startRecording();
        }
        return;
      }

      // Handle ENTER to send (same as stopping recording)
      if (key === '\r' || key === '\n') {
        if (this.recording) {
          await this.stopRecordingAndProcess();
        }
        return;
      }
    });
  }

  /**
   * Start recording audio
   */
  startRecording() {
    if (this.recording || this.processing) {
      return;
    }

    console.log('');
    console.log('[Recording... Press SPACE to stop]');
    this.recording = true;
    this.recorder.start();
  }

  /**
   * Stop recording and process the audio
   */
  async stopRecordingAndProcess() {
    if (!this.recording) {
      return;
    }

    this.recording = false;
    this.processing = true;

    console.log('[Stopping recording...]');

    try {
      // Stop recording and get audio buffer
      const audioBuffer = await this.recorder.stop();

      if (audioBuffer.length < 1000) {
        console.log('[Recording too short, please try again]');
        this.processing = false;
        return;
      }

      // Transcribe audio
      console.log('[Transcribing...]');
      const text = await this.stt.transcribe(audioBuffer);

      if (!text || text.trim().length === 0) {
        console.log('[No speech detected, please try again]');
        this.processing = false;
        return;
      }

      console.log('');
      console.log(`You: ${text}`);
      console.log('');

      // Send to Claude
      console.log('[Thinking...]');
      const response = await this.sendToClaude(text);

      if (response) {
        console.log('');
        console.log(`Claude: ${response}`);
        console.log('');

        // Speak the response (truncate if too long for TTS)
        let textToSpeak = response;
        const maxLength = 2000; // Edge TTS works best with shorter text
        if (textToSpeak.length > maxLength) {
          textToSpeak = textToSpeak.substring(0, maxLength) + '... Response truncated for speech.';
          console.log('[Response truncated for speech]');
        }

        try {
          console.log('[Speaking...]');
          const audioResponse = await this.tts.synthesize(textToSpeak);
          if (audioResponse && audioResponse.length > 0) {
            await this.player.play(audioResponse);
          } else {
            console.log('[TTS returned empty audio]');
          }
        } catch (ttsErr) {
          console.error(`[TTS Error: ${ttsErr.message}]`);
        }
      }

      console.log('');
      console.log('[Ready for next input... Press SPACE to record]');

    } catch (err) {
      console.error(`[Error: ${err.message}]`);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Send text to Claude and get response
   */
  sendToClaude(text) {
    return new Promise((resolve, reject) => {
      const escapedText = text.replace(/"/g, '\\"');
      const command = `claude --print --continue --dangerously-skip-permissions "${escapedText}"`;

      const claude = spawn(command, [], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      claude.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      claude.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Claude exited with code ${code}`));
        }
      });

      claude.on('error', (err) => {
        reject(err);
      });

      // Timeout
      setTimeout(() => {
        claude.kill();
        reject(new Error('Claude timeout'));
      }, this.maxTimeout);
    });
  }

  /**
   * Stop the voice bridge
   */
  async stop() {
    console.log('');
    console.log('Stopping Voice Bridge...');

    this.running = false;

    if (this.recorder) {
      this.recorder.dispose();
    }
    if (this.player) {
      this.player.dispose();
    }
    if (this.stt) {
      await this.stt.dispose();
    }
    if (this.tts) {
      await this.tts.dispose();
    }

    // Restore terminal
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    console.log('Voice Bridge stopped.');
  }
}

/**
 * Run the voice bridge
 */
async function runVoiceBridge(options = {}) {
  const bridge = new VoiceBridge(options);

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    await bridge.stop();
    process.exit(0);
  });

  try {
    await bridge.initialize();
    await bridge.start();
  } catch (err) {
    console.error('');
    console.error('Failed to start Voice Bridge:');
    console.error(err.message);
    console.error('');
    process.exit(1);
  }
}

module.exports = {
  VoiceBridge,
  runVoiceBridge
};
