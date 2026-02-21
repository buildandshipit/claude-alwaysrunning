/**
 * Whisper STT Provider
 *
 * Uses whisper.cpp via node bindings for local speech recognition.
 * Automatically downloads models on first use.
 */

const { STTProvider } = require('./base');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

// Model URLs from Hugging Face
const MODEL_URLS = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  'small.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
};

const MODEL_SIZES = {
  tiny: 75,      // MB
  'tiny.en': 75,
  base: 142,
  'base.en': 142,
  small: 466,
  'small.en': 466
};

class WhisperProvider extends STTProvider {
  constructor(options = {}) {
    super(options);
    this.modelSize = options.model || 'base.en';
    this.language = options.language || 'en';
    this.modelsDir = path.join(os.homedir(), '.claude-alwaysrunning', 'whisper-models');
    this.whisperPath = null; // Path to whisper executable
    this.modelPath = null;
  }

  get name() {
    return 'whisper';
  }

  async initialize() {
    console.log(`Initializing Whisper (${this.modelSize} model)...`);

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    // Check for whisper executable
    this.whisperPath = await this.findWhisper();
    if (!this.whisperPath) {
      throw new Error(
        'Whisper not found. Please install whisper.cpp:\n' +
        '  - Windows: Download from https://github.com/ggerganov/whisper.cpp/releases\n' +
        '  - Linux/Mac: brew install whisper-cpp OR build from source'
      );
    }

    // Download model if needed
    const modelFile = `ggml-${this.modelSize}.bin`;
    this.modelPath = path.join(this.modelsDir, modelFile);

    if (!fs.existsSync(this.modelPath)) {
      await this.downloadModel();
    }

    console.log(`Whisper initialized (model: ${this.modelPath})`);
  }

  async findWhisper() {
    const isWindows = os.platform() === 'win32';
    const names = isWindows
      ? ['whisper.exe', 'main.exe', 'whisper-cpp.exe']
      : ['whisper', 'whisper-cpp', 'main'];

    // Check in PATH
    for (const name of names) {
      try {
        const cmd = isWindows ? 'where' : 'which';
        const result = execSync(`${cmd} ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const whisperPath = result.trim().split('\n')[0];
        if (whisperPath && fs.existsSync(whisperPath)) {
          return whisperPath;
        }
      } catch (e) {
        // Not found
      }
    }

    // Check common locations
    const commonPaths = isWindows
      ? [
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'whisper.cpp', 'whisper.exe'),
          path.join(os.homedir(), 'whisper.cpp', 'main.exe'),
          'C:\\whisper.cpp\\main.exe'
        ]
      : [
          '/usr/local/bin/whisper',
          '/opt/homebrew/bin/whisper',
          path.join(os.homedir(), 'whisper.cpp', 'main')
        ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  async downloadModel() {
    const url = MODEL_URLS[this.modelSize];
    if (!url) {
      throw new Error(`Unknown model: ${this.modelSize}. Available: ${Object.keys(MODEL_URLS).join(', ')}`);
    }

    const sizeMB = MODEL_SIZES[this.modelSize] || '?';
    console.log(`Downloading Whisper ${this.modelSize} model (~${sizeMB}MB)...`);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(this.modelPath);
      let downloadedBytes = 0;
      let totalBytes = 0;

      const download = (downloadUrl) => {
        https.get(downloadUrl, { headers: { 'User-Agent': 'claude-alwaysrunning' } }, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            download(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            fs.unlinkSync(this.modelPath);
            reject(new Error(`Failed to download model: ${response.statusCode}`));
            return;
          }

          totalBytes = parseInt(response.headers['content-length'], 10);

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            const progress = totalBytes
              ? Math.round((downloadedBytes / totalBytes) * 100)
              : '?';
            process.stdout.write(`\rDownloading... ${progress}%`);
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            console.log('\nModel downloaded successfully.');
            resolve();
          });

          file.on('error', (err) => {
            fs.unlinkSync(this.modelPath);
            reject(err);
          });
        }).on('error', (err) => {
          fs.unlinkSync(this.modelPath);
          reject(err);
        });
      };

      download(url);
    });
  }

  async transcribe(audioBuffer) {
    if (!this.whisperPath || !this.modelPath) {
      throw new Error('Whisper not initialized. Call initialize() first.');
    }

    // Write audio to temp file (whisper.cpp reads files)
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `whisper_input_${Date.now()}.wav`);

    try {
      fs.writeFileSync(tempFile, audioBuffer);

      return new Promise((resolve, reject) => {
        const args = [
          '-m', this.modelPath,
          '-f', tempFile,
          '-l', this.language,
          '--no-timestamps',
          '-nt' // No timestamps in output
        ];

        const whisper = spawn(this.whisperPath, args, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        whisper.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        whisper.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        whisper.on('close', (code) => {
          // Clean up temp file
          try { fs.unlinkSync(tempFile); } catch (e) {}

          if (code !== 0) {
            reject(new Error(`Whisper failed: ${stderr || stdout}`));
            return;
          }

          // Parse output - whisper outputs transcription to stdout
          const text = stdout.trim();
          resolve(text);
        });

        whisper.on('error', (err) => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
          reject(err);
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          whisper.kill();
          try { fs.unlinkSync(tempFile); } catch (e) {}
          reject(new Error('Whisper transcription timeout'));
        }, 30000);
      });
    } catch (err) {
      try { fs.unlinkSync(tempFile); } catch (e) {}
      throw err;
    }
  }

  async isAvailable() {
    try {
      const whisper = await this.findWhisper();
      return !!whisper;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { WhisperProvider };
