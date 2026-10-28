'use strict';
// 0.3.257: cada conta do app E-mails pode entrar com a PROPRIA Conta Google (so leitura do Gmail), separada do Perfil.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {GoogleService}=require('../src/services/google');
const {MailWatcher}=require('../src/services/mail-watch');
const ENV={GOOGLE_CALENDAR_CLIENT_ID:'cid',GOOGLE_CALENDAR_CLIENT_SECRET:'csecret',SOFIA_CALENDAR_TOKEN_KEY:'chave-de-teste'};
const idToken=email=>'x.'+Buffer.from(JSON.stringify({email})).toString('base64url')+'.y';

test('Entrar com Google numa conta de e-mail: conta errada recusa, conta certa le a propria caixa sem mexer no Perfil',async t=>{
 const f=fixture(t);
 let who='outra@gmail.com',revoked=0;const calls=[];
 const fetchImpl=async(url,opts={})=>{const u=new URL(url);calls.push(u.pathname);
  const res=(s,b)=>({ok:s<300,status:s,json:async()=>b});
  if(u.href.startsWith('https://oauth2.googleapis.com/revoke')){revoked++;return res(200,{});}
  if(u.href.startsWith('https://oauth2.googleapis.com/token'))return res(200,{access_token:'at-'+who,refresh_token:'rt-'+who,expires_in:3600,scope:'openid email https://www.googleapis.com/auth/gmail.readonly',id_token:idToken(who)});
  if(u.pathname.endsWith('/messages'))return res(200,{messages:[{id:'m1'}]});
  if(u.pathname.includes('/messages/'))return res(200,{id:'m1',internalDate:String(Date.now()),snippet:'boleto chegou',payload:{headers:[{name:'From',value:'Banco <boleto@banco.com>'},{name:'Subject',value:'Seu boleto'}]}});
  return res(404,{});};
 const svc=new GoogleService(f.store,f.core.workspace,{...f.config,publicBaseUrl:'https://sofia.test'},{fetchImpl,env:ENV});
 svc.saveLink({refresh:svc.seal('rt-perfil'),email:'01.pedro@gmail.com',scopes:'openid email https://www.googleapis.com/auth/gmail.readonly'});
 const w=f.core.workspace;
 const acc=w.save({kind:'mail_account',title:'Jota',state:'active',data:{provider:'gmail_google',address:'silva.pedro@jota.ag'}});
 w.save({kind:'mail_rule',title:'Boletos',state:'active',data:{account_id:acc.id,field:'from',contains:'banco.com'}});
 const {url}=svc.mailConnectUrl(acc.id,'silva.pedro@jota.ag',{app:true});
 const q=new URL(url).searchParams;
 assert.equal(q.get('login_hint'),'silva.pedro@jota.ag');assert.match(q.get('scope'),/gmail\.readonly/);assert.doesNotMatch(q.get('scope'),/calendar|drive/,'so leitura do Gmail');
 const state=q.get('state');assert.match(state,/^a\.m~/);
 // entrou com a conta errada: recusa e revoga
 const bad=await svc.callbackResponse(new URLSearchParams({state,code:'c1'}));
 assert.match(decodeURIComponent(bad.redirect),/ok=0&mail=1.*entrou com outra@gmail\.com/);assert.equal(revoked,1);assert.equal(svc.mailLink(acc.id),null);
 // conta certa
 who='silva.pedro@jota.ag';
 const s2=new URL(svc.mailConnectUrl(acc.id,'silva.pedro@jota.ag',{app:true}).url).searchParams.get('state');
 const ok=await svc.callbackResponse(new URLSearchParams({state:s2,code:'c2'}));
 assert.match(ok.redirect,/ok=1&mail=1/);assert.equal(svc.mailLink(acc.id).email,'silva.pedro@jota.ag');
 assert.equal(svc.link().email,'01.pedro@gmail.com','Conta Google do Perfil continua a mesma');
 const mw=new MailWatcher(w,f.config,{client:()=>{throw Error('sem imap');}});mw.google=svc;
 const r=await mw.checkAll();
 assert.deepEqual(r.errors,[]);assert.equal(r.hits,1,'leu a caixa da propria conta');
 // desconectar so tira o login desta conta
 await svc.dropMailLink(acc.id);assert.equal(svc.mailLink(acc.id),null);assert.ok(svc.link().refresh);
});
