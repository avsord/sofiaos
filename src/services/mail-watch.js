'use strict';
// Vigia de e-mails: a Sofia lê só os CABEÇALHOS e um trecho curto das
// mensagens novas da Caixa de Entrada, confere as regras da pessoa
// (remetente, assunto, texto) e cria um aviso quando algo bate.
// Conexão por IMAP com "senha de app" — sem registrar aplicativo no Google.
// A senha fica criptografada (AES-256-GCM) num arquivo do servidor e nunca
// volta para o app nem entra no banco de registros.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const {AppError, atomicWrite, now} = require('../core/util');

const PROVIDERS = {
  gmail: {host: 'imap.gmail.com', port: 993, label: 'Gmail'},
  outlook: {host: 'outlook.office365.com', port: 993, label: 'Outlook / Hotmail'},
  yahoo: {host: 'imap.mail.yahoo.com', port: 993, label: 'Yahoo'},
  icloud: {host: 'imap.mail.me.com', port: 993, label: 'iCloud'},
  imap: {host: '', port: 993, label: 'Outro (IMAP)'},
};
const FIRST_LOOKBACK_DAYS = 2, MAX_PER_CHECK = 80, SNIPPET = 240;

function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function clean(t, max) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, max); }

/** Uma regra bate quando o texto procurado aparece no campo escolhido.
 * Vários termos separados por vírgula: basta um aparecer. */
function ruleMatches(rule, mail) {
  const d = rule.data || {}, terms = String(d.contains || '').split(',').map(norm).map(s => s.trim()).filter(Boolean);
  if (!terms.length) return false;
  if (d.account_id && d.account_id !== mail.accountId) return false;
  const from = norm(mail.fromName + ' ' + mail.fromAddr), subject = norm(mail.subject), body = norm(mail.text);
  const hay = d.field === 'from' ? from : d.field === 'subject' ? subject : d.field === 'body' ? body : from + ' ' + subject + ' ' + body;
  return terms.some(t => hay.includes(t));
}

function safeText(text, rejectSecrets) {
  try { rejectSecrets(text); return text; } catch { return '(trecho escondido: parece conter uma senha ou código)'; }
}

/** Texto simples de uma mensagem a partir do código-fonte, sem lib extra:
 * pega a primeira parte text/plain (ou tira as tags do HTML). */
function plainText(source) {
  const raw = String(source || '');
  const decodeQP = s => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
  let best = '';
  for (const part of parts) {
    const head = part.slice(0, part.search(/\r?\n\r?\n/) + 1), body = part.slice(head.length).replace(/^\r?\n/, '');
    const type = /content-type:\s*([^;\r\n]+)/i.exec(head)?.[1]?.toLowerCase() || '';
    const enc = /content-transfer-encoding:\s*([^\s;]+)/i.exec(head)?.[1]?.toLowerCase() || '';
    let txt = enc === 'base64' ? Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8') : enc === 'quoted-printable' ? Buffer.from(decodeQP(body), 'latin1').toString('utf8') : body;
    if (type.includes('text/plain')) { best = txt; break; }
    if (type.includes('text/html') && !best) best = txt.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }
  return clean(best || raw.slice(raw.search(/\r?\n\r?\n/)), 4000);
}

