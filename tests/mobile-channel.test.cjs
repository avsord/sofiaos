'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'),path = require('node:path'),crypto = require('node:crypto');
const { fixture } = require('./helpers.cjs');
const { createRuntime } = require('../src/core/runtime');
const { OwnerAuth } = require('../src/services/owner-auth');
const { MobileSessions } = require('../src/services/mobile-sessions');
const PASSWORD = 'test-only-password-137';
async function setup(t, options = {}) {
  const f = fixture(t); f.config.loginPassword = PASSWORD; f.config.loginEmail = 'owner@example.com';
  const transcriptions = [];
  const runtime = createRuntime(f.config, { store: f.store, provider: f.provider, secureDir: path.join(f.dir, 'secure'),
    audioService: { transcribe: async (bytes, p) => { transcriptions.push({bytes: bytes.length, ...p}); return { text: 'Olá Sofia, esta é uma mensagem de voz.', languages: ['pt'] }; } }, ...options });
  const server = http.createServer(runtime.handler); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port; f.config.publicBaseUrl = base;
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const request = async (route, body, method = body === undefined ? 'GET' : 'POST', token = '', headers = {}) => {
    const r = await fetch(base + '/api/mobile' + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    let data; try { data = await r.json(); } catch { data = null; }
    return { status: r.status, body: data, headers: r.headers };
  };
  const login = async () => { const r = await request('/auth/login', { email: 'OWNER@EXAMPLE.COM', password: PASSWORD }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.token; };
  const create = async token => (await request('/conversations', { title: 'Conversa real' }, 'POST', token)).body.conversation;
  return { ...f, ...runtime, base, transcriptions, request, login, create };
}
test('mobile: login usa a conta existente e guarda somente hash do token', async t => {
  const f = await setup(t), token = await f.login(); assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const row = f.store.db.prepare('SELECT * FROM mobile_sessions').get(); assert.notEqual(row.token_hash, token);
  const b = await f.request('/bootstrap', undefined, 'GET', token);
  assert.equal(b.body.profile.email, 'owner@example.com'); assert.equal(b.body.ai.ready, true);
  assert.equal(b.body.capabilities.multi_user, false); assert.equal(b.body.capabilities.notifications_push, false);
  assert.equal(JSON.stringify(b.body).includes(f.config.privateApiKey), false);
});
test('mobile: exige bearer mesmo com cookie ou token da interface web', async t => {
  const f = await setup(t); assert.equal((await f.request('/bootstrap')).status, 401);
  assert.equal((await f.request('/bootstrap', undefined, 'GET', '', { 'X-Sofia-Token': 'wrong', Cookie: 'sofia_session=wrong' })).status, 401);
});
test('mobile: recusa senha errada e origem de outro site', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/auth/login', {email:'owner@example.com',password:'not-password'})).status, 401);
  assert.equal((await f.request('/auth/login', {email:'owner@example.com',password:PASSWORD}, 'POST', '', { Origin: 'https://attacker.invalid' })).status, 403);
});
test('mobile: bloqueia excesso de tentativas de login', async t => {
  const f = await setup(t);
  for (let i = 0; i < 12; i++) await f.request('/auth/login', { email:'owner@example.com', password:'bad' });
  assert.equal((await f.request('/auth/login', { email:'owner@example.com', password:PASSWORD })).status, 429);
});
test('mobile: logout revoga somente dispositivo atual', async t => {
  const f = await setup(t), a = await f.login(), b = await f.login();
  assert.equal((await f.request('/auth/logout', {}, 'POST', a)).status, 200);
  assert.equal((await f.request('/bootstrap', undefined, 'GET', a)).status, 401);
  assert.equal((await f.request('/bootstrap', undefined, 'GET', b)).status, 200);
});
test('mobile: troca de senha e expiração invalidam token', async t => {
  const f = await setup(t), a = await f.login(); f.store.db.exec('UPDATE mobile_sessions SET expires_ms=0');
  assert.equal((await f.request('/bootstrap', undefined, 'GET', a)).status, 401);
  const b = await f.login(); new OwnerAuth(f.config, f.store).setPassword('new-test-password-137');
  assert.equal((await f.request('/bootstrap', undefined, 'GET', b)).status, 401);
});
test('mobile: sessões continuam validáveis em novo handler com mesmo banco', async t => {
  const f = await setup(t), a = await f.login();
  const sessions = new MobileSessions(f.store, new OwnerAuth(f.config, f.store), f.config);
  assert.ok(sessions.require({ headers: { authorization: 'Bearer ' + a } }).expires_ms > Date.now());
});
test('mobile: encerrar todas as sessões na web também revoga app', async t => {
  const f = await setup(t), a = await f.login(); const boot = await fetch(f.base + '/api/bootstrap').then(r => r.json());
  await fetch(f.base + '/api/auth/logout-all', { method:'POST', headers: {'Content-Type':'application/json','X-Sofia-Token':boot.token},body:'{}' });
  assert.equal((await f.request('/bootstrap', undefined, 'GET', a)).status, 401);
});
test('mobile: texto chega ao núcleo, mantém histórico e repetição é idempotente', async t => {
  const f = await setup(t), token = await f.login(), c = await f.create(token);
  const body = { conversation_id: c.id, client_message_id: crypto.randomUUID(), message: 'Olá Sofia' };
  const a = await f.request('/messages', body, 'POST', token); assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.messages.length, 2); const n = f.calls.length; assert.ok(n > 0);
  const b = await f.request('/messages', body, 'POST', token); assert.equal(b.body.replayed, true); assert.equal(f.calls.length, n);
  const h = await f.request('/conversations/' + c.id, undefined, 'GET', token); assert.equal(h.body.messages.length, 2);
});
test('mobile: não depende de token ou webhook do WhatsApp', async t => {
  const f = await setup(t); f.config.metaAppId = ''; f.config.whatsappToken = ''; f.config.whatsappVerifyToken = '';
  const token = await f.login(), c = await f.create(token);
  assert.equal((await f.request('/messages', {conversation_id:c.id,client_message_id:crypto.randomUUID(),message:'Bom dia'}, 'POST', token)).status, 200);
});
test('mobile: áudio transcreve uma vez, persiste e só reproduz com autenticação', async t => {
  const f = await setup(t), token = await f.login(), c = await f.create(token);
  const data = { conversation_id:c.id,client_message_id:crypto.randomUUID(),audio_base64:Buffer.from('fake audio test only').toString('base64'),mime:'audio/mp4',duration_ms:3200 };
  const a = await f.request('/messages/audio', data, 'POST', token); assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(f.transcriptions.length, 1); const voice = a.body.messages.find(m => m.voice);
  assert.equal(voice.voice.duration_ms, 3200); assert.equal(voice.content, 'Olá Sofia, esta é uma mensagem de voz.');
  assert.equal((await f.request('/messages/audio', data, 'POST', token)).status, 200); assert.equal(f.transcriptions.length, 1);
  assert.equal((await fetch(f.base + voice.voice.audio_url)).status, 401);
  const read = await fetch(f.base + voice.voice.audio_url, {headers:{Authorization:'Bearer '+token, Range:'bytes=0-3'}});
  assert.equal(read.status, 206); assert.equal(await read.text(), 'fake');
});
test('mobile: áudio malformado e reuso de id com conteúdo diferente são recusados', async t => {
  const f = await setup(t), token = await f.login(), c = await f.create(token);
  const data = { conversation_id:c.id,client_message_id:crypto.randomUUID(),audio_base64:'bad!',mime:'audio/mp4',duration_ms:1000 };
  assert.equal((await f.request('/messages/audio', data,'POST',token)).status,400);
  data.audio_base64=Buffer.from('audio one').toString('base64');assert.equal((await f.request('/messages/audio',data,'POST',token)).status,200);
  data.audio_base64=Buffer.from('audio two').toString('base64');assert.equal((await f.request('/messages/audio',data,'POST',token)).status,409);
});
test('mobile: não transcreve por projeto compartilhado quando a chave privada não está presente', async t => {
  const f = await setup(t), token = await f.login(), c = await f.create(token);
  f.config.privateApiKey='';f.store.updateSettings({routingEnabled:false,privateConfirmed:false,legacyRoute:'none'});
  const b = await f.request('/bootstrap',undefined,'GET',token);assert.equal(b.body.ai.ready,false);assert.equal(b.body.ai.code,'ROUTE_KEY_MISSING');
  const r = await f.request('/messages/audio',{conversation_id:c.id,client_message_id:crypto.randomUUID(),audio_base64:Buffer.from('fake audio').toString('base64'),mime:'audio/mp4',duration_ms:1000},'POST',token);
  assert.notEqual(r.status,200);assert.equal(f.transcriptions.length,0);
});
test('mobile: conversas de outros canais não ficam acessíveis no app', async t => {
  const f = await setup(t), token = await f.login();const c = f.store.createConversation('WhatsApp','whatsapp-simulator');
  assert.equal((await f.request('/conversations/'+c.id,undefined,'GET',token)).status,404);
});
test('mobile: perfil, agenda e tarefas usam o armazenamento da Sofia', async t => {
  const f = await setup(t), token = await f.login();
  const p = await f.request('/profile',{name:'Nome de teste'},'PATCH',token);assert.equal(p.body.profile.name,'Nome de teste');
  const e = await f.request('/agenda',{title:'Compromisso de teste',start_at:'2026-10-03T12:00:00.000Z'},'POST',token);assert.equal(e.status,200,JSON.stringify(e.body));
  assert.ok((await f.request('/agenda',undefined,'GET',token)).body.items.some(i=>i.id===e.body.item.id));
  const task=f.store.saveTask({title:'Tarefa teste'});
  const done=await f.request('/tasks/'+task.id,{state:'done',revision:task.revision},'PATCH',token);assert.equal(done.status,200,JSON.stringify(done.body));assert.equal(f.store.task(task.id).state,'done');
  assert.equal((await f.request('/notifications',undefined,'GET',token)).body.push_enabled,false);
});

