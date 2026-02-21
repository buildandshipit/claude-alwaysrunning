/**
 * STT Provider Factory
 */

const { STTProvider } = require('./base');
const { WhisperProvider } = require('./whisper');

const providers = {
  whisper: WhisperProvider
};

/**
 * Create an STT provider instance
 * @param {string} name - Provider name (whisper)
 * @param {object} options - Provider options
 * @returns {STTProvider}
 */
function createSTTProvider(name, options = {}) {
  const Provider = providers[name];
  if (!Provider) {
    throw new Error(`Unknown STT provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return new Provider(options);
}

/**
 * List available STT providers
 * @returns {string[]}
 */
function listSTTProviders() {
  return Object.keys(providers);
}

module.exports = {
  STTProvider,
  WhisperProvider,
  createSTTProvider,
  listSTTProviders
};
