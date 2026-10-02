'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {httpFixture}=require('./helpers.cjs');
const {OwnerAuth}=require('../src/services/owner-auth');
const {MobileSessions}=require('../src/services/mobile-sessions');
const {createChatSync}=require('../src/services/chat-sync');
async function setup(t){
 const f=await httpFixture(t);f.config.publicBaseUrl=f.base;
 const token=new MobileSessions(f.store,new OwnerAuth(f.config,f.store),f.config).issue('sync-test').token;
 const mobile=async(path,body,method=body===undefined?'GET':'POST',headers={})=>{
  const r=await fetch(f.base+'/api/mobile/chat-sync'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 const web=(path='',body,method=body===undefined?'GET':'POST')=>f.request('/api/chat-sync'+path,body,method);
 function add(id,text='teste',channel='web'){const user=f.store.userMessage({conversationId:id,clientId:crypto.randomUUID(),message:text,channel}).message;const answer=f.store.complete(user.id,null,{reply:'resposta de teste'},[]);return [f.store.message(user.id),answer];}
 return {...f,mobile,web,add};
}
test('sync: app and site open one owner conversation, including a fresh service instance',async t=>{
 const f=await setup(t);assert.equal((await f.web()).body.conversation,null);
 const a=await f.mobile('/current',{}),b=await f.web('/current',{});assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.conversation.id,b.body.conversation.id);
 assert.equal(createChatSync(f.store).current(true).id,a.body.conversation.id);assert.equal(f.calls.length,0,'sync must never invoke AI');
});
test('sync: explicit selection on either client is visible to the other',async t=>{
 const f=await setup(t),a=f.store.createConversation('Site','web'),b=f.store.createConversation('App','mobile');
 await f.web('/select',{conversation_id:a.id});assert.equal((await f.mobile('')).body.conversation.id,a.id);
 const before=(await f.web()).body.cursor_revision;await f.mobile('/select',{conversation_id:b.id});const after=(await f.web()).body;
 assert.equal(after.conversation.id,b.id);assert.ok(after.cursor_revision>before);await f.web('/select',{conversation_id:b.id});assert.equal((await f.web()).body.cursor_revision,after.cursor_revision);
});
test('sync: messages, responses and voice metadata travel both ways without new AI calls',async t=>{
 const f=await setup(t),c=(await f.web('/current',{})).body.conversation;
 const first=f.add(c.id,'escrito no site','web'),second=f.add(c.id,'escrito no app','mobile');
 f.store.saveVoiceMessage(second[0].id,{mime:'audio/mp4',duration_ms:1000,transcript:'escrito no app',bytes:Buffer.from('fixture-audio')});
 const w=(await f.web()).body,m=(await f.mobile('')).body;assert.deepEqual(w.messages.map(x=>x.id),m.messages.map(x=>x.id));assert.equal(w.messages.length,4);
 assert.equal(w.messages[2].voice.audio_url,'/api/messages/'+second[0].id+'/audio');assert.equal(m.messages[2].voice.audio_url,'/api/mobile/messages/'+second[0].id+'/audio');assert.equal(f.calls.length,0);
});
test('sync: batch deletion is visible in both snapshots and is idempotent',async t=>{
 const f=await setup(t),c=(await f.web('/current',{})).body.conversation,a=f.add(c.id),b=f.add(c.id);
 const ids=[a[0].id,a[1].id,b[0].id];const deletion=await f.mobile('/delete',{conversation_id:c.id,ids});assert.equal(deletion.status,200,JSON.stringify(deletion.body));assert.equal(deletion.body.ok,true);assert.deepEqual(deletion.body.deleted_ids,ids);
 assert.deepEqual((await f.web()).body.messages.map(x=>x.id),[b[1].id]);assert.equal((await f.web('/delete',{conversation_id:c.id,ids})).body.ok,true);
 assert.equal((await f.mobile('')).body.deleted_ids.length,3);
});
test('sync: an invalid or cross-thread ID cannot partly delete a valid selection',async t=>{
 const f=await setup(t),a=f.store.createConversation('A','web'),b=f.store.createConversation('B','mobile'),aa=f.add(a.id),bb=f.add(b.id);
 const r=await f.mobile('/delete',{conversation_id:a.id,ids:[aa[0].id,bb[0].id]});assert.equal(r.status,404);assert.ok(f.store.message(aa[0].id));assert.ok(f.store.message(bb[0].id));
});
test('sync: pending selected messages block deletion without touching completed messages',async t=>{
 const f=await setup(t),c=f.store.createConversation('A','web'),a=f.add(c.id);const pending=f.store.userMessage({conversationId:c.id,clientId:crypto.randomUUID(),message:'em andamento'}).message;
 const r=await f.web('/delete',{conversation_id:c.id,ids:[a[0].id,pending.id]});assert.equal(r.status,409);assert.ok(f.store.message(a[0].id));assert.equal(f.store.message(pending.id).status,'pending');
});
test('sync: tombstones include deleted rows older than the latest snapshot window',async t=>{
 const f=await setup(t),c=f.store.createConversation('Histórico','web'),old=f.add(c.id);for(let i=0;i<52;i++)f.add(c.id,'fixture '+i);
 f.store.deleteMessage(old[0].id);const r=await f.mobile('?conversation_id='+c.id);assert.equal(r.body.messages.length,100);assert.equal(r.body.has_more,true);assert.ok(r.body.deleted_ids.includes(old[0].id));
});
test('sync: tests, simulations and WhatsApp contact histories never become the personal cursor',async t=>{
 const f=await setup(t);for(const channel of ['test','whatsapp-simulator','whatsapp']){const c=f.store.createConversation('Não compartilhar '+channel,channel==='whatsapp'?'web':channel);if(channel==='whatsapp')f.store.db.prepare('UPDATE conversations SET channel=? WHERE id=?').run(channel,c.id);const r=await f.web('/select',{conversation_id:c.id});assert.equal(r.status,404);}
 assert.equal((await f.mobile('')).body.conversation,null);assert.equal((await f.web('/current',{})).body.conversation.channel,'web');
});
test('sync: missing mobile bearer and cross-origin requests are rejected',async t=>{
 const f=await setup(t);const r=await fetch(f.base+'/api/mobile/chat-sync');assert.equal(r.status,401);
 assert.equal((await f.mobile('',undefined,'GET',{Origin:'https://attacker.invalid'})).status,403);
 const missing=await fetch(f.base+'/api/chat-sync/current',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missing.status,403);
});
test('sync: a cleared conversation is not recreated by a GET and POST creates only one replacement',async t=>{
 const f=await setup(t),old=(await f.web('/current',{})).body.conversation;f.add(old.id);f.store.clearChatHistory();
 assert.equal((await f.mobile('')).body.conversation,null);const next=(await f.mobile('/current',{})).body.conversation;assert.notEqual(next.id,old.id);assert.equal((await f.web('/current',{})).body.conversation.id,next.id);
});
test('sync: a recoverable deletion failure is explicit rather than reported successful',async t=>{
 const f=await setup(t),c=f.store.createConversation('A','web'),a=f.add(c.id),sync=createChatSync(f.store),original=f.store.deleteMessage.bind(f.store);
 f.store.deleteMessage=id=>{if(id===a[1].id)throw Error('fixture failure');return original(id);};const r=sync.remove(c.id,a.map(m=>m.id));assert.equal(r.ok,false);assert.deepEqual(r.deleted_ids,[a[0].id]);assert.equal(r.failed[0].id,a[1].id);assert.ok(f.store.message(a[1].id));
});
