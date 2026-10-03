'use strict';
// Native client API. No Meta dependency, no WebView, no alternate AI brain.
const crypto = require('node:crypto');
const { AppError, validId, cleanText } = require('../core/util');
const { VERSION } = require('../config/sofia');
const { makeApi45 } = require('../core/api45');
const OWNER = 'owner-local';
const MAX_AUDIO = 10 * 1024 * 1024;
const fail = (code, message, status = 400) => { throw new AppError(code, message, status); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function checkMobileOrigin(req, config) {
  let host; try { host = new URL('http://' + req.headers.host).host; } catch { fail('HOST_INVALID', 'Host inválido.', 403); }
  const allowed = new URL(config.publicBaseUrl || 'https://sofiaos.up.railway.app');
  const loopback = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const railway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
  if (host !== allowed.host && !(loopback && !railway)) fail('HOST_INVALID', 'Endereço não autorizado.', 403);
  const origin = req.headers.origin;
  if (origin && origin !== allowed.origin && !(loopback && !railway && origin === 'http://' + host)) fail('ORIGIN_INVALID', 'Origem não autorizada.', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') fail('ORIGIN_INVALID', 'Origem não autorizada.', 403);
}
function makeMobileApi(runtime, deps) {
  const { store, config, core, routing, workspace, audioService } = runtime;
  const { bodyJson, json, ownerAuth, mobileSessions, tooManyFailures, registerFailure, clearFailures } = deps;
  const extra = makeApi45(runtime, { bodyJson, json });
  const chatSync = require('../services/chat-sync').makeChatSyncApi(store, { bodyJson, json, client: 'mobile' });
  const inAudio = new Set(), rateBuckets = new Map();
  store.db.exec(`CREATE TABLE IF NOT EXISTS mobile_voice_receipts (
    client_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, audio_hash TEXT NOT NULL,
    transcript TEXT NOT NULL, created_ms INTEGER NOT NULL
  ) STRICT;`);
  function rate(session, name, max = 20) {
    const now = Date.now();
    for (const [key, value] of rateBuckets) if (now - value.start > 60000) rateBuckets.delete(key);
    const key = session.token_hash + ':' + name, bucket = rateBuckets.get(key) || { start: now, count: 0 };
    if (++bucket.count > max) fail('RATE_LIMIT', 'Muitas solicitações. Aguarde um minuto.', 429);
    rateBuckets.set(key, bucket);
  }
  function profile() { const s = store.settings(); return { name: s.profileName || 'Proprietário', email: ownerAuth.registeredEmail(), role: 'owner' }; }
  function conversation(id) {
    const c = store.conversation(validId(id));
    if (!['mobile', 'web', 'test'].includes(c.channel) || c.state !== 'active') fail('NOT_FOUND', 'Conversa não disponível neste canal.', 404);
    return c;
  }
  function messages(id, before = Number.MAX_SAFE_INTEGER) {
    const rows = store.messages(id, 101, before), voices = store.voiceForMessages(rows);
    return { messages: rows.slice(-100).map(m => {
      const voice = voices.get(m.id);
      return { id: m.id, sequence: m.sequence, conversation_id: m.conversation_id, role: m.role, content: m.content,
        client_id: m.client_id, created_at: m.created_at, status: m.status, error_code: m.error_code || null,
        voice: voice ? { mime: voice.mime, duration_ms: voice.duration_ms, audio_url: '/api/mobile/messages/' + m.id + '/audio' } : null };
    }), has_more: rows.length > 100 };
  }
  function payload(b, text) {
    const c = conversation(b.conversation_id); validId(b.client_message_id);
    return { conversation_id: c.id, client_message_id: b.client_message_id, message: text, route: 'private', retry: b.retry === true,
      ...(b.clarification_id ? { clarification_id: validId(b.clarification_id) } : {}),
      ...(b.clarification_option ? { clarification_option: String(b.clarification_option).slice(0,80) } : {}) };
  }
  async function receive(input) { const result = await core.receive(input, { channel: 'mobile' }); return { ...result, ...messages(result.conversation_id) }; }
  function aiStatus() {
    const s=store.settings(),keyPresent=Boolean(config.privateApiKey||(s.legacyRoute==='private'&&config.apiKey));
    if(keyPresent&&(!s.routingEnabled||!s.privateConfirmed))store.updateSettings({routingEnabled:true,privateConfirmed:true});
    try { routing.profile('private'); return { ready: true, reason: null }; }
    catch (e) {
      const reasons = {
        ROUTE_KEY_MISSING: 'A chave do Filtro Privado não está presente no servidor. Abra a configuração da Sofia web e salve novamente a chave privada uma única vez; depois disso ela ficará sincronizada com o app e persistirá entre redeploys.',
        ROUTING_SETUP: 'O Filtro Privado existe, mas o roteamento ainda não foi ativado no servidor.',
        PROJECT_NOT_CONFIRMED: 'O Filtro Privado existe no servidor, mas a confirmação de projeto ainda não foi aplicada.',
        SAME_PROJECT_KEY: 'Os filtros Privado e Compartilhado estão usando a mesma chave. Eles precisam continuar separados.'
      };
      return { ready: false, reason: reasons[e.code] || 'O Filtro Privado da Sofia online ainda não está pronto para IA e áudio.', code: e.code };
    }
  }
  return async function mobile(req, res, p, m, url) {
    if (!p.startsWith('/api/mobile/')) return false;
    checkMobileOrigin(req, config); res.setHeader('Cache-Control', 'no-store');
    const send = value => { json(res, 200, value); return true; };
    if (p === '/api/mobile/auth/login' && m === 'POST') {
      if (!ownerAuth.passwordConfigured()) fail('LOGIN_NOT_CONFIGURED', 'Configure o acesso da Sofia no servidor.', 503);
      if (tooManyFailures(req)) fail('RATE_LIMIT', 'Muitas tentativas. Aguarde alguns minutos.', 429);
      const b = await bodyJson(req, 4096), email = String(b.email || ''), password = String(b.password || '');
      if (email.length > 160 || password.length > 200 || !ownerAuth.verifyLogin(email, password)) {
        registerFailure(req); fail('LOGIN_INVALID', 'E-mail ou senha incorretos.', 401);
      }
      clearFailures(req); return send({ ok: true, ...mobileSessions.issue(b.device_name), profile: profile() });
    }
    const session = mobileSessions.require(req);
    if(p.startsWith('/api/mobile/md/')){
      rate(session,'md-upgrade',120);
      if(await require('../core/md-api').makeMdApi(runtime,{bodyJson,json})(req,res,'/api/md/'+p.slice('/api/mobile/md/'.length),m,url))return true;
    }
    if (p.startsWith('/api/mobile/chat-sync')) {
      if (m !== 'GET') rate(session, 'chat-sync-write', 30);
      if (await chatSync(req, res, p, m, url)) return true;
    }
    if (p === '/api/mobile/auth/logout' && m === 'POST') { mobileSessions.revoke(session); return send({ ok: true }); }
    if (p === '/api/mobile/auth/logout-all' && m === 'POST') {
      await bodyJson(req, 1024); mobileSessions.revokeAll(); deps.revokeWebSessions?.(); return send({ ok: true });
    }
    if (p === '/api/mobile/auth/change-password' && m === 'POST') {
      rate(session, 'password', 5); const b = await bodyJson(req, 4096);
      const current = String(b.currentPassword || ''), next = String(b.newPassword || ''), confirmation = String(b.confirmPassword || '');
      if (current.length > 200 || !ownerAuth.verifyPassword(current)) fail('PASSWORD_INVALID', 'A senha atual está incorreta.', 403);
      if (next.length < 12 || next.length > 200) fail('PASSWORD_WEAK', 'Use de 12 a 200 caracteres.');
      if (next !== confirmation) fail('PASSWORD_MISMATCH', 'As duas senhas precisam ser iguais.');
      ownerAuth.setPassword(next); mobileSessions.revokeAll(); deps.revokeWebSessions?.(); return send({ ok: true });
    }
    // Reuse web workspace operations only AFTER bearer auth. Never bridge admin/credentials/restore endpoints.
    if (p.startsWith('/api/mobile/workspace/')) {
      const suffix = p.slice('/api/mobile/workspace/'.length);
      const allowed = /^(?:catalog|panorama|ui\/(?:home|pages)|entities(?:\/[\w-]+(?:\/(?:versions|observations|attachments|calendar|action))?)?|attachments\/[\w-]+|relations|timeline|integrations|vault\/(?:status|setup|confirm|unlock|recover|lock|entries|chat|discuss))$/;
      if (!allowed.test(suffix)) fail('NOT_FOUND', 'Esta operação não está disponível no app.', 404);
      if (m !== 'GET') rate(session, 'workspace-write', 60);
      if (suffix.startsWith('vault/')) {
        if (!['vault/status','vault/setup','vault/confirm','vault/unlock','vault/recover'].includes(suffix)) runtime.vault.require(req.headers['x-sofia-vault']);
      }
      const target = new URL(url.toString()); target.pathname = '/api/' + suffix;
      if (!await extra(req, res, target.pathname, m, target)) fail('NOT_FOUND', 'Operação não encontrada.', 404);
      return true;
    }
    if (p === '/api/mobile/bootstrap' && m === 'GET') return send({ ok: true, version: VERSION, profile: profile(),
      expires_at: new Date(session.expires_ms).toISOString(), ai: aiStatus(),
      limits: { audio_bytes: MAX_AUDIO, audio_seconds: 300, text_chars: config.maxMessageChars || 12000 },
      capabilities: { text: true, voice_notes: true, notifications_push: false, multi_user: false, e2ee: false, workspace: true, protected_diary: true } });
    if (p === '/api/mobile/conversations' && m === 'GET') {
      const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
      const rows = store.db.prepare(`SELECT * FROM conversations WHERE owner=? AND state='active'
        AND channel IN ('mobile','web','test') ORDER BY updated_at DESC,rowid DESC LIMIT 51 OFFSET ?`).all(OWNER, Math.trunc(offset));
      return send({ items: rows.slice(0, 50), has_more: rows.length > 50, next_offset: offset + 50 });
    }
    if (p === '/api/mobile/conversations' && m === 'POST') {
      rate(session, 'new', 10); const b = await bodyJson(req, 2048);
      return send({ conversation: store.createConversation(cleanText(b.title || 'Conversa com a Sofia', 'Título', 100), 'mobile') });
    }
    if (p === '/api/mobile/chat-history' && m === 'DELETE') { rate(session, 'delete', 10); return send(store.clearChatHistory()); }
    let match = p.match(/^\/api\/mobile\/conversations\/([\w-]+)$/);
    if (match && m === 'GET') {
      const c = conversation(match[1]), before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
      return send({ conversation: c, ...messages(c.id, before) });
    }
    if (p === '/api/mobile/messages' && m === 'POST') {
      rate(session, 'message'); const b = await bodyJson(req, 65536);
      return send(await receive(payload(b, cleanText(b.message, 'Mensagem', config.maxMessageChars || 12000))));
    }
    match = p.match(/^\/api\/mobile\/messages\/([\w-]+)$/);
    if (match && m === 'DELETE') { rate(session, 'delete', 30); const row=store.message(validId(match[1]));conversation(row.conversation_id);return send(store.deleteMessage(row.id)); }
    if (p === '/api/mobile/messages/audio' && m === 'POST') {
      rate(session, 'audio', 12); const b = await bodyJson(req, 14 * 1024 * 1024), input = payload(b, ''), key = input.client_message_id;
      const raw = String(b.audio_base64 || '');
      if (!raw || raw.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) fail('VOICE_INVALID', 'Áudio inválido. Grave novamente.');
      const bytes = Buffer.from(raw, 'base64');
      if (!bytes.length || bytes.length > MAX_AUDIO) fail('VOICE_SIZE', 'O áudio deve ter até 10 MB.', 413);
      const mime = String(b.mime || 'audio/mp4').toLowerCase();
      if (!/^audio\/(mp4|m4a|x-m4a|mpeg|wav|webm|ogg)$/.test(mime)) fail('VOICE_FORMAT', 'Formato de áudio não aceito.', 415);
      const duration = Number(b.duration_ms);
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 300000) fail('VOICE_DURATION', 'Grave um áudio de até cinco minutos.');
      if (inAudio.has(key) || core.busy) fail('IN_PROGRESS', 'A Sofia ainda está processando uma mensagem. Aguarde.', 409);
      const hash = digest(bytes); store.db.prepare('DELETE FROM mobile_voice_receipts WHERE created_ms < ?').run(Date.now() - 86400000);
      let receipt = store.db.prepare('SELECT * FROM mobile_voice_receipts WHERE client_id=?').get(key);
      if (receipt && (receipt.audio_hash !== hash || receipt.conversation_id !== input.conversation_id)) fail('ID_CONFLICT', 'Este identificador já pertence a outro áudio.', 409);
      const old = store.db.prepare('SELECT id,conversation_id,content FROM messages WHERE owner=? AND client_id=?').get(OWNER, key);
      const voice = old ? store.voiceMessage(old.id) : null;
      if (old && (old.conversation_id !== input.conversation_id || (!receipt && !voice) || (voice && digest(Buffer.from(voice.blob)) !== hash))) fail('ID_CONFLICT', 'Este identificador já pertence a outra mensagem.', 409);
      inAudio.add(key); let transcript = receipt?.transcript || (voice ? old.content : '');
      try {
        routing.profile('private');
        if (!transcript) {
          const t = await audioService.transcribe(bytes, { mime, filename: 'sofia-voice.' + (mime.includes('wav') ? 'wav' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.split('/')[1]), route: 'private' });
          transcript = cleanText(t.text, 'Transcrição', config.maxMessageChars || 12000);
          store.db.prepare('INSERT OR REPLACE INTO mobile_voice_receipts VALUES (?,?,?,?,?)').run(key, input.conversation_id, hash, transcript, Date.now());
        }
        let result;
        try { result = await core.receive({ ...input, message: transcript }, { channel: 'mobile' }); }
        finally {
          const row = store.db.prepare('SELECT id FROM messages WHERE owner=? AND client_id=?').get(OWNER, key);
          if (row) store.saveVoiceMessage(row.id, { mime, duration_ms: duration, transcript, bytes });
        }
        return send({ ...result, ...messages(result.conversation_id) });
      } finally { inAudio.delete(key); }
    }
    match = p.match(/^\/api\/mobile\/messages\/([\w-]+)\/audio$/);
    if (match && m === 'GET') {
      const row = store.message(validId(match[1])); conversation(row.conversation_id);
      const voice = store.voiceMessage(row.id); if (!voice) fail('NOT_FOUND', 'Áudio não encontrado.', 404);
      const bytes = Buffer.from(voice.blob), range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''));
      res.setHeader('Content-Type', voice.mime); res.setHeader('Accept-Ranges', 'bytes');
      if (range) {
        const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        if (start > end || start >= bytes.length) { res.statusCode = 416; res.setHeader('Content-Range', 'bytes */' + bytes.length); res.end(); return true; }
        res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
        res.setHeader('Content-Length', String(end - start + 1)); res.end(bytes.subarray(start, end + 1));
      } else { res.setHeader('Content-Length', String(bytes.length)); res.end(bytes); }
      return true;
    }
    if (p === '/api/mobile/home' && m === 'GET') return send({ ...workspace.panorama(), profile: profile() });
    if (p === '/api/mobile/tasks' && m === 'GET') return send({ items: store.tasks() });
    if (p === '/api/mobile/tasks' && m === 'POST') {
      rate(session, 'write', 40); const b = await bodyJson(req, 16384);
      return send({ item: store.saveTask({ ...b, title: cleanText(b.title, 'Título', 300), privacy: 'private' }) });
    }
    match = p.match(/^\/api\/mobile\/tasks\/([\w-]+)$/);
    if (match && m === 'PATCH') {
      rate(session, 'write', 40); const b = await bodyJson(req, 16384), old = store.task(validId(match[1]));
      return send({ item: store.saveTask({ ...old, ...b, revision: b.revision }, old.id) });
    }
    if (match && m === 'DELETE') { rate(session, 'write', 40); return send(store.deleteTask(validId(match[1]))); }
    if (p === '/api/mobile/agenda' && m === 'GET') return send({ items: [...workspace.list({ kind: 'commitment', limit: 500 }), ...workspace.list({ kind: 'reminder', limit: 500 })], provider: 'sofia' });
    if (p === '/api/mobile/agenda' && m === 'POST') {
      rate(session, 'write', 40); const b = await bodyJson(req, 8192);
      if (!b.start_at || !Number.isFinite(Date.parse(b.start_at))) fail('INVALID_DATE', 'Data e hora inválidas.');
      return send({ item: workspace.save({ kind: 'commitment', title: cleanText(b.title, 'Título', 200), area: 'Pessoal', privacy: 'private', data: { start_at: new Date(b.start_at).toISOString(), end_at: '', location: '' } }) });
    }
    if (p === '/api/mobile/notifications' && m === 'GET') return send({ items: workspace.notifications(), push_enabled: false });
    match = p.match(/^\/api\/mobile\/notifications\/([\w-]+)\/read$/);
    if (match && m === 'POST') { workspace.markRead(validId(match[1])); return send({ ok: true }); }
    if (p === '/api/mobile/profile' && m === 'PATCH') {
      rate(session, 'write', 40); const b = await bodyJson(req, 2048);
      store.updateSettings({ profileName: cleanText(b.name, 'Nome', 80) }); return send({ profile: profile() });
    }
    fail('NOT_FOUND', 'Esta rota do aplicativo não existe.', 404);
  };
}
module.exports = { makeMobileApi, checkMobileOrigin };