class MailWatcher {
  constructor(workspace, config, options = {}) {
    this.w = workspace; this.config = config; this.busy = false; this.timer = null;
    this.client = options.client || (opts => { const {ImapFlow} = require('imapflow'); return new ImapFlow(opts); });
    const dir = config.dataDir || path.join(config.root || '.', 'data');
    this.keyFile = path.join(dir, 'mail-key'); this.secretFile = path.join(dir, 'mail-secrets.json');
  }
  key() {
    if (process.env.SOFIA_MAIL_KEY && /^[0-9a-f]{64}$/i.test(process.env.SOFIA_MAIL_KEY)) return Buffer.from(process.env.SOFIA_MAIL_KEY, 'hex');
    if (!fs.existsSync(this.keyFile)) { fs.mkdirSync(path.dirname(this.keyFile), {recursive: true, mode: 0o700}); fs.writeFileSync(this.keyFile, crypto.randomBytes(32).toString('hex'), {mode: 0o600}); }
    return Buffer.from(fs.readFileSync(this.keyFile, 'utf8').trim(), 'hex');
  }
  secrets() { try { return JSON.parse(fs.readFileSync(this.secretFile, 'utf8')); } catch { return {}; } }
  setSecret(accountId, password) {
    const pass = String(password || '');
    if (!pass || pass.length > 300) throw new AppError('BAD_PASSWORD', 'Cole a senha de app (até 300 caracteres).');
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([c.update(pass, 'utf8'), c.final()]);
    const all = this.secrets(); all[accountId] = {iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64')};
    atomicWrite(this.secretFile, Buffer.from(JSON.stringify(all)));
  }
  secret(accountId) {
    const s = this.secrets()[accountId]; if (!s) return null;
    try { const d = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(s.iv, 'base64')); d.setAuthTag(Buffer.from(s.tag, 'base64')); return Buffer.concat([d.update(Buffer.from(s.data, 'base64')), d.final()]).toString('utf8'); }
    catch { return null; }
  }
  dropSecret(accountId) { const all = this.secrets(); delete all[accountId]; atomicWrite(this.secretFile, Buffer.from(JSON.stringify(all))); }

  server(account) {
    const d = account.data || {}, p = PROVIDERS[d.provider] || PROVIDERS.imap;
    const host = String(d.host || p.host || ''), port = Number(d.port) || p.port;
    if (!host) throw new AppError('MAIL_HOST', 'Informe o servidor IMAP.');
    return {host, port, secure: port === 993, auth: {user: String(d.address || ''), pass: ''}, logger: false, socketTimeout: 30000, greetingTimeout: 15000};
  }
  async connect(opts) {
    const client = this.client(opts);
    try { await client.connect(); return client; }
    catch (e) {
      const msg = String(e?.responseText || e?.message || e);
      if (/auth|login|credential|invalid|password/i.test(msg)) throw new AppError('MAIL_AUTH', 'O provedor recusou o login. Para Gmail use uma "senha de app" (com verificação em duas etapas ligada), não a senha normal.', 400);
      throw new AppError('MAIL_CONNECT', 'Não consegui conectar ao servidor de e-mail: ' + msg.slice(0, 120), 502);
    }
  }
  async test(accountId, password) {
    const account = this.w.get(accountId);
    if (account.kind !== 'mail_account') throw new AppError('BAD_KIND', 'Não é uma conta de e-mail.');
    const opts = this.server(account); opts.auth.pass = String(password || this.secret(accountId) || '');
    if (!opts.auth.pass) throw new AppError('MAIL_SECRET', 'Cole a senha de app desta conta.');
    const client = await this.connect(opts);
    try { const box = await client.mailboxOpen('INBOX', {readOnly: true}); return {ok: true, messages: box.exists || 0}; }
    finally { await client.logout().catch(() => {}); }
  }
  async saveSecretAndTest(accountId, password) {
    const r = await this.test(accountId, password);
    this.setSecret(accountId, password);
    const a = this.w.get(accountId);
    this.w.save({revision: a.revision, data: {...a.data, secret_set: true, last_error: ''}}, accountId);
    return r;
  }

  async checkAll(only) {
    if (this.busy) return {skipped: true};
    this.busy = true;
    const report = {accounts: 0, scanned: 0, hits: 0, errors: []};
    try {
      const accounts = this.w.list({kind: 'mail_account', limit: 50}).filter(a => a.state === 'active' && (!only || a.id === only));
      const rules = this.w.list({kind: 'mail_rule', limit: 200}).filter(r => r.state === 'active');
      for (const account of accounts) {
        report.accounts++;
        try { const r = await this.checkAccount(account, rules); report.scanned += r.scanned; report.hits += r.hits; }
        catch (e) {
          report.errors.push({account: account.id, error: String(e.message).slice(0, 160)});
          try { const a = this.w.get(account.id); this.w.save({revision: a.revision, data: {...a.data, last_error: String(e.message).slice(0, 300), last_check: now()}}, a.id); } catch { /* conta removida no meio */ }
        }
      }
    } finally { this.busy = false; }
    return report;
  }

