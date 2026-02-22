/**
 * Audio Recorder Module
 *
 * Records audio from the microphone using system utilities.
 * Outputs WAV format (16kHz mono) suitable for Whisper.
 */

const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

class AudioRecorder {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.bitsPerSample = options.bitsPerSample || 16;
    this.recording = false;
    this.process = null;
    this.audioChunks = [];
    this.recordingTool = null;
  }

  /**
   * Initialize recorder - detect available recording tool
   */
  async initialize() {
    this.recordingTool = await this.detectRecordingTool();
    if (!this.recordingTool) {
      throw new Error(
        'No audio recording tool found.\n' +
        'Please install one of:\n' +
        '  - Windows: Built-in (uses PowerShell)\n' +
        '  - Linux: sudo apt install sox (rec command)\n' +
        '  - macOS: Built-in (uses rec from sox)'
      );
    }

    // Pre-detect Windows audio device
    if (os.platform() === 'win32' && this.recordingTool === 'ffmpeg') {
      const device = this.getWindowsAudioDevice();
      console.log(`Audio recorder initialized (using: ${this.recordingTool}, device: ${device})`);
    } else {
      console.log(`Audio recorder initialized (using: ${this.recordingTool})`);
    }
  }

  /**
   * Detect available recording tool
   */
  async detectRecordingTool() {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows - use PowerShell with NAudio or ffmpeg
      if (this.hasCommand('ffmpeg')) {
        return 'ffmpeg';
      }
      // Fall back to PowerShell NAudio script
      return 'powershell';
    }

    // Unix-like systems
    if (this.hasCommand('rec')) {
      return 'sox'; // sox's rec command
    }
    if (this.hasCommand('arecord')) {
      return 'arecord'; // ALSA
    }
    if (this.hasCommand('ffmpeg')) {
      return 'ffmpeg';
    }

    return null;
  }

  /**
   * Check if a command exists
   */
  hasCommand(cmd) {
    try {
      const checkCmd = os.platform() === 'win32' ? 'where' : 'which';
      execSync(`${checkCmd} ${cmd}`, { stdio: ['pipe', 'pipe', 'ignore'] });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Start recording
   */
  start() {
    if (this.recording) {
      return;
    }

    this.recording = true;
    this.audioChunks = [];

    switch (this.recordingTool) {
      case 'sox':
        this.startSox();
        break;
      case 'arecord':
        this.startArecord();
        break;
      case 'ffmpeg':
        this.startFFmpeg();
        break;
      case 'powershell':
        this.startPowerShell();
        break;
      default:
        throw new Error('No recording tool available');
    }
  }

  /**
   * Start recording with sox (rec command)
   */
  startSox() {
    this.process = spawn('rec', [
      '-q',                    // Quiet
      '-r', String(this.sampleRate),
      '-c', String(this.channels),
      '-b', String(this.bitsPerSample),
      '-e', 'signed-integer',
      '-t', 'wav',
      '-'                      // Output to stdout
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data) => {
      this.audioChunks.push(data);
    });

    this.process.stderr.on('data', (data) => {
      // Suppress sox messages
    });
  }

  /**
   * Start recording with arecord (ALSA)
   */
  startArecord() {
    this.process = spawn('arecord', [
      '-q',
      '-f', 'S16_LE',
      '-r', String(this.sampleRate),
      '-c', String(this.channels),
      '-t', 'wav',
      '-'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data) => {
      this.audioChunks.push(data);
    });
  }

  /**
   * Get Windows audio input device name
   */
  getWindowsAudioDevice() {
    if (this.cachedAudioDevice) {
      return this.cachedAudioDevice;
    }

    try {
      // List audio devices using ffmpeg (output goes to stderr, exits with code 1)
      let result;
      try {
        result = execSync('ffmpeg -list_devices true -f dshow -i dummy 2>&1', {
          encoding: 'utf8',
          timeout: 5000
        });
      } catch (e) {
        // ffmpeg exits with code 1 but still outputs the device list
        result = e.stdout || e.stderr || (e.output ? e.output.join('') : '');
      }

      // Parse the output to find audio devices
      const lines = result.split('\n');

      for (const line of lines) {
        // Look for lines containing (audio) which indicate audio devices
        if (line.includes('(audio)')) {
          // Extract device name between quotes
          const match = line.match(/"([^"]+)"\s*\(audio\)/);
          if (match) {
            this.cachedAudioDevice = match[1];
            return this.cachedAudioDevice;
          }
        }
      }
    } catch (e) {
      // Fallback - try common names
    }

    // Fallback to generic name
    return 'Microphone';
  }

  /**
   * Start recording with ffmpeg
   */
  startFFmpeg() {
    const platform = os.platform();
    let inputArgs;

    if (platform === 'win32') {
      // Windows - use dshow with detected device
      const audioDevice = this.getWindowsAudioDevice();
      inputArgs = ['-f', 'dshow', '-i', `audio=${audioDevice}`];
    } else if (platform === 'darwin') {
      // macOS - use avfoundation
      inputArgs = ['-f', 'avfoundation', '-i', ':0'];
    } else {
      // Linux - use ALSA or PulseAudio
      inputArgs = ['-f', 'pulse', '-i', 'default'];
    }

    this.process = spawn('ffmpeg', [
      ...inputArgs,
      '-ar', String(this.sampleRate),
      '-ac', String(this.channels),
      '-acodec', 'pcm_s16le',
      '-f', 'wav',
      '-loglevel', 'error',
      '-'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data) => {
      this.audioChunks.push(data);
    });

    this.process.stderr.on('data', (data) => {
      // Capture stderr for debugging
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error('[FFmpeg error]:', msg.trim());
      }
    });
  }

  /**
   * Start recording with PowerShell (Windows fallback)
   */
  startPowerShell() {
    // Use a temp file approach for Windows without ffmpeg
    this.tempFile = path.join(os.tmpdir(), `recording_${Date.now()}.wav`);

    // This is a simplified approach - in practice, you'd want a proper
    // NAudio-based solution or use the SoundRecorder API
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $recorder = New-Object System.Media.SoundPlayer
      Write-Host "Recording started..."
    `;

    // For Windows, we recommend ffmpeg - this is a placeholder
    console.warn('PowerShell recording is limited. Please install ffmpeg for better results.');

    this.process = spawn('powershell', ['-Command', script], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  /**
   * Stop recording and return WAV buffer
   * @returns {Promise<Buffer>} WAV audio data
   */
  async stop() {
    if (!this.recording) {
      return Buffer.alloc(0);
    }

    return new Promise((resolve, reject) => {
      this.recording = false;

      if (!this.process) {
        resolve(Buffer.alloc(0));
        return;
      }

      const proc = this.process;
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        const audioBuffer = Buffer.concat(this.audioChunks);
        this.audioChunks = [];
        this.process = null;

        // Ensure we have valid WAV data
        if (audioBuffer.length < 44) {
          resolve(this.createEmptyWav());
        } else {
          resolve(audioBuffer);
        }
      };

      // Force kill after timeout
      const timeout = setTimeout(() => {
        if (proc && !resolved) {
          try {
            proc.kill('SIGKILL');
          } catch (e) {
            // Ignore
          }
          // Force finish even if close doesn't fire
          setTimeout(finish, 500);
        }
      }, 2000);

      proc.on('close', finish);

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.process = null;
          reject(err);
        }
      });

      // Stop the process
      try {
        if (os.platform() === 'win32' && this.recordingTool === 'ffmpeg') {
          // For ffmpeg on Windows, send 'q' to stdin to quit gracefully
          if (proc.stdin && proc.stdin.writable) {
            proc.stdin.write('q');
            proc.stdin.end();
          } else {
            proc.kill();
          }
        } else if (os.platform() === 'win32') {
          proc.kill();
        } else {
          proc.kill('SIGINT');
        }
      } catch (e) {
        // Process may have already exited
        finish();
      }
    });
  }

  /**
   * Create an empty WAV file buffer
   */
  createEmptyWav() {
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36, 4); // file size - 8
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(this.sampleRate * this.channels * (this.bitsPerSample / 8), 28);
    header.writeUInt16LE(this.channels * (this.bitsPerSample / 8), 32);
    header.writeUInt16LE(this.bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(0, 40);

    return header;
  }

  /**
   * Check if currently recording
   */
  isRecording() {
    return this.recording;
  }

  /**
   * Dispose resources
   */
  dispose() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.recording = false;
    this.audioChunks = [];
  }
}

module.exports = { AudioRecorder };
