'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'AppError'; this.code = code; this.status = status; }
}
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function cleanText(value, field = 'Texto', max = 12000, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new AppError('INVALID_INPUT', `${field}: informe um texto de até ${max} caracteres.`);
  }
  return value.trim();
}
function validId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new AppError('INVALID_ID', 'Identificador inválido.');
  return value;
}
function rejectSecrets(text) {
  if (/\bsk-[A-Za-z0-9_-]{16,}|\bEA[A-Za-z0-9]{60,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:OPENAI_(?:PRIVATE_|SHARED_)?API_KEY|WHATSAPP_ACCESS_TOKEN|APP_SECRET)\s*[=:]\s*\S{8,}|(?:senha|password|pin|codigo (?:2fa|totp|de autenticacao))\s*(?:e|é|:|=)\s*\S{3,}|(?:numero (?:do )?cartao)\s*[:=]?\s*[0-9 -]{13,}/i.test(text)) {
    throw new AppError('POSSIBLE_SECRET', 'Este texto parece conter uma credencial. Ela não foi salva nem enviada à IA. Remova o segredo da mensagem.');
  }
}
function atomicWrite(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.' + id() + '.tmp';
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, filename);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STOP = new Set('a o os as um uma uns umas e de do da dos das em no na nos nas para por com sem que qual quais como quando onde quem eu voce voces sofia meu minha meus minhas foi era tem teve isso isto esse essa esses essas la aqui me se ao aos queria quero saber diga lembro lembra lembramos falei falamos nossa nosso favor sobre'.split(' '));
function searchTerms(query) { return [...new Set(normalize(query).match(/[\p{L}\p{N}_]{2,}/gu) || [])].filter(t => !STOP.has(t)).slice(0, 12); }
function publicError(error) {
  if (error instanceof AppError) return { status: error.status, code: error.code, error: error.message };
  return { status: 500, code: 'INTERNAL_ERROR', error: 'Não consegui concluir esta operação. O servidor preservou o que já estava salvo; consulte o diagnóstico local.' };
}
module.exports = { AppError, now, id, hash, cleanText, validId, rejectSecrets, atomicWrite, normalize, searchTerms, publicError };
