/**
 * Edge TTS Provider
 *
 * Uses Microsoft Edge's free text-to-speech service.
 * Based on the edge-tts protocol (WebSocket connection to Azure TTS).
 */

const { TTSProvider } = require('./base');
const crypto = require('crypto');
const https = require('https');
const WebSocket = require('ws');

// Edge TTS WebSocket endpoint
const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

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
  }

  get name() {
    return 'edge-tts';
  }

  async initialize() {
    console.log(`Edge TTS initialized (voice: ${this.voice})`);
  }

  /**
   * Generate headers for Edge TTS connection
   */
  getHeaders() {
    const date = new Date().toUTCString();
    return {
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    };
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId() {
    return crypto.randomUUID().replace(/-/g, '');
  }

  /**
   * Create SSML markup for the text
   */
  createSSML(text) {
    // Escape XML special characters
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
      <voice name="${this.voice}">
        <prosody rate="${this.rate}" volume="${this.volume}" pitch="${this.pitch}">
          ${escaped}
        </prosody>
      </voice>
    </speak>`;
  }

  /**
   * Create WebSocket configuration message
   */
  createConfigMessage(requestId) {
    const timestamp = new Date().toISOString();
    return `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
  }

  /**
   * Create SSML message for synthesis
   */
  createSSMLMessage(requestId, ssml) {
    const timestamp = new Date().toISOString();
    return `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`;
  }

  async synthesize(text) {
    if (!text || text.trim().length === 0) {
      return Buffer.alloc(0);
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      const ssml = this.createSSML(text);
      const audioChunks = [];

      // Connect to Edge TTS WebSocket
      const wsUrl = `${WSS_URL}?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;

      const ws = new WebSocket(wsUrl, {
        headers: this.getHeaders()
      });

      let configSent = false;
      let timeout = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };

      // Timeout after 30 seconds
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Edge TTS synthesis timeout'));
      }, 30000);

      ws.on('open', () => {
        // Send config first
        ws.send(this.createConfigMessage(requestId));
        configSent = true;

        // Then send SSML
        ws.send(this.createSSMLMessage(requestId, ssml));
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Binary message contains audio data
          // First 2 bytes are header length
          const headerLength = data.readUInt16BE(0);
          const audioData = data.slice(headerLength + 2);
          if (audioData.length > 0) {
            audioChunks.push(audioData);
          }
        } else {
          // Text message - check for turn.end
          const message = data.toString();
          if (message.includes('Path:turn.end')) {
            cleanup();
            const audioBuffer = Buffer.concat(audioChunks);
            resolve(audioBuffer);
          }
        }
      });

      ws.on('error', (err) => {
        cleanup();
        reject(err);
      });

      ws.on('close', (code, reason) => {
        cleanup();
        if (audioChunks.length === 0) {
          reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
        }
      });
    });
  }

  async getVoices() {
    // Return a selection of popular voices
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

  /**
   * Set speech rate
   * @param {string} rate - Rate adjustment (e.g., '+20%', '-10%', '1.5')
   */
  setRate(rate) {
    this.rate = rate;
  }

  /**
   * Set volume
   * @param {string} volume - Volume adjustment (e.g., '+0%', '-20%')
   */
  setVolume(volume) {
    this.volume = volume;
  }

  /**
   * Set pitch
   * @param {string} pitch - Pitch adjustment (e.g., '+0Hz', '-50Hz')
   */
  setPitch(pitch) {
    this.pitch = pitch;
  }
}

module.exports = { EdgeTTSProvider, DEFAULT_VOICES };
