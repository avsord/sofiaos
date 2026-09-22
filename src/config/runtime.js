'use strict';
const path = require('node:path');
const { AppError } = require('../core/util');
function makeConfig(overrides = {}) {
  const root = overrides.root || path.resolve(__dirname, '../..');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError('BAD_PORT', 'PORT precisa ser um número entre 1 e 65535.');
  return {
    root, port, host: '127.0.0.1', dataDir: path.join(root, 'data'), backupDir: path.join(root, 'backups'),
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-terra',
    apiKey: process.env.OPENAI_API_KEY?.trim() || '',
    adminApiKey: process.env.OPENAI_ADMIN_KEY?.trim() || '',
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-transcribe',
    privateApiKey: process.env.OPENAI_PRIVATE_API_KEY?.trim() || '', sharedApiKey: process.env.OPENAI_SHARED_API_KEY?.trim() || '',
    apiTimeoutMs: 90000, turnTimeoutMs: 120000, maxMessageChars: 12000, maxContextChars: 20000,
    ...overrides
  };
}
module.exports = { makeConfig };
