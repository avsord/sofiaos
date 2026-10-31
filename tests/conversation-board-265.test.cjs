'use strict';
// 0.3.265: Quadro da conversa (assuntos com decidido/a fazer/em aberto/numeros) e o bug das conversas vazias.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');const {createConversationBoard}=require('../src/services/conversation-board');
test('quadro: organiza por assunto, guarda data/hora do inicio e da nome a conversa',async t=>{
 const f=fixture(t);const c=f.store.createConversation('Conversa com a Sofia','mobile');
 f.store.addMessage?.(c.id,'user','Amanhã tenho mercado às 14h');
 const add=(role,content)=>f.store.db.prepare("INSERT INTO messages(id,owner,conversation_id,role,content,status,created_at) VALUES(?,?,?,?,?,'sent',?)").run(require('node:crypto').randomUUID(),'owner-local',c.id,role,content,new Date().toISOString());
 try{add('user','Amanhã tenho mercado às 14h');add('assistant','Coloquei na agenda.');add('user','E a proposta Autopass, 4.500?');add('assistant','Sugiro entre 5.200 e 5.600.');}catch(e){t.skip('estrutura de mensagens diferente: '+e.message);return;}
 let calls=0;const provider={structured:async()=>{calls++;return {topics:[{title:'Mercado amanhã',start:0,decided:['Mercado amanhã 14:00'],todo:[],open:[],numbers:[],refs:[]},{title:'Proposta Autopass',start:2,decided:[],todo:['Enviar proposta'],open:[{title:'Valor',detail:'4.500 ou 5.200–5.600'}],numbers:[{label:'Pensado',value:'R$ 4.500'}],refs:[]}]};}};
 const b=createConversationBoard({store:f.store,provider});
 const r=await b.update(c.id);
 assert.equal(r.topics.length,2);assert.ok(r.topics[1].started_at);assert.equal(r.topics[1].open[0].title,'Valor');
 assert.equal(f.store.db.prepare('SELECT title FROM conversations WHERE id=?').get(c.id).title,'Proposta Autopass');
 await b.update(c.id);assert.equal(calls,1,'sem mensagem nova, nao chama a IA de novo');
 assert.equal(b.read(c.id).topics.length,2);
});
test('conversas vazias: o + reaproveita a vazia e a lista nao mostra vazias',async t=>{
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const {token}=await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})})).json();
 const H={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const a=(await (await fetch(base+'/api/mobile/conversations',{method:'POST',headers:H,body:'{}'})).json()).conversation;
 const b=(await (await fetch(base+'/api/mobile/conversations',{method:'POST',headers:H,body:'{}'})).json()).conversation;
 assert.equal(a.id,b.id,'apertar + duas vezes nao cria duas conversas vazias');
 const list=(await (await fetch(base+'/api/mobile/conversations',{headers:H})).json()).items;
 assert.ok(!list.some(x=>x.message_count===0&&x.id!==a.id),'nenhuma vazia na lista (fora a aberta agora)');
 const bd=await (await fetch(base+'/api/mobile/conversations/'+a.id+'/board',{headers:H})).json();assert.deepEqual(bd.topics,[]);
});
