'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {MailWatcher,ruleMatches,plainText}=require('../src/services/mail-watch');

function fakeServer(messages,{uidValidity=7,failLogin=false}={}){
 const calls=[];
 return {calls,client:opts=>({
  async connect(){calls.push(['connect',opts.host,opts.auth.user,opts.auth.pass]);if(failLogin)throw Object.assign(new Error('Invalid credentials'),{responseText:'AUTHENTICATIONFAILED Invalid credentials'});},
  async mailboxOpen(){return {exists:messages.length,uidValidity,uidNext:(messages.at(-1)?.uid||0)+1};},
  async search(q){calls.push(['search',q]);if(q.since)return messages.map(m=>m.uid);const from=Number(String(q.uid).split(':')[0]);return messages.filter(m=>m.uid>=from).map(m=>m.uid);},
  async *fetch(range){const want=new Set(String(range).split(',').map(Number));for(const m of messages)if(want.has(m.uid))yield {uid:m.uid,internalDate:new Date('2026-10-11T12:00:00Z'),envelope:{subject:m.subject,from:[{name:m.name,address:m.addr}]},source:Buffer.from('Content-Type: text/plain\r\n\r\n'+m.body)};},
  async logout(){},
 })};
}
const mail=(uid,name,addr,subject,body='')=>({uid,name,addr,subject,body});

test('regras: remetente, assunto, texto, várias opções por vírgula, sem acento e só na conta escolhida',()=>{
 const m={accountId:'a1',fromName:'Banco Itaú',fromAddr:'avisos@itau.com.br',subject:'Sua fatura chegou',text:'Vencimento dia 10'};
 assert.ok(ruleMatches({data:{field:'from',contains:'itau'}},m));
 assert.ok(ruleMatches({data:{field:'subject',contains:'boleto, fatura'}},m));
 assert.ok(!ruleMatches({data:{field:'subject',contains:'vencimento'}},m));
 assert.ok(ruleMatches({data:{field:'body',contains:'vencimento'}},m));
 assert.ok(ruleMatches({data:{field:'any',contains:'ITAÚ'}},m));
 assert.ok(!ruleMatches({data:{field:'any',contains:'itau',account_id:'outra'}},m));
 assert.ok(!ruleMatches({data:{field:'any',contains:' , '}},m));
});

