'use strict';
// Conta Google da Sofia: UMA conexão OAuth dá acesso à Agenda e ao Drive.
// Agenda: importação completa e incremental (events.list paginado, syncToken,
// HTTP 410), todos os calendários visíveis (o escolhido nos dois sentidos, os
// outros somente leitura), dia inteiro, fuso, recorrências expandidas,
// cancelados, recusados, conflitos sem sobrescrever nada.
// Drive (escopo drive.file: a Sofia só enxerga o que ela mesma criou): backup
// criptografado diário na pasta "Sofia OS/Backups", guardando os 14 últimos.
// Tokens ficam criptografados (AES-256-GCM) com SOFIA_CALENDAR_TOKEN_KEY.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const {AppError, now, id} = require('../core/util');
const {CATALOG} = require('../core/catalog');
// Antes de regravar a entidade depois de enviar ao Google, descarta qualquer chave que não é
// um campo de verdade daquele tipo (pode ter sobrado de uma versão antiga do app ou de um bug
// já corrigido). Sem isso, UM registro com uma chave estranha travava o envio dele para sempre:
// toda sincronização tentava de novo, falhava do mesmo jeito, e nunca marcava como enviado.
function cleanData(kind, data) {
  const allowed = new Set((CATALOG[kind]?.fields || []).map(f => f.key));
  const out = {};
  for (const k of Object.keys(data || {})) if (allowed.has(k)) out[k] = data[k];
  return out;
}

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/gmail.readonly'];
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', TOKEN = 'https://oauth2.googleapis.com/token', REVOKE = 'https://oauth2.googleapis.com/revoke';
const CAL = 'https://www.googleapis.com/calendar/v3', DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TZ = 'America/Sao_Paulo', MAX_PAGES = 20, KEEP_BACKUPS = 14, CALLBACK = '/google/oauth/callback';
// Janela fixa e leitura em lotes: a primeira versão pedia TODOS os eventos
// (recorrências expandidas sem fim) e gravava milhares de uma vez, travando o
// servidor inteiro enquanto isso. Agora: 60 dias para trás, 1 ano para frente,
// no máximo 3000 eventos por rodada, e uma pausa a cada 20 para o servidor
// continuar respondendo o app.
const PAST_DAYS = 60, FUTURE_DAYS = 365, MAX_EVENTS_PER_RUN = 3000, YIELD_EVERY = 20, FULL_EVERY_MS = 24 * 3600000;
const breathe = () => new Promise(r => setImmediate(r));

const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
const plusDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