  async checkAccount(account, rules) {
    const pass = this.secret(account.id);
    if (!pass) throw new AppError('MAIL_SECRET', 'Falta a senha de app desta conta.');
    const opts = this.server(account); opts.auth.pass = pass;
    const client = await this.connect(opts);
    let scanned = 0, hits = 0, maxUid = Number(account.data.last_uid) || 0;
    try {
      const box = await client.mailboxOpen('INBOX', {readOnly: true});
      const validity = String(box.uidValidity || '');
      const fresh = !maxUid || String(account.data.uid_validity || '') !== validity;
      const since = new Date(Date.now() - FIRST_LOOKBACK_DAYS * 864e5);
      const uids = (await client.search(fresh ? {since} : {uid: (maxUid + 1) + ':*'}, {uid: true})) || [];
      const pick = uids.filter(u => fresh || u > maxUid).sort((a, b) => a - b).slice(-MAX_PER_CHECK);
      if (pick.length) {
        for await (const msg of client.fetch(pick.join(','), {uid: true, envelope: true, internalDate: true, source: {start: 0, maxLength: 24000}}, {uid: true})) {
          scanned++; maxUid = Math.max(maxUid, msg.uid);
          const env = msg.envelope || {}, from = (env.from && env.from[0]) || {};
          const mail = {accountId: account.id, fromName: clean(from.name, 160), fromAddr: clean(from.address, 200), subject: clean(env.subject || '(sem assunto)', 300),
            text: plainText(msg.source ? msg.source.toString('utf8') : ''), date: (msg.internalDate || env.date || new Date()).toISOString?.() || now(), key: account.id + ':' + validity + ':' + msg.uid};
          const matched = rules.filter(r => ruleMatches(r, mail));
          if (matched.length) { hits++; this.record(account, mail, matched); }
        }
      }
      if (!pick.length && fresh && uids.length) maxUid = Math.max(maxUid, ...uids);
      if (fresh && !uids.length && box.uidNext) maxUid = Math.max(maxUid, Number(box.uidNext) - 1);
      const a = this.w.get(account.id);
      this.w.save({revision: a.revision, data: {...a.data, last_uid: maxUid, uid_validity: validity, last_check: now(), last_error: ''}}, account.id);
    } finally { await client.logout().catch(() => {}); }
    return {scanned, hits};
  }

  record(account, mail, rules) {
    const {rejectSecrets} = require('../core/util');
    if (this.w.list({kind: 'mail_hit', q: mail.key, limit: 5}).some(h => h.data.message_key === mail.key)) return;
    const snippet = safeText(clean(mail.text, SNIPPET), rejectSecrets), subject = safeText(mail.subject, rejectSecrets);
    const important = rules.some(r => r.data.important);
    const hit = this.w.save({kind: 'mail_hit', title: subject.slice(0, 240), area: 'Pessoal', privacy: 'private', state: 'new',
      data: {from_name: mail.fromName, from_addr: mail.fromAddr, snippet, received_at: mail.date, account_id: account.id, rule_id: rules[0].id, rule_names: rules.map(r => r.title).join(', ').slice(0, 300), message_key: mail.key, important}});
    if (rules.some(r => r.data.notify !== false)) {
      const who = mail.fromName || mail.fromAddr || 'Remetente desconhecido';
      this.w.notify('email', (important ? '⭐ ' : '') + who + ' — ' + subject.slice(0, 120), 'Regra: ' + rules.map(r => r.title).join(', ') + (snippet ? '. ' + snippet.slice(0, 140) : ''), hit.id, important ? 'opportunity' : 'info', 'mail:' + mail.key);
    }
  }

  start(intervalMs = 5 * 60000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkAll().catch(() => {}), intervalMs); this.timer.unref?.();
    setTimeout(() => this.checkAll().catch(() => {}), 20000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = {MailWatcher, PROVIDERS, ruleMatches, plainText};