test('texto do e-mail: base64, quoted-printable e HTML viram texto simples',()=>{
 assert.equal(plainText('Content-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from('Olá, Pedro').toString('base64')),'Olá, Pedro');
 assert.equal(plainText('Content-Type: text/html\r\n\r\n<p>Seu <b>pedido</b> saiu</p>'),'Seu pedido saiu');
});

test('vigia: senha de app criptografada, primeira leitura olha 2 dias, avisa uma vez só e continua de onde parou',async t=>{
 const {core,store,config}=fixture(t);const w=core.workspace;
 const msgs=[mail(10,'Loja X','promo@lojax.com','Oferta da semana'),mail(11,'Ana Souza','ana@empresa.com','Contrato para assinar','Segue o contrato')];
 const srv=fakeServer(msgs);const mw=new MailWatcher(w,config,{client:srv.client});
 const acc=w.save({kind:'mail_account',title:'Gmail',area:'Pessoal',data:{provider:'gmail',address:'pedro@gmail.com'}});
 w.save({kind:'mail_rule',title:'Ana',area:'Pessoal',data:{field:'from',contains:'ana@empresa.com',notify:true,important:true}});
 await assert.rejects(()=>mw.checkAll(),()=>true).catch(()=>{});
 const r0=await mw.checkAll();assert.match(r0.errors[0].error,/senha de app/i,'sem senha não tenta conectar');
 await mw.saveSecretAndTest(acc.id,'abcd efgh ijkl mnop');
 const raw=fs.readFileSync(path.join(config.dataDir,'mail-secrets.json'),'utf8');assert.ok(!raw.includes('abcd'),'senha não fica em texto puro');
 assert.equal(mw.secret(acc.id),'abcd efgh ijkl mnop');assert.equal(w.get(acc.id).data.secret_set,true);
 const r1=await mw.checkAll();assert.equal(r1.scanned,2);assert.equal(r1.hits,1);
 assert.ok(srv.calls.some(c=>c[0]==='connect'&&c[1]==='imap.gmail.com'&&c[3]==='abcd efgh ijkl mnop'));
 const hits=w.list({kind:'mail_hit'});assert.equal(hits.length,1);assert.equal(hits[0].title,'Contrato para assinar');assert.equal(hits[0].data.important,true);
 const notes=store.db.prepare("SELECT * FROM notifications WHERE category='email'").all();assert.equal(notes.length,1);assert.match(notes[0].title,/Ana Souza/);
 assert.equal(w.get(acc.id).data.last_uid,11);
 msgs.push(mail(12,'Ana Souza','ana@empresa.com','Re: Contrato','Assinado'));
 const r2=await mw.checkAll();assert.equal(r2.scanned,1,'só a mensagem nova');assert.equal(w.list({kind:'mail_hit'}).length,2);
 assert.deepEqual(srv.calls.filter(c=>c[0]==='search').at(-1)[1],{uid:'12:*'});
 await mw.checkAll();assert.equal(w.list({kind:'mail_hit'}).length,2,'não duplica');
});

test('vigia: trecho com senha é escondido e login recusado vira erro claro na conta',async t=>{
 const {core,config}=fixture(t);const w=core.workspace;
 const mw=new MailWatcher(w,config,{client:fakeServer([mail(5,'Banco','b@banco.com','Seu acesso','sua senha: 123456')]).client});
 const acc=w.save({kind:'mail_account',title:'G',area:'Pessoal',data:{provider:'gmail',address:'p@gmail.com'}});
 w.save({kind:'mail_rule',title:'Banco',area:'Pessoal',data:{field:'from',contains:'banco'}});
 mw.setSecret(acc.id,'x');await mw.checkAll();
 assert.match(w.list({kind:'mail_hit'})[0].data.snippet,/escondido/);
 const bad=new MailWatcher(w,config,{client:fakeServer([],{failLogin:true}).client});
 await assert.rejects(()=>bad.test(acc.id,'errada'),/senha de app/);
 const r=await bad.checkAll();assert.match(w.get(acc.id).data.last_error,/senha de app/);assert.equal(r.errors.length,1);
});

test('conta e regra: validação',t=>{
 const {core}=fixture(t);
 assert.throws(()=>core.workspace.save({kind:'mail_account',title:'x',area:'Pessoal',data:{provider:'gmail',address:'semarroba'}}),/e-mail completo/);
 assert.throws(()=>core.workspace.save({kind:'mail_account',title:'x',area:'Pessoal',data:{provider:'imap',address:'a@b.com'}}),/servidor IMAP/);
 assert.throws(()=>core.workspace.save({kind:'mail_rule',title:'x',area:'Pessoal',data:{field:'from'}}),/procurar/);
});

test('Gmail pela Conta Google: sem senha de app, lê só cabeçalho e trecho, continua de onde parou',async t=>{
 const {core,store,config}=fixture(t);const w=core.workspace;
 const msgs=[{id:'m1',internalDate:String(Date.parse('2026-10-12T10:00:00Z')),snippet:'Segue o contrato para assinar',payload:{headers:[{name:'From',value:'"Ana Souza" <ana@empresa.com>'},{name:'Subject',value:'Contrato'}]}},
  {id:'m2',internalDate:String(Date.parse('2026-10-12T11:00:00Z')),snippet:'Promoção',payload:{headers:[{name:'From',value:'loja@x.com'},{name:'Subject',value:'Oferta'}]}}];
 const calls=[];
 const google={link:()=>({refresh:'x',scopes:'openid https://www.googleapis.com/auth/gmail.readonly'}),call:async(m,url)=>{calls.push(url);const u=new URL(url);
  if(u.pathname.endsWith('/messages'))return {messages:msgs.filter(x=>{const q=u.searchParams.get('q');const a=/after:(\d+)/.exec(q);return !a||Number(x.internalDate)/1000>Number(a[1]);}).map(x=>({id:x.id}))};
  return msgs.find(x=>u.pathname.endsWith('/'+x.id));}};
 const mw=new MailWatcher(w,config,{client:()=>{throw Error('não deve usar IMAP');}});mw.google=google;
 w.save({kind:'mail_account',title:'Gmail',area:'Pessoal',data:{provider:'gmail_google',address:'pedro@gmail.com'}});
 w.save({kind:'mail_rule',title:'Ana',area:'Pessoal',data:{field:'from',contains:'ana@empresa.com',notify:true}});
 const r=await mw.checkAll();assert.equal(r.errors.length,0);assert.equal(r.scanned,2);assert.equal(r.hits,1);
 assert.ok(calls[0].includes(encodeURIComponent('newer_than:2d')),'primeira vez: últimos 2 dias');
 const hit=w.list({kind:'mail_hit'})[0];assert.equal(hit.data.from_name,'Ana Souza');assert.equal(hit.data.snippet,'Segue o contrato para assinar');
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM notifications WHERE category='email'").get().n,1);
 msgs.push({id:'m3',internalDate:String(Date.parse('2026-10-12T12:00:00Z')),snippet:'Assinado',payload:{headers:[{name:'From',value:'Ana Souza <ana@empresa.com>'},{name:'Subject',value:'Re: Contrato'}]}});
 const r2=await mw.checkAll();assert.equal(r2.scanned,1,'só a nova');assert.equal(w.list({kind:'mail_hit'}).length,2);
 assert.ok(calls.some(c=>c.includes('after%3A')),'depois: só o que chegou desde a última');
});

test('Gmail pela Conta Google sem a permissão do Gmail: erro claro pedindo para reconectar',async t=>{
 const {core,config}=fixture(t);const w=core.workspace;
 const mw=new MailWatcher(w,config,{});mw.google={link:()=>({refresh:'x',scopes:'openid email'}),call:async()=>({})};
 const acc=w.save({kind:'mail_account',title:'Gmail',area:'Pessoal',data:{provider:'gmail_google',address:'pedro@gmail.com'}});
 await mw.checkAll();assert.match(w.get(acc.id).data.last_error,/conecte a Conta Google de novo/);
});

test('0.3.146: regra nova reavalia e-mails ja lidos (ex.: "boleto" que ja estava na caixa) sem duplicar nem perder o ponto de leitura',async t=>{
 const {core,config}=fixture(t);const w=core.workspace;
 const msgs=[mail(20,'Cobranca Online','cobranca@loja.com.br','Seu boleto vence amanha'),mail(21,'Ana','ana@empresa.com','Reuniao')];
 const srv=fakeServer(msgs);const mw=new MailWatcher(w,config,{client:srv.client});
 const acc=w.save({kind:'mail_account',title:'G',area:'Pessoal',data:{provider:'gmail',address:'p@gmail.com'}});mw.setSecret(acc.id,'x');
 w.save({kind:'mail_rule',title:'Ana',area:'Pessoal',data:{field:'from',contains:'ana@empresa.com'}});
 await mw.checkAll();assert.equal(w.list({kind:'mail_hit'}).length,1);assert.equal(w.get(acc.id).data.last_uid,21);
 // regra criada depois: a verificacao normal nao veria o boleto antigo
 w.save({kind:'mail_rule',title:'Contas e faturas',area:'Pessoal',data:{field:'any',contains:'fatura, boleto, vencimento, pagamento'}});
 const normal=await mw.checkAll();assert.equal(normal.scanned,0);
 const re=await mw.checkAll(undefined,14);assert.equal(re.hits,2,'as duas mensagens batem com alguma regra');
 const hits=w.list({kind:'mail_hit'});assert.equal(hits.length,2,'a do boleto entra; a da Ana nao duplica');
 assert.ok(hits.some(h=>/Contas e faturas/.test(h.data.rule_names)&&/boleto/i.test(h.title)));
 assert.equal(w.get(acc.id).data.last_uid,21,'reavaliar nao mexe no ponto de leitura');
});
test('0.3.146: mensagem ja registrada por uma regra ganha o nome da outra regra que tambem bate',async t=>{
 const {core,config}=fixture(t);const w=core.workspace;
 const srv=fakeServer([mail(30,'Banco','avisos@banco.com','Fatura disponivel')]);const mw=new MailWatcher(w,config,{client:srv.client});
 const acc=w.save({kind:'mail_account',title:'G',area:'Pessoal',data:{provider:'gmail',address:'p@gmail.com'}});mw.setSecret(acc.id,'x');
 w.save({kind:'mail_rule',title:'Banco',area:'Pessoal',data:{field:'from',contains:'avisos@banco.com'}});
 await mw.checkAll();
 w.save({kind:'mail_rule',title:'Faturas',area:'Pessoal',data:{field:'subject',contains:'fatura'}});
 await mw.checkAll(undefined,7);
 const hits=w.list({kind:'mail_hit'});assert.equal(hits.length,1);assert.match(hits[0].data.rule_names,/Banco/);assert.match(hits[0].data.rule_names,/Faturas/);
});
