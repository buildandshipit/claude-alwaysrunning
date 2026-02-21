/**
 * TTS Provider Base Class
 *
 * All TTS providers must implement the synthesize() method.
 */

class TTSProvider {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  get name() {
    throw new Error('TTS provider must implement name getter');
  }

  /**
   * Initialize the provider
   * @returns {Promise<void>}
   */
  async initialize() {
    // Override in subclass if needed
  }

  /**
   * Synthesize text to audio
   * @param {string} text - Text to synthesize
   * @returns {Promise<Buffer>} - Audio data (MP3 or WAV)
   */
  async synthesize(text) {
    throw new Error('TTS provider must implement synthesize()');
  }

  /**
   * Get available voices
   * @returns {Promise<Array<{id: string, name: string, language: string}>>}
   */
  async getVoices() {
    return [];
  }

  /**
   * Set the voice to use
   * @param {string} voiceId - Voice identifier
   */
  setVoice(voiceId) {
    this.options.voice = voiceId;
  }

  /**
   * Check if provider is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return true;
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async dispose() {
    // Override in subclass if needed
  }
}

module.exports = { TTSProvider };
