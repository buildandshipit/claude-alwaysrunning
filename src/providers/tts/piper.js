/**
 * Piper TTS Provider
 *
 * Uses Piper (https://github.com/rhasspy/piper) for local TTS.
 * Fully offline neural TTS with multiple voices.
 */

const { TTSProvider } = require('./base');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

// Piper voice models (onnx format)
const VOICE_URLS = {
  'en_US-lessac-medium': 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
  'en_US-lessac-medium.json': 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
  'en_GB-alan-medium': 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx',
  'en_GB-alan-medium.json': 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json'
};

class PiperProvider extends TTSProvider {
  constructor(options = {}) {
    super(options);
    this.voice = options.voice || 'en_US-lessac-medium';
    this.modelsDir = path.join(os.homedir(), '.claude-alwaysrunning', 'piper-voices');
    this.piperPath = null;
  }

  get name() {
    return 'piper';
  }

  async initialize() {
    console.log(`Initializing Piper TTS (voice: ${this.voice})...`);

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    // Find piper executable
    this.piperPath = await this.findPiper();
    if (!this.piperPath) {
      throw new Error(
        'Piper not found. Please install piper:\n' +
        '  - Download from https://github.com/rhasspy/piper/releases\n' +
        '  - Extract and add to PATH'
      );
    }

    // Download voice model if needed
    const modelFile = path.join(this.modelsDir, `${this.voice}.onnx`);
    const configFile = path.join(this.modelsDir, `${this.voice}.onnx.json`);

    if (!fs.existsSync(modelFile) || !fs.existsSync(configFile)) {
      await this.downloadVoice();
    }

    console.log(`Piper initialized (voice: ${this.voice})`);
  }

  async findPiper() {
    const isWindows = os.platform() === 'win32';
    const names = isWindows ? ['piper.exe'] : ['piper'];

    // Check in PATH
    for (const name of names) {
      try {
        const cmd = isWindows ? 'where' : 'which';
        const result = execSync(`${cmd} ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const piperPath = result.trim().split('\n')[0];
        if (piperPath && fs.existsSync(piperPath)) {
          return piperPath;
        }
      } catch (e) {
        // Not found
      }
    }

    // Check common locations
    const commonPaths = isWindows
      ? [
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'piper', 'piper.exe'),
          path.join(os.homedir(), 'piper', 'piper.exe')
        ]
      : [
          '/usr/local/bin/piper',
          '/opt/piper/piper',
          path.join(os.homedir(), 'piper', 'piper')
        ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  async downloadVoice() {
    const modelUrl = VOICE_URLS[this.voice];
    const configUrl = VOICE_URLS[`${this.voice}.json`];

    if (!modelUrl || !configUrl) {
      throw new Error(`Unknown voice: ${this.voice}`);
    }

    console.log(`Downloading Piper voice ${this.voice}...`);

    const modelPath = path.join(this.modelsDir, `${this.voice}.onnx`);
    const configPath = path.join(this.modelsDir, `${this.voice}.onnx.json`);

    await this.downloadFile(modelUrl, modelPath);
    await this.downloadFile(configUrl, configPath);

    console.log('Voice downloaded successfully.');
  }

  downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      const download = (downloadUrl) => {
        https.get(downloadUrl, { headers: { 'User-Agent': 'claude-alwaysrunning' } }, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            download(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            fs.unlinkSync(destPath);
            reject(new Error(`Failed to download: ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      };

      download(url);
    });
  }

  async synthesize(text) {
    if (!text || text.trim().length === 0) {
      return Buffer.alloc(0);
    }

    if (!this.piperPath) {
      throw new Error('Piper not initialized');
    }

    const modelPath = path.join(this.modelsDir, `${this.voice}.onnx`);

    return new Promise((resolve, reject) => {
      const piper = spawn(this.piperPath, [
        '--model', modelPath,
        '--output-raw'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const audioChunks = [];
      let stderr = '';

      piper.stdout.on('data', (data) => {
        audioChunks.push(data);
      });

      piper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      piper.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Piper failed: ${stderr}`));
          return;
        }

        // Piper outputs raw PCM, wrap in WAV header
        const pcmData = Buffer.concat(audioChunks);
        const wavBuffer = this.createWavFromPCM(pcmData, 22050, 1, 16);
        resolve(wavBuffer);
      });

      piper.on('error', (err) => {
        reject(err);
      });

      // Send text to piper via stdin
      piper.stdin.write(text);
      piper.stdin.end();

      // Timeout after 30 seconds
      setTimeout(() => {
        piper.kill();
        reject(new Error('Piper synthesis timeout'));
      }, 30000);
    });
  }

  /**
   * Create WAV buffer from raw PCM data
   */
  createWavFromPCM(pcmData, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmData.length, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20); // audio format (PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(pcmData.length, 40);

    return Buffer.concat([header, pcmData]);
  }

  async getVoices() {
    return [
      { id: 'en_US-lessac-medium', name: 'Lessac (US)', language: 'en-US' },
      { id: 'en_GB-alan-medium', name: 'Alan (UK)', language: 'en-GB' }
    ];
  }

  async isAvailable() {
    try {
      const piper = await this.findPiper();
      return !!piper;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { PiperProvider };
