/**
 * STT Provider Base Class
 *
 * All STT providers must implement the transcribe() method.
 */

class STTProvider {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  get name() {
    throw new Error('STT provider must implement name getter');
  }

  /**
   * Initialize the provider (download models, etc.)
   * @returns {Promise<void>}
   */
  async initialize() {
    // Override in subclass if needed
  }

  /**
   * Transcribe audio to text
   * @param {Buffer} audioBuffer - Audio data (WAV format, 16kHz mono)
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribe(audioBuffer) {
    throw new Error('STT provider must implement transcribe()');
  }

  /**
   * Check if provider is available (dependencies installed, etc.)
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

module.exports = { STTProvider };