// 056: visibility is not lifecycle state; opening history is read-only.
test('056 mobile history lists and reads paused/archived personal conversations without resuming or changing messages',async t=>{
 const f=await setup(t),token=await f.login();
 for(const state of ['paused','archived']){
  const c=await f.create(token);
  await f.request('/messages',{conversation_id:c.id,client_message_id:crypto.randomUUID(),message:'Historico que deve permanecer'},'POST',token);
  f.store.db.prepare('UPDATE conversations SET state=? WHERE id=?').run(state,c.id);
  const before=JSON.stringify(f.store.messages(c.id));
  const listing=await f.request('/conversations',undefined,'GET',token);
  const listed=listing.body.items.find(x=>x.id===c.id);assert.ok(listed);assert.equal(listed.message_count,2);
  const read=await f.request('/conversations/'+c.id,undefined,'GET',token);assert.equal(read.status,200);assert.equal(read.body.messages.length,2);
  assert.equal(f.store.conversation(c.id).state,state);assert.equal(JSON.stringify(f.store.messages(c.id)),before);
 }
});
test('056 populated history is not hidden behind new empty conversations; deleted and foreign channels stay private',async t=>{
 const f=await setup(t),token=await f.login(),kept=await f.create(token);
 await f.request('/messages',{conversation_id:kept.id,client_message_id:crypto.randomUUID(),message:'Mensagem antiga'},'POST',token);
 for(let n=0;n<65;n++)f.store.createConversation('Vazia '+n,'mobile');
 const foreign=f.store.createConversation('Contato privado','whatsapp-simulator');
 const deleted=f.store.createConversation('Apagada','web');f.store.db.prepare("UPDATE conversations SET state='deleted' WHERE id=?").run(deleted.id);
 const rows=(await f.request('/conversations',undefined,'GET',token)).body.items;
 assert.equal(rows[0].id,kept.id);assert.ok(!rows.some(x=>[deleted.id,foreign.id].includes(x.id)));
 assert.equal((await f.request('/conversations/'+foreign.id,undefined,'GET',token)).status,404);
 assert.equal((await f.request('/conversations/'+deleted.id,undefined,'GET',token)).status,404);
});
