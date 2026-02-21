/**
 * Provider Factory - Main Entry Point
 */

const {
  STTProvider,
  WhisperProvider,
  createSTTProvider,
  listSTTProviders
} = require('./stt');

const {
  TTSProvider,
  EdgeTTSProvider,
  PiperProvider,
  DEFAULT_VOICES,
  createTTSProvider,
  listTTSProviders
} = require('./tts');

module.exports = {
  // STT
  STTProvider,
  WhisperProvider,
  createSTTProvider,
  listSTTProviders,

  // TTS
  TTSProvider,
  EdgeTTSProvider,
  PiperProvider,
  DEFAULT_VOICES,
  createTTSProvider,
  listTTSProviders
};