class GoogleService {
  constructor(store, workspace, config, options = {}) {
    this.s = store; this.db = store.db; this.w = workspace; this.config = config;
    this.fetch = options.fetchImpl || global.fetch; this.backups = options.backups || null;
    this.env = options.env || process.env; this.busy = false; this.access = null; this.timer = null;
    this.db.exec(`CREATE TABLE IF NOT EXISTS google_link(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS google_oauth_state(state TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS google_tombstones(calendar_id TEXT NOT NULL, event_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(calendar_id, event_id));
      CREATE TABLE IF NOT EXISTS md_kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    // Anexos (capas, fotos, arquivos) podem morar no Drive da pessoa: aqui fica só a referência.
    try { if (!this.db.prepare('PRAGMA table_info(attachments)').all().some(c => c.name === 'drive_id')) this.db.exec('ALTER TABLE attachments ADD COLUMN drive_id TEXT'); } catch { /* sem tabela de anexos */ }
    // Mensagens de voz (as maiores: até dezenas de MB cada) também podem morar no Drive.
    // sha256 guarda a impressão do áudio original para o reenvio idempotente continuar seguro sem o blob aqui.
    try { const cols = this.db.prepare('PRAGMA table_info(voice_messages)').all().map(c => c.name); if (!cols.includes('drive_id')) this.db.exec('ALTER TABLE voice_messages ADD COLUMN drive_id TEXT'); if (!cols.includes('sha256')) this.db.exec('ALTER TABLE voice_messages ADD COLUMN sha256 TEXT'); } catch { /* sem tabela de voz */ }
    this.blobCache = new Map(); this.blobCacheBytes = 0; this.offloading = false;
    // Apagar na Sofia um evento ligado ao Google também apaga lá na próxima sincronização.
    const original = workspace.deleteEntity.bind(workspace);
    workspace.deleteEntity = (entityId) => {
      let e = null; try { e = workspace.get(entityId); } catch { /* deixa o original reclamar */ }
      let driveIds = []; try { driveIds = this.db.prepare('SELECT drive_id FROM attachments WHERE entity_id=? AND drive_id IS NOT NULL').all(entityId).map(r => r.drive_id); } catch { /* sem coluna */ }
      const result = original(entityId);
      for (const did of driveIds) this.call('DELETE', DRIVE + '/files/' + did).catch(() => {});
      if (e && e.kind === 'commitment' && e.data.calendar_provider === 'google' && e.data.external_event_id && !e.data.google_readonly)
        this.db.prepare('INSERT OR IGNORE INTO google_tombstones VALUES(?,?,?)').run(e.data.calendar_id || 'primary', e.data.external_event_id, now());
      return result;
    };
  }
  // ---------- armazenamento ----------
  kvGet(key) { const r = this.db.prepare('SELECT value FROM md_kv WHERE key=?').get(key); return r ? JSON.parse(r.value) : null; }
  kvSet(key, value) { this.db.prepare('INSERT INTO md_kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  link() { const r = this.db.prepare("SELECT data FROM google_link WHERE id='owner'").get(); return r ? JSON.parse(r.data) : null; }
  saveLink(d) { this.db.prepare("INSERT INTO google_link VALUES('owner',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify(d)); }
  key() { return crypto.createHash('sha256').update(String(this.env.SOFIA_CALENDAR_TOKEN_KEY || '')).digest(); }
  seal(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', this.key(), iv); const d = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); }
  open(sealed) { const [iv, tag, d] = String(sealed).split('.').map(s => Buffer.from(s, 'base64')); const x = crypto.createDecipheriv('aes-256-gcm', this.key(), iv); x.setAuthTag(tag); return Buffer.concat([x.update(d), x.final()]).toString('utf8'); }
  configured() { return !!(this.env.GOOGLE_CALENDAR_CLIENT_ID && this.env.GOOGLE_CALENDAR_CLIENT_SECRET && this.env.SOFIA_CALENDAR_TOKEN_KEY); }
  redirectUri() { return String(this.config.publicBaseUrl || '').replace(/\/$/, '') + CALLBACK; }

  // ---------- OAuth ----------
  connectUrl(options = {}) {
    if (!this.configured()) throw new AppError('GOOGLE_NOT_CONFIGURED', 'A conexão Google ainda não foi configurada no servidor.', 503);
    // 'a.' no começo marca que o pedido veio do app: no fim, volta direto para ele.
    const state = (options.app ? 'a.' : '') + crypto.randomBytes(24).toString('base64url');
    this.db.prepare('DELETE FROM google_oauth_state WHERE created_at<?').run(new Date(Date.now() - 15 * 60000).toISOString());
    this.db.prepare('INSERT INTO google_oauth_state VALUES(?,?)').run(state, now());
    const q = new URLSearchParams({client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID, redirect_uri: this.redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state});
    return {url: AUTH + '?' + q.toString()};
  }
  async callback(params) {
    const state = String(params.get('state') || ''), code = String(params.get('code') || '');
    if (params.get('error')) return {ok: false, message: 'A autorização foi cancelada no Google. Nada foi conectado.'};
    const row = state && this.db.prepare('SELECT * FROM google_oauth_state WHERE state=?').get(state);
    if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60000) return {ok: false, message: 'Este link de autorização expirou. Volte ao app e toque em Conectar de novo.'};
    this.db.prepare('DELETE FROM google_oauth_state WHERE state=?').run(state);
    const tokens = await this.tokenRequest({code, grant_type: 'authorization_code', redirect_uri: this.redirectUri()});
    if (!tokens.refresh_token) return {ok: false, message: 'O Google não devolveu a permissão permanente. Remova a Sofia em myaccount.google.com/permissions e conecte de novo.'};
    let email = '';
    try { email = JSON.parse(Buffer.from(String(tokens.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || ''; } catch { /* sem e-mail */ }
    const old = this.link() || {};
    this.saveLink({...old, refresh: this.seal(tokens.refresh_token), email, scopes: String(tokens.scope || ''), connected_at: now(), calendar_id: old.calendar_id || 'primary', sync: {}, last_error: '', conflicts: []});
    this.access = {token: tokens.access_token, exp: Date.now() + (Number(tokens.expires_in) || 3000) * 1000 - 60000};
    setTimeout(() => { this.ensureFolders().catch(() => {}).then(() => { this.sync().catch(() => {}); this.backupToDrive().catch(() => {}); this.offloadAttachments().catch(() => {}); this.offloadVoices().catch(() => {}); this.exportPages().catch(() => {}); }); }, 50).unref?.();
    return {ok: true, message: 'Conta Google conectada' + (email ? ' (' + email + ')' : '') + '. Pode voltar para a Sofia.'};
  }
  /** Do app (janela do Google aberta pela própria Sofia): devolve um redirecionamento
   * para sofiaapp://google, que fecha a janela e volta ao app sozinho. */
  async callbackResponse(params) {
    const fromApp = String(params.get('state') || '').startsWith('a.');
    let r; try { r = await this.callback(params); } catch (e) { r = {ok: false, message: 'Não consegui concluir: ' + String(e.message || e).slice(0, 160)}; }
    if (fromApp) return {redirect: 'sofiaapp://google?ok=' + (r.ok ? '1' : '0') + '&message=' + encodeURIComponent(r.message)};
    return {html: this.page(r)};
  }
  async callbackPage(params) {
    let r; try { r = await this.callback(params); } catch (e) { r = {ok: false, message: 'Não consegui concluir: ' + String(e.message || e).slice(0, 160)}; }
    return this.page(r);
  }
  page(r) {
    const color = r.ok ? '#2fc58b' : '#ff6b7a';
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sofia OS · Google</title><body style="font-family:system-ui;background:#17151e;color:#f5f0ff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="max-width:420px;padding:28px;text-align:center"><div style="font-size:48px">${r.ok ? '✅' : '⚠️'}</div><h2 style="color:${color}">${r.ok ? 'Pronto!' : 'Não deu certo'}</h2><p style="line-height:1.5">${r.message.replace(/[<>&]/g, '')}</p><p style="opacity:.7;font-size:13px">Pode fechar esta aba.</p></div></body></html>`;
  }
  async tokenRequest(extra) {
    const body = new URLSearchParams({client_id: this.env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: this.env.GOOGLE_CALENDAR_CLIENT_SECRET, ...extra});
    const res = await this.fetch(TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'invalid_grant') { const l = this.link(); if (l) this.saveLink({...l, refresh: '', last_error: 'O Google revogou o acesso. Conecte de novo.'}); }
      throw new AppError('GOOGLE_TOKEN', 'O Google recusou a autorização (' + (data.error || res.status) + ').', 502);
    }
    return data;
  }
  async token() {
    if (this.access && this.access.exp > Date.now()) return this.access.token;
    const l = this.link(); if (!l || !l.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conta Google não conectada.', 409);
    const t = await this.tokenRequest({grant_type: 'refresh_token', refresh_token: this.open(l.refresh)});
    this.access = {token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3000) * 1000 - 60000};
    return this.access.token;
  }
  async call(method, url, body, headers = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetch(url, {method, headers: {Authorization: 'Bearer ' + await this.token(), ...(body && !(body instanceof Buffer) && typeof body !== 'string' ? {'Content-Type': 'application/json'} : {}), ...headers}, body: body ? (body instanceof Buffer || typeof body === 'string' ? body : JSON.stringify(body)) : undefined});
      if (res.status === 401 && attempt === 0) { this.access = null; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise(r => setTimeout(r, 400 * 2 ** attempt)); continue; }
      if (res.status === 204) return {};
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new AppError('GOOGLE_API', 'Google: ' + (data.error?.message || res.status), res.status === 410 ? 410 : 502); e.googleStatus = res.status; throw e; }
      return data;
    }
  }
  async disconnect() {
    const l = this.link();
    if (l?.refresh) { try { await this.fetch(REVOKE + '?token=' + encodeURIComponent(this.open(l.refresh)), {method: 'POST'}); } catch { /* revogar é cortesia */ } }
    this.db.prepare("DELETE FROM google_link WHERE id='owner'").run(); this.access = null;
    return {ok: true};
  }

  // ---------- Agenda ----------
  async calendars() {
    const out = []; let pageToken = '';
    for (let i = 0; i < 10; i++) {
      const r = await this.call('GET', CAL + '/users/me/calendarList?maxResults=250&showHidden=false' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
      out.push(...(r.items || []).map(c => ({id: c.id, summary: c.summaryOverride || c.summary || c.id, accessRole: c.accessRole, selected: c.selected !== false, primary: !!c.primary})));
      if (!r.nextPageToken) break; pageToken = r.nextPageToken;
    }
    return out;
  }
  async status() {
    const l = this.link(), base = {configured: this.configured(), connected: !!(l && l.refresh)};
    if (!base.connected) return {...base, error: l?.last_error || undefined, redirect_uri: this.configured() ? this.redirectUri() : undefined};
    let calendars = l.calendars || [];
    try { calendars = await this.calendars(); this.saveLink({...this.link(), calendars}); } catch { /* usa a última lista conhecida */ }
    const cal = calendars.find(c => c.id === l.calendar_id) || calendars.find(c => c.primary);
    const last = (l.history || [])[0];
    const warnings = [];
    if (last) warnings.push(`Última sincronização: ${last.imported} recebidos do Google, ${last.created} novos, ${last.updated} atualizados, ${last.sent} enviados, ${last.removed} removidos${last.skipped ? ', ' + last.skipped + ' ignorados' : ''}.`);
    if (calendars.some(c => c.id !== (cal?.id) && c.selected)) warnings.push('Os outros calendários visíveis no seu Google também aparecem na Sofia, somente para leitura.');
    return {...base, syncing: this.busy, email: l.email, last_sync: l.last_sync, error: l.last_error || undefined, calendar_id: cal?.id || 'primary', calendar_name: cal?.summary || 'Principal',
      calendars, warnings, conflicts: l.conflicts || [], history: (l.history || []).slice(0, 10),
      gmail: {connected: /gmail\.readonly/.test(l.scopes || '')},
      drive: {connected: /drive\.file/.test(l.scopes || ''), last_backup: l.drive?.last_backup, last_backup_error: l.drive?.last_error, backups: l.drive?.count || 0, folder: 'Sofia OS/Backups', folders: l.drive?.folders ? Object.keys(l.drive.folders) : [], attachments: this.attachmentStats(), voices: this.voiceStats(), pages: l.drive?.pages_exported || 0}};
  }
  select(calendarId) {
    const l = this.link(); if (!l?.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conta Google não conectada.', 409);
    const cal = (l.calendars || []).find(c => c.id === calendarId);
    if (cal && !['owner', 'writer'].includes(cal.accessRole)) throw new AppError('GOOGLE_READONLY', 'Esse calendário é somente leitura no Google.');
    this.saveLink({...l, calendar_id: String(calendarId || 'primary'), sync: {}});
    setTimeout(() => this.sync().catch(() => {}), 50).unref?.();
    return {ok: true};
  }
  googleEntities() {
    const map = new Map();
    for (let offset = 0; ; offset += 500) {
      const page = this.w.list({kind: 'commitment', limit: 500, offset});
      for (const e of page) if (e.data.calendar_provider === 'google' && e.data.external_event_id) map.set((e.data.calendar_id || 'primary') + '|' + e.data.external_event_id, e);
      if (page.length < 500) break;
    }
    return map;
  }
  toData(ev, calId, readonly) {
    const allDay = !!ev.start?.date;
    let start = allDay ? new Date(ev.start.date + 'T03:00:00Z').toISOString() : iso(ev.start?.dateTime);
    let end = allDay ? new Date((ev.end?.date || plusDays(ev.start.date, 1)) + 'T03:00:00Z').toISOString() : iso(ev.end?.dateTime);
    if (end && start && end <= start) end = '';
    const popup = (ev.reminders?.overrides || []).find(r => r.method === 'popup');
    return {start_at: start, end_at: end, location: String(ev.location || '').slice(0, 900), remind_minutes: popup ? popup.minutes : '', calendar_provider: 'google', calendar_id: calId,
      external_event_id: ev.id, sync_state: readonly ? 'readonly' : 'synced', calendar_all_day: allDay, calendar_date_start: allDay ? ev.start.date : '', calendar_date_end: allDay ? (ev.end?.date || plusDays(ev.start.date, 1)) : '',
      // Aniversário e outros tipos especiais do Google (local de trabalho, foco, fora do
      // escritório, criado a partir de e-mail) têm edição restrita na própria API do Google,
      // mesmo vindos do calendário principal — nunca tenta reenviar mudança para eles.
      google_etag: String(ev.etag || ''), google_recurring_id: String(ev.recurringEventId || ''), google_readonly: !!readonly || (!!ev.eventType && ev.eventType !== 'default')};
  }
  saveFromGoogle(ev, calId, readonly, existing, report) {
    const declined = (ev.attendees || []).some(a => a.self && a.responseStatus === 'declined');
    const cancelled = ev.status === 'cancelled' || declined;
    if (cancelled) {
      if (existing && existing.state !== 'cancelled') { report.removed++; try { return this.w.save({revision: existing.revision, state: 'cancelled', data: {...cleanData('commitment', existing.data), google_rev: existing.revision + 1}}, existing.id); } catch (e) { report.errors.push(String(e.message).slice(0, 120)); return existing; } }
      return existing;
    }
    if (!ev.start || (!ev.start.date && !ev.start.dateTime)) { report.skipped++; return null; }
    const data = this.toData(ev, calId, readonly);
    let title = String(ev.summary || '(sem título)').slice(0, 240), content = String(ev.description || '').replace(/<[^>]+>/g, ' ').slice(0, 15000);
    const state = ev.status === 'tentative' ? 'pending' : 'confirmed';
    const attempt = (t, c) => existing
      ? this.w.save({revision: existing.revision, title: t, content: c, state: existing.state === 'done' ? 'done' : state, data: {...cleanData('commitment', existing.data), ...data, google_rev: existing.revision + 1}}, existing.id)
      : this.w.save({kind: 'commitment', title: t, content: c, area: 'Pessoal', privacy: 'private', state, data: {...data, google_rev: 1}});
    let saved;
    try { saved = attempt(title, content); }
    catch (e) {
      if (e.code === 'POSSIBLE_SECRET') { try { saved = attempt('(evento com dado sensível)', ''); } catch { report.skipped++; return null; } }
      else { report.skipped++; report.errors.push(String(e.message).slice(0, 120)); return null; }
    }
    if (existing) report.updated++; else report.created++;
    return saved;
  }
  async importCalendar(cal, readonly, map, report, link) {
    const state = (link.sync || {})[cal.id] || {};
    const full = !state.at || !state.full_at || Date.now() - Date.parse(state.full_at) > FULL_EVERY_MS;
    const started = new Date().toISOString();
    let pageToken = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({maxResults: '250', singleEvents: 'true', showDeleted: 'true',
        timeMin: new Date(Date.now() - PAST_DAYS * 864e5).toISOString(), timeMax: new Date(Date.now() + FUTURE_DAYS * 864e5).toISOString()});
      if (!full) q.set('updatedMin', new Date(Date.parse(state.at) - 120000).toISOString());
      if (pageToken) q.set('pageToken', pageToken);
      const r = await this.call('GET', CAL + '/calendars/' + encodeURIComponent(cal.id) + '/events?' + q.toString());
      for (const ev of r.items || []) {
        report.imported++;
        if (report.imported % YIELD_EVERY === 0) await breathe();
        const key = cal.id + '|' + ev.id, existing = map.get(key);
        // Nada mudou no Google e nada mudou na Sofia: não regrava.
        if (existing && ev.etag && ev.etag === existing.data.google_etag && existing.revision <= (Number(existing.data.google_rev) || 0)) continue;
        if (existing && !readonly) {
          const localChanged = existing.revision > (Number(existing.data.google_rev) || 0);
          if (localChanged && ev.etag && ev.etag !== existing.data.google_etag) { report.conflicts.push({id: existing.id, reason: 'Alterado no Google e na Sofia: "' + existing.title.slice(0, 60) + '"'}); continue; }
          if (localChanged) continue;
        }
        if (!existing && (ev.status === 'cancelled')) continue; // cancelado que a Sofia nunca teve: nada a fazer
        const saved = this.saveFromGoogle(ev, cal.id, readonly, existing, report);
        if (saved) map.set(key, saved);
        if (report.imported >= MAX_EVENTS_PER_RUN) { report.partial = true; break; }
      }
      if (report.partial || !r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
    report.full = report.full || full;
    const next = {...(link.sync || {})};
    if (!report.partial) next[cal.id] = {at: started, full_at: full ? started : state.full_at};
    return next;
  }
  eventBody(e) {
    const d = e.data, allDay = !!d.calendar_all_day && d.calendar_date_start;
    const start = allDay ? {date: d.calendar_date_start} : {dateTime: d.start_at, timeZone: TZ};
    const end = allDay ? {date: d.calendar_date_end || plusDays(d.calendar_date_start, 1)} : {dateTime: d.end_at || new Date(Date.parse(d.start_at) + 3600000).toISOString(), timeZone: TZ};
    return {summary: e.title, description: e.content || undefined, location: d.location || undefined, start, end,
      reminders: d.remind_minutes !== '' && d.remind_minutes != null ? {useDefault: false, overrides: [{method: 'popup', minutes: Number(d.remind_minutes)}]} : {useDefault: true}};
  }
  async pushLocal(calId, report) {
    for (const t of this.db.prepare('SELECT * FROM google_tombstones').all()) {
      try { await this.call('DELETE', CAL + '/calendars/' + encodeURIComponent(t.calendar_id) + '/events/' + encodeURIComponent(t.event_id)); report.removed++; }
      catch (e) { if (![404, 410].includes(e.googleStatus)) { report.errors.push('Remover no Google: ' + String(e.message).slice(0, 80)); continue; } }
      this.db.prepare('DELETE FROM google_tombstones WHERE calendar_id=? AND event_id=?').run(t.calendar_id, t.event_id);
    }
    for (let offset = 0; ; offset += 500) {
      const page = this.w.list({kind: 'commitment', limit: 500, offset});
      for (const e of page) {
        const d = e.data;
        if (d.calendar_provider !== 'google' || d.google_readonly || (!d.start_at && !d.calendar_date_start) || e.state === 'cancelled') continue;
        const target = d.calendar_id || calId, isNew = !d.external_event_id;
        if (!isNew && e.revision <= (Number(d.google_rev) || 0)) continue;
        await breathe();
        try {
          const ev = isNew ? await this.call('POST', CAL + '/calendars/' + encodeURIComponent(target) + '/events', this.eventBody(e))
            : await this.call('PATCH', CAL + '/calendars/' + encodeURIComponent(target) + '/events/' + encodeURIComponent(d.external_event_id), this.eventBody(e));
          this.w.save({revision: e.revision, data: {...cleanData(e.kind, d), calendar_id: target, external_event_id: ev.id, google_etag: ev.etag || '', sync_state: 'synced', google_rev: e.revision + 1}}, e.id);
          report.sent++;
        } catch (err) {
          // Aniversário e outros tipos especiais: o Google recusa a edição pela API mesmo
          // vindos do calendário principal. Em vez de tentar de novo para sempre, marca como
          // só-leitura agora mesmo — resolve sozinho, sem esperar a próxima sincronização completa.
          if (/not valid for t|cannot be (updated|modified)|read-?only/i.test(String(err.message))) { try { this.w.save({revision: e.revision, data: {...cleanData(e.kind, d), google_readonly: true, google_rev: e.revision + 1}}, e.id); } catch { /* tenta de novo na próxima */ } }
          else report.errors.push('Enviar "' + e.title.slice(0, 40) + '": ' + String(err.message).slice(0, 80));
        }
      }
      if (page.length < 500) break;
    }
  }
  async sync() {
    if (this.busy) return {ok: true, skipped: true};
    const l = this.link(); if (!l?.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Conta Google não conectada.', 409);
    this.busy = true;
    const report = {at: now(), imported: 0, created: 0, updated: 0, sent: 0, removed: 0, skipped: 0, conflicts: [], errors: [], full: false, calendars: 0, ms: 0};
    const t0 = Date.now();
    try {
      const calendars = await this.calendars();
      const main = calendars.find(c => c.id === l.calendar_id) || calendars.find(c => c.primary) || {id: 'primary', accessRole: 'owner'};
      const map = this.googleEntities();
      let link = {...this.link(), calendars};
      for (const cal of calendars.filter(c => c.id === main.id || c.selected)) {
        report.calendars++;
        link.sync = await this.importCalendar(cal, cal.id !== main.id || !['owner', 'writer'].includes(cal.accessRole), map, report, link);
      }
      await this.pushLocal(main.id, report);
      report.ms = Date.now() - t0;
      link = {...this.link(), sync: link.sync, calendars, last_sync: now(), last_error: report.errors.length ? report.errors[0] : '', conflicts: report.conflicts.slice(0, 50),
        history: [{...report, conflicts: report.conflicts.length, errors: report.errors.slice(0, 5)}, ...((this.link() || {}).history || [])].slice(0, 20)};
      this.saveLink(link);
      return {ok: true, ...report, conflicts: report.conflicts.length};
    } catch (e) {
      const cur = this.link(); if (cur) this.saveLink({...cur, last_error: String(e.message).slice(0, 200)});
      throw e;
    } finally { this.busy = false; }
  }

  // ---------- Drive ----------
  async folder(name, parent) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
    const found = await this.call('GET', DRIVE + '/files?fields=files(id,name)&q=' + encodeURIComponent(q));
    if (found.files?.length) return found.files[0].id;
    return (await this.call('POST', DRIVE + '/files?fields=id', {name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? {parents: [parent]} : {})})).id;
  }
  // ---------- Estrutura de pastas no Drive ----------
  // Assim que a pessoa conecta, a Sofia cria a casa dela no Drive, organizada:
  //   Sofia OS/Backups   (cópias criptografadas do banco, uma por dia)
  //   Sofia OS/Anexos    (capas de página, fotos e arquivos; aqui no servidor fica só a referência)
  //   Sofia OS/Áudios    (mensagens de voz da conversa com mais de 1 dia)
  //   Sofia OS/Páginas   (cada página sua como um arquivo .md legível, atualizado quando muda)
  // Os ids ficam guardados no link; nunca se cria pasta repetida (folder() reaproveita).
  static FOLDERS = ['Backups', 'Anexos', 'Áudios', 'Páginas'];
  // offloadAttachments/offloadVoices/exportPages rodam juntos, sem esperar um pelo outro: se
  // cada um corresse ensureFolders() por conta própria, cada um buscaria "ainda não existe" ao
  // mesmo tempo e cada um criaria a própria pasta "Sofia OS" — foi assim que apareceram pastas
  // repetidas. Uma chamada em andamento é compartilhada por todo mundo que pedir enquanto isso.
  ensureFolders() {
    if (!this.ensureFoldersPromise) this.ensureFoldersPromise = this.ensureFoldersOnce().finally(() => { this.ensureFoldersPromise = null; });
    return this.ensureFoldersPromise;
  }
  async ensureFoldersOnce() {
    const l = this.link(); if (!l?.refresh || !/drive\.file/.test(l.scopes || '')) return null;
    const root = await this.dedupedFolder('Sofia OS'); const folders = {root};
    for (const name of GoogleService.FOLDERS) folders[name] = await this.dedupedFolder(name, root);
    this.saveLink({...this.link(), drive: {...(this.link().drive || {}), folders}});
    return folders;
  }
  /** Como folder(), mas se achar MAIS de uma pasta com o mesmo nome (de uma corrida antiga, antes
   * desta correção), mantém a mais velha, move o conteúdo das outras para dentro dela e manda as
   * outras para a lixeira — assim uma bagunça já feita se desfaz sozinha, sem mexer no Drive à mão. */
  async dedupedFolder(name, parent) {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
    const found = await this.call('GET', DRIVE + '/files?fields=files(id,name,createdTime)&orderBy=createdTime&q=' + encodeURIComponent(q));
    const files = found.files || [];
    if (!files.length) return (await this.call('POST', DRIVE + '/files?fields=id', {name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? {parents: [parent]} : {})})).id;
    const [keep, ...extra] = files;
    for (const dup of extra) {
      const inside = await this.call('GET', DRIVE + '/files?fields=files(id,parents)&q=' + encodeURIComponent(`'${dup.id}' in parents and trashed=false`));
      for (const item of inside.files || []) await this.call('PATCH', DRIVE + '/files/' + item.id + '?addParents=' + keep.id + '&removeParents=' + dup.id, {}).catch(() => {});
      await this.call('PATCH', DRIVE + '/files/' + dup.id, {trashed: true}).catch(() => {});
    }
    return keep.id;
  }
  async folderId(name) {
    const l = this.link(); if (l?.drive?.folders?.[name]) return l.drive.folders[name];
    const f = await this.ensureFolders(); return f ? f[name] : null;
  }

  // ---------- Anexos no Drive ----------
  voiceStats() {
    try { const r = this.db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN drive_id IS NOT NULL THEN 1 ELSE 0 END) AS in_drive, SUM(CASE WHEN drive_id IS NULL THEN length(blob) ELSE 0 END) AS local_bytes FROM voice_messages').get(); return {total: r.total || 0, in_drive: r.in_drive || 0, local_mb: Math.round((r.local_bytes || 0) / 1048576 * 10) / 10}; } catch { return {total: 0, in_drive: 0, local_mb: 0}; }
  }
  /** Leva para o Drive as mensagens de voz com mais de 1 dia (as recentes ficam aqui: tocam na hora
   * e ainda podem ser reenviadas). Só depois de o Drive confirmar, o blob sai daqui. */
  async offloadVoices(limit = 5) {
    const l = this.link(); if (!l?.refresh || !/drive\.file/.test(l.scopes || '') || this.offloadingVoice) return {moved: 0};
    this.offloadingVoice = true; let moved = 0;
    try {
      const dir = await this.folderId('Áudios'); if (!dir) return {moved: 0};
      const cutoff = new Date(Date.now() - 864e5).toISOString();
      const rows = this.db.prepare('SELECT message_id, mime, blob, created_at FROM voice_messages WHERE drive_id IS NULL AND length(blob) > 0 AND created_at < ? ORDER BY created_at LIMIT ?').all(cutoff, limit);
      for (const v of rows) {
        const buf = Buffer.from(v.blob), sha = crypto.createHash('sha256').update(buf).digest('hex');
        const ext = /mp4|m4a|aac/.test(v.mime) ? '.m4a' : /ogg/.test(v.mime) ? '.ogg' : /mpeg|mp3/.test(v.mime) ? '.mp3' : /wav/.test(v.mime) ? '.wav' : '.webm';
        const name = 'voz-' + String(v.created_at).slice(0, 19).replace(/[:T]/g, '-') + ext, boundary = 'sofia' + id();
        const meta = JSON.stringify({name, parents: [dir], mimeType: v.mime || 'application/octet-stream', description: 'Mensagem de voz da Sofia OS', appProperties: {sofia_voice: v.message_id}});
        const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${v.mime || 'application/octet-stream'}\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--`)]);
        const up = await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id', body, {'Content-Type': 'multipart/related; boundary=' + boundary});
        if (!up.id) continue;
        this.db.prepare('UPDATE voice_messages SET drive_id=?, sha256=?, blob=? WHERE message_id=?').run(up.id, sha, Buffer.alloc(0), v.message_id);
        moved++;
      }
      return {moved};
    } finally { this.offloadingVoice = false; }
  }
  /** Bytes de uma mensagem de voz: daqui se ainda estiver; senão do Drive (mesmo cache dos anexos). */
  async voiceBytes(v) {
    if (v.blob && v.blob.length) return Buffer.from(v.blob);
    if (!v.drive_id) return Buffer.alloc(0);
    return this.attachmentBytes({id: 'voice:' + v.message_id, blob: null, drive_id: v.drive_id});
  }
  /** Página → Markdown legível (abre em qualquer editor ou no próprio Drive). */
  static pageMarkdown(page) {
    let blocks = []; try { blocks = JSON.parse(page.data?.blocks_json || '[]'); } catch { blocks = []; }
    const out = ['# ' + (page.data?.icon ? page.data.icon + ' ' : '') + page.title, ''];
    if (page.data?.purpose) out.push('> ' + String(page.data.purpose).replace(/\n/g, '\n> '), '');
    let n = 0;
    for (const b of Array.isArray(blocks) ? blocks : []) {
      const t = String(b.text || '').trim(), type = String(b.type || 'text');
      if (type !== 'number') n = 0;
      if (type === 'divider') { out.push('---'); continue; }
      if (!t && type !== 'todo') { out.push(''); continue; }
      if (type === 'heading1') out.push('# ' + t);
      else if (type === 'heading2') out.push('## ' + t);
      else if (type === 'heading3' || type === 'heading4') out.push('### ' + t);
      else if (type === 'bullet' || type === 'toggle') out.push('- ' + t);
      else if (type === 'number') out.push((++n) + '. ' + t);
      else if (type === 'todo') out.push('- [' + (b.checked ? 'x' : ' ') + '] ' + t);
      else if (type === 'quote' || type === 'callout') out.push('> ' + t);
      else if (type === 'code') out.push('```', t, '```');
      else out.push(t);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  /** Cada página vira um .md em Sofia OS/Páginas e é atualizada quando muda (pela revisão).
   * Apagou a página na Sofia: o arquivo vai para a lixeira do Drive. Até `limit` por rodada. */
  async exportPages(limit = 20) {
    const l = this.link(); if (!l?.refresh || !/drive\.file/.test(l.scopes || '') || this.exportingPages) return {exported: 0};
    this.exportingPages = true; let exported = 0, removed = 0;
    try {
      const dir = await this.folderId('Páginas'); if (!dir) return {exported: 0};
      const map = this.kvGet('drive_pages') || {};
      const pages = []; for (let offset = 0; offset < 20000; offset += 500) { const page = this.w.list({kind: 'user_page', limit: 500, offset}); pages.push(...page); if (page.length < 500) break; }
      const alive = new Set(pages.filter(p => p.state !== 'archived').map(p => p.id));
      for (const pageId of Object.keys(map)) if (!alive.has(pageId)) { await this.call('PATCH', DRIVE + '/files/' + map[pageId].file, {trashed: true}).catch(() => {}); delete map[pageId]; removed++; }
      for (const page of pages.filter(p => p.state !== 'archived')) {
        if (exported >= limit) break;
        const known = map[page.id]; if (known && known.rev === page.revision) continue;
        const md = Buffer.from(GoogleService.pageMarkdown(page), 'utf8');
        const name = (String(page.title || 'Sem título').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'Sem título') + '.md', boundary = 'sofia' + id();
        const meta = known ? {name} : {name, parents: [dir], mimeType: 'text/markdown', description: 'Página da Sofia OS', appProperties: {sofia_page: page.id}};
        const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n`), md, Buffer.from(`\r\n--${boundary}--`)]);
        const res = known
          ? await this.call('PATCH', UPLOAD + '/files/' + known.file + '?uploadType=multipart&fields=id', body, {'Content-Type': 'multipart/related; boundary=' + boundary}).catch(e => (e.googleStatus === 404 ? null : Promise.reject(e)))
          : await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id', body, {'Content-Type': 'multipart/related; boundary=' + boundary});
        if (!res) { delete map[page.id]; continue; } // arquivo apagado à mão no Drive: recria na próxima rodada
        map[page.id] = {file: res.id || known.file, rev: page.revision};
        exported++;
      }
      this.kvSet('drive_pages', map);
      const cur = this.link(); if (cur) this.saveLink({...cur, drive: {...(cur.drive || {}), pages_exported: Object.keys(map).length}});
      return {exported, removed};
    } finally { this.exportingPages = false; }
  }
  attachmentStats() {
    try { const r = this.db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN drive_id IS NOT NULL THEN 1 ELSE 0 END) AS in_drive, SUM(CASE WHEN drive_id IS NULL THEN bytes ELSE 0 END) AS local_bytes FROM attachments').get(); return {total: r.total || 0, in_drive: r.in_drive || 0, local_mb: Math.round((r.local_bytes || 0) / 1048576 * 10) / 10}; } catch { return {total: 0, in_drive: 0, local_mb: 0}; }
  }
  /** Leva para o Drive os anexos que ainda estão só no servidor (até `limit` por rodada), e aqui fica só a referência. */
  async offloadAttachments(limit = 10) {
    const l = this.link(); if (!l?.refresh || !/drive\.file/.test(l.scopes || '') || this.offloading) return {moved: 0};
    this.offloading = true; let moved = 0;
    try {
      const dir = await this.folderId('Anexos'); if (!dir) return {moved: 0};
      const rows = this.db.prepare('SELECT id, entity_id, name, mime, bytes, blob FROM attachments WHERE drive_id IS NULL AND length(blob) > 0 ORDER BY created_at LIMIT ?').all(limit);
      for (const a of rows) {
        const boundary = 'sofia' + id();
        const meta = JSON.stringify({name: a.name, parents: [dir], mimeType: a.mime || 'application/octet-stream', description: 'Anexo da Sofia OS (' + a.entity_id + ')', appProperties: {sofia_attachment: a.id, sofia_entity: a.entity_id}});
        const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${a.mime || 'application/octet-stream'}\r\n\r\n`), Buffer.from(a.blob), Buffer.from(`\r\n--${boundary}--`)]);
        const up = await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id,size', body, {'Content-Type': 'multipart/related; boundary=' + boundary});
        if (!up.id) continue;
        // Só depois de o Drive confirmar: aqui fica a referência e um blob vazio (o tamanho original segue em bytes).
        this.db.prepare('UPDATE attachments SET drive_id=?, blob=? WHERE id=?').run(up.id, Buffer.alloc(0), a.id);
        moved++;
      }
      const cur = this.link(); if (cur) this.saveLink({...cur, drive: {...(cur.drive || {}), attachments_moved_at: now(), attachments_error: ''}});
      return {moved};
    } catch (e) {
      const cur = this.link(); if (cur) this.saveLink({...cur, drive: {...(cur.drive || {}), attachments_error: String(e.message).slice(0, 200)}});
      throw e;
    } finally { this.offloading = false; }
  }
  /** Bytes de um anexo: do servidor se ainda estão aqui; senão do Drive (com cache de até 30 MB em memória). */
  async attachmentBytes(a) {
    if (a.blob && a.blob.length) return Buffer.from(a.blob);
    if (!a.drive_id) return Buffer.alloc(0);
    const hit = this.blobCache.get(a.id); if (hit) { hit.at = Date.now(); return hit.buf; }
    const l = this.link(); if (!l?.refresh) throw new AppError('GOOGLE_NOT_CONNECTED', 'Este anexo está no seu Google Drive. Conecte a Conta Google em Perfil → Conta Google para abrir.', 503);
    const res = await this.fetch(DRIVE + '/files/' + a.drive_id + '?alt=media', {headers: {Authorization: 'Bearer ' + await this.token()}});
    if (!res.ok) throw new AppError('GOOGLE_API', 'Não consegui baixar o anexo do Drive (' + res.status + ').', 502);
    const buf = Buffer.from(await res.arrayBuffer());
    this.blobCache.set(a.id, {buf, at: Date.now()}); this.blobCacheBytes += buf.length;
    while (this.blobCacheBytes > 30 * 1048576 && this.blobCache.size) { const [oldest] = [...this.blobCache.entries()].sort((x, y) => x[1].at - y[1].at)[0]; this.blobCacheBytes -= this.blobCache.get(oldest).buf.length; this.blobCache.delete(oldest); }
    return buf;
  }

  async backupToDrive(force = false) {
    const l = this.link();
    if (!l?.refresh || !/drive\.file/.test(l.scopes || '') || !this.backups) return {skipped: true};
    if (!force && l.drive?.last_backup && l.drive.last_backup.slice(0, 10) === now().slice(0, 10)) return {skipped: true};
    try {
      const made = this.backups.create('drive');
      const bytes = fs.readFileSync(path.join(this.backups.directory, made.name));
      const dir = await this.folderId('Backups');
      const boundary = 'sofia' + id();
      const meta = JSON.stringify({name: made.name, parents: [dir], mimeType: 'application/octet-stream', description: 'Backup criptografado da Sofia OS'});
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
      await this.call('POST', UPLOAD + '/files?uploadType=multipart&fields=id', body, {'Content-Type': 'multipart/related; boundary=' + boundary});
      const list = await this.call('GET', DRIVE + '/files?orderBy=createdTime desc&pageSize=100&fields=files(id,name)&q=' + encodeURIComponent(`'${dir}' in parents and trashed=false`));
      for (const old of (list.files || []).slice(KEEP_BACKUPS)) await this.call('DELETE', DRIVE + '/files/' + old.id).catch(() => {});
      // No servidor ficam só os 3 mais novos: o Drive guarda o histórico.
      for (const b of this.backups.list().slice(3)) { try { fs.unlinkSync(path.join(this.backups.directory, b.name)); } catch { /* ignore */ } }
      this.saveLink({...this.link(), drive: {last_backup: now(), last_error: '', count: Math.min(KEEP_BACKUPS, (list.files || []).length), bytes: bytes.length}});
      return {ok: true, name: made.name, bytes: bytes.length};
    } catch (e) {
      const cur = this.link(); if (cur) this.saveLink({...cur, drive: {...(cur.drive || {}), last_error: String(e.message).slice(0, 200)}});
      throw e;
    }
  }

  start(intervalMs = 15 * 60000) {
    if (this.timer) return;
    const tick = () => { const l = this.link(); if (!l?.refresh || this.busy) return; this.offloadAttachments().catch(() => {}); this.offloadVoices().catch(() => {}); this.exportPages().catch(() => {}); this.sync().catch(() => {}); this.backupToDrive().catch(() => {}); };
    this.timer = setInterval(tick, intervalMs); this.timer.unref?.();
    setTimeout(tick, 30000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = {GoogleService, SCOPES, CALLBACK};
