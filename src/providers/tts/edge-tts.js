/**
 * Edge TTS Provider
 *
 * Uses Microsoft Edge's free text-to-speech service via Python edge-tts CLI.
 */

const { TTSProvider } = require('./base');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Default voices - these are high-quality neural voices
const DEFAULT_VOICES = {
  'en-US': 'en-US-AriaNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'en-AU': 'en-AU-NatashaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural'
};

class EdgeTTSProvider extends TTSProvider {
  constructor(options = {}) {
    super(options);
    this.voice = options.voice || 'en-US-AriaNeural';
    this.rate = options.rate || '+0%';
    this.volume = options.volume || '+0%';
    this.pitch = options.pitch || '+0Hz';
    this.edgeTTSPath = null;
  }

  get name() {
    return 'edge-tts';
  }

  async initialize() {
    // Find edge-tts command
    this.edgeTTSPath = await this.findEdgeTTS();
    if (!this.edgeTTSPath) {
      throw new Error(
        'edge-tts not found. Please install it:\n' +
        '  pip install edge-tts'
      );
    }
    console.log(`Edge TTS initialized (voice: ${this.voice})`);
  }

  async findEdgeTTS() {
    // Check common locations
    const pythonScriptsDir = path.join(
      os.homedir(),
      'AppData', 'Roaming', 'Python', 'Python313', 'Scripts'
    );

    const possiblePaths = [
      path.join(pythonScriptsDir, 'edge-tts.exe'),
      path.join(pythonScriptsDir, 'edge-tts'),
      'edge-tts' // Try PATH
    ];

    // Also check Python312, Python311, etc.
    for (let v = 313; v >= 38; v--) {
      const dir = path.join(os.homedir(), 'AppData', 'Roaming', 'Python', `Python${v}`, 'Scripts');
      possiblePaths.push(path.join(dir, 'edge-tts.exe'));
      possiblePaths.push(path.join(dir, 'edge-tts'));
    }

    for (const p of possiblePaths) {
      try {
        if (p.includes(path.sep)) {
          // Check if file exists
          if (fs.existsSync(p)) {
            return p;
          }
        } else {
          // Check if command exists in PATH
          const checkCmd = os.platform() === 'win32' ? 'where' : 'which';
          execSync(`${checkCmd} ${p}`, { stdio: ['pipe', 'pipe', 'ignore'] });
          return p;
        }
      } catch (e) {
        // Continue checking
      }
    }

    // Try running python -m edge_tts
    try {
      execSync('python -m edge_tts --help', { stdio: ['pipe', 'pipe', 'ignore'] });
      return 'python -m edge_tts';
    } catch (e) {
      // Not found
    }

    return null;
  }

  async synthesize(text) {
    if (!text || text.trim().length === 0) {
      return Buffer.alloc(0);
    }

    // Use forward slashes for Python compatibility on Windows
    const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`).replace(/\\/g, '/');

    try {
      await this.runEdgeTTS(text, tempFile);

      // Read the audio file
      const audioBuffer = fs.readFileSync(tempFile);
      return audioBuffer;
    } catch (err) {
      console.error('[Edge TTS error]:', err.message);
      throw err;
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch (e) {}
    }
  }

  runEdgeTTS(text, outputFile) {
    return new Promise((resolve, reject) => {
      // Escape text for shell
      const escapedText = text.replace(/"/g, '\\"');

      let cmd, args;

      if (this.edgeTTSPath.startsWith('python')) {
        cmd = 'python';
        args = [
          '-m', 'edge_tts',
          '--voice', this.voice,
          '--rate', this.rate,
          '--volume', this.volume,
          '--pitch', this.pitch,
          '--text', `"${escapedText}"`,
          '--write-media', outputFile
        ];
      } else {
        cmd = this.edgeTTSPath;
        args = [
          '--voice', this.voice,
          '--rate', this.rate,
          '--volume', this.volume,
          '--pitch', this.pitch,
          '--text', `"${escapedText}"`,
          '--write-media', outputFile
        ];
      }

      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true  // Always use shell to handle quoting
      });

      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`edge-tts failed: ${stderr || `exit code ${code}`}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('edge-tts timeout'));
      }, 30000);
    });
  }

  async getVoices() {
    return [
      { id: 'en-US-AriaNeural', name: 'Aria (US Female)', language: 'en-US' },
      { id: 'en-US-GuyNeural', name: 'Guy (US Male)', language: 'en-US' },
      { id: 'en-US-JennyNeural', name: 'Jenny (US Female)', language: 'en-US' },
      { id: 'en-GB-SoniaNeural', name: 'Sonia (UK Female)', language: 'en-GB' },
      { id: 'en-GB-RyanNeural', name: 'Ryan (UK Male)', language: 'en-GB' },
      { id: 'en-AU-NatashaNeural', name: 'Natasha (AU Female)', language: 'en-AU' },
      { id: 'en-AU-WilliamNeural', name: 'William (AU Male)', language: 'en-AU' },
      { id: 'en-IN-NeerjaNeural', name: 'Neerja (IN Female)', language: 'en-IN' }
    ];
  }

  setVoice(voiceId) {
    this.voice = voiceId;
  }

  setRate(rate) {
    this.rate = rate;
  }

  setVolume(volume) {
    this.volume = volume;
  }

  setPitch(pitch) {
    this.pitch = pitch;
  }
}

module.exports = { EdgeTTSProvider, DEFAULT_VOICES };
