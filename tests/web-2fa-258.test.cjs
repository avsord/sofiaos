'use strict';
// 0.3.258: segundo passo no login do SITE (navegador novo recebe codigo no e-mail); o app do celular nao muda.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');
test('site: codigo no e-mail em navegador novo, marca de 90 dias depois; app sem mudanca',async t=>{
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const sent=[];const accountMailer={configured:()=>true,sendLoginCode:async m=>{sent.push(m);},sendPasswordReset:async()=>{}};
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),accountMailer});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const login=async(body,origin)=>{const x=await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:base}:{})},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword,...body})});return {status:x.status,body:await x.json()};};
 // app do celular (sem Origin): entra direto
 const app=await login({});assert.equal(app.status,200);assert.ok(app.body.token);assert.equal(sent.length,0);
 // site, navegador novo: pede codigo e manda e-mail
 const first=await login({},true);assert.equal(first.body.need_code,true);assert.ok(!first.body.token);assert.equal(sent.length,1);assert.match(sent[0].code,/^\d{6}$/);
 assert.match(first.body.sent_to,/^o•••@example\.com$/);
 const wrong=await login({challenge:first.body.challenge,code:sent[0].code==='000000'?'111111':'000000'},true);assert.equal(wrong.status,401);assert.match(wrong.body.error,/incorreto/);
 const ok=await login({challenge:first.body.challenge,code:sent[0].code},true);assert.equal(ok.status,200);assert.ok(ok.body.token);assert.ok(ok.body.trust);
 // codigo nao serve duas vezes
 const again=await login({challenge:first.body.challenge,code:sent[0].code},true);assert.equal(again.status,401);
 // com a marca de confianca: entra direto
 const trusted=await login({trust:ok.body.trust},true);assert.equal(trusted.status,200);assert.ok(trusted.body.token);assert.equal(sent.length,1);
 // senha errada continua barrando antes de qualquer codigo
 const bad=await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:'owner@example.com',password:'errada-errada'})});assert.equal(bad.status,401);assert.equal(sent.length,1);
});
test('site: sem envio de e-mail configurado, nao trava ninguem',async t=>{
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),accountMailer:{configured:()=>false}});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const x=await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})});
 const b=await x.json();assert.equal(x.status,200);assert.ok(b.token);
});
