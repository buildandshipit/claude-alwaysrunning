/**
 * Audio Player Module
 *
 * Plays audio through system speakers.
 * Supports WAV and MP3 formats.
 */

const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

class AudioPlayer {
  constructor(options = {}) {
    this.playing = false;
    this.process = null;
    this.playbackTool = null;
    this.volume = options.volume || 100; // 0-100
  }

  /**
   * Initialize player - detect available playback tool
   */
  async initialize() {
    this.playbackTool = await this.detectPlaybackTool();
    if (!this.playbackTool) {
      throw new Error(
        'No audio playback tool found.\n' +
        'Please install one of:\n' +
        '  - Windows: Built-in (uses PowerShell/Windows Media Player)\n' +
        '  - Linux: sudo apt install sox ffplay (play command)\n' +
        '  - macOS: Built-in (uses afplay)'
      );
    }
    console.log(`Audio player initialized (using: ${this.playbackTool})`);
  }

  /**
   * Detect available playback tool
   */
  async detectPlaybackTool() {
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS - afplay is built-in
      return 'afplay';
    }

    if (platform === 'win32') {
      // Windows - try ffplay, then PowerShell
      if (this.hasCommand('ffplay')) {
        return 'ffplay';
      }
      return 'powershell';
    }

    // Linux
    if (this.hasCommand('play')) {
      return 'sox'; // sox's play command
    }
    if (this.hasCommand('ffplay')) {
      return 'ffplay';
    }
    if (this.hasCommand('aplay')) {
      return 'aplay'; // ALSA (WAV only)
    }
    if (this.hasCommand('paplay')) {
      return 'paplay'; // PulseAudio
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
   * Play audio from buffer
   * @param {Buffer} audioBuffer - Audio data (WAV or MP3)
   * @returns {Promise<void>}
   */
  async play(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
      return;
    }

    // Determine format from buffer
    const format = this.detectFormat(audioBuffer);

    // Write to temp file (most tools need a file)
    const tempFile = path.join(os.tmpdir(), `playback_${Date.now()}.${format}`);

    try {
      fs.writeFileSync(tempFile, audioBuffer);
      await this.playFile(tempFile);
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch (e) {}
    }
  }

  /**
   * Detect audio format from buffer
   */
  detectFormat(buffer) {
    // Check for WAV header (RIFF....WAVE)
    if (buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WAVE') {
      return 'wav';
    }

    // Check for MP3 (ID3 tag or frame sync)
    if (buffer.length >= 3) {
      if (buffer.toString('ascii', 0, 3) === 'ID3' ||
          (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
        return 'mp3';
      }
    }

    // Default to wav
    return 'wav';
  }

  /**
   * Play audio file
   * @param {string} filePath - Path to audio file
   * @returns {Promise<void>}
   */
  playFile(filePath) {
    return new Promise((resolve, reject) => {
      if (this.playing) {
        this.stop();
      }

      this.playing = true;

      switch (this.playbackTool) {
        case 'afplay':
          this.process = spawn('afplay', [filePath], { stdio: 'ignore' });
          break;

        case 'sox':
          this.process = spawn('play', ['-q', filePath], { stdio: 'ignore' });
          break;

        case 'ffplay':
          this.process = spawn('ffplay', [
            '-nodisp',      // No video display
            '-autoexit',    // Exit when done
            '-loglevel', 'error',
            filePath
          ], { stdio: 'ignore' });
          break;

        case 'aplay':
          this.process = spawn('aplay', ['-q', filePath], { stdio: 'ignore' });
          break;

        case 'paplay':
          this.process = spawn('paplay', [filePath], { stdio: 'ignore' });
          break;

        case 'powershell':
          // Use Windows Media Player COM object
          const script = `
            $player = New-Object System.Media.SoundPlayer "${filePath.replace(/\\/g, '\\\\')}"
            $player.PlaySync()
          `;
          this.process = spawn('powershell', ['-Command', script], { stdio: 'ignore' });
          break;

        default:
          this.playing = false;
          reject(new Error('No playback tool available'));
          return;
      }

      this.process.on('close', (code) => {
        this.playing = false;
        this.process = null;
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Playback failed with code ${code}`));
        }
      });

      this.process.on('error', (err) => {
        this.playing = false;
        this.process = null;
        reject(err);
      });

      // Timeout after 5 minutes (for very long audio)
      setTimeout(() => {
        if (this.playing) {
          this.stop();
          resolve();
        }
      }, 300000);
    });
  }

  /**
   * Stop playback
   */
  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.playing = false;
  }

  /**
   * Check if currently playing
   */
  isPlaying() {
    return this.playing;
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(100, volume));
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.stop();
  }
}

module.exports = { AudioPlayer };
