/**
 * TTS Provider Factory
 */

const { TTSProvider } = require('./base');
const { EdgeTTSProvider, DEFAULT_VOICES } = require('./edge-tts');
const { PiperProvider } = require('./piper');

const providers = {
  'edge-tts': EdgeTTSProvider,
  'piper': PiperProvider
};

/**
 * Create a TTS provider instance
 * @param {string} name - Provider name (edge-tts, piper)
 * @param {object} options - Provider options
 * @returns {TTSProvider}
 */
function createTTSProvider(name, options = {}) {
  const Provider = providers[name];
  if (!Provider) {
    throw new Error(`Unknown TTS provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return new Provider(options);
}

/**
 * List available TTS providers
 * @returns {string[]}
 */
function listTTSProviders() {
  return Object.keys(providers);
}

module.exports = {
  TTSProvider,
  EdgeTTSProvider,
  PiperProvider,
  DEFAULT_VOICES,
  createTTSProvider,
  listTTSProviders
};
