'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');

function cookieFrom(setCookie){return String(setCookie||'').split(';')[0];}

test('v133: Railway redireciona raiz para login e libera painel somente após senha correta',async t=>{
  const old=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=old;});
  const f=fixture(t);f.config.loginPassword='senha-segura-de-teste-131';f.config.loginEmail='owner@example.com';
  const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port,base='http://127.0.0.1:'+port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});

  let r=await fetch(base+'/',{redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
  r=await fetch(base+'/login');assert.equal(r.status,200);assert.match(await r.text(),/Entrar na Sofia/);
  r=await fetch(base+'/api/bootstrap');assert.equal(r.status,401);

  r=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'owner@example.com',password:'errada-errada-errada'})});
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login?error=1');

  r=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'owner@example.com',password:f.config.loginPassword})});
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');const cookie=cookieFrom(r.headers.get('set-cookie'));assert.match(cookie,/^sofia_session=/);
  r=await fetch(base+'/',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.match(await r.text(),/Sofia OS · v142/);
  r=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal((await r.json()).version,'142.0.0');
});

test('v133: páginas Meta continuam públicas sem sessão',async t=>{
  const old=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=old;});
  const f=fixture(t);f.config.loginPassword='senha-segura-de-teste-131';f.config.loginEmail='owner@example.com';
  const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port,base='http://127.0.0.1:'+port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  for(const route of ['/health','/site','/privacy','/terms','/data-deletion','/whatsapp/connect']){const r=await fetch(base+route);assert.equal(r.status,200,route);}
});


test('v133: sair limpa a sessão e encerrar todas invalida sessões abertas',async t=>{
  const old=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=old;});
  const f=fixture(t);f.config.loginPassword='senha-segura-de-teste-131';f.config.loginEmail='owner@example.com';
  const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port,base='http://127.0.0.1:'+port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const login=async()=>{const r=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'owner@example.com',password:f.config.loginPassword})});return cookieFrom(r.headers.get('set-cookie'));};
  const first=await login(),second=await login();
  let r=await fetch(base+'/logout',{redirect:'manual',headers:{Cookie:first}});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login?logout=1');
  r=await fetch(base+'/',{redirect:'manual',headers:{Cookie:first}});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
  r=await fetch(base+'/api/bootstrap',{headers:{Cookie:second}});const bootstrap=await r.json();assert.equal(r.status,200);assert.equal(bootstrap.auth.role,'owner');assert.equal(bootstrap.auth.session_ttl_hours,null);assert.equal(bootstrap.auth.session_persistent,true);
  r=await fetch(base+'/api/auth/logout-all',{method:'POST',headers:{Cookie:second,'X-Sofia-Token':bootstrap.token}});assert.equal(r.status,200);assert.equal((await r.json()).redirect,'/login?logout=all');
  r=await fetch(base+'/',{redirect:'manual',headers:{Cookie:second}});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
});


test('v141: sessão web persiste entre handlers com o mesmo banco',async t=>{
  const old=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=old;});
  const f=fixture(t);f.config.loginPassword='senha-segura-de-teste-140';f.config.loginEmail='owner@example.com';
  let runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  let server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
  let r=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'owner@example.com',password:f.config.loginPassword})});
  const cookie=cookieFrom(r.headers.get('set-cookie'));assert.match(cookie,/^sofia_session=/);
  server.closeAllConnections();await new Promise(r=>server.close(r));
  runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  r=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(r.status,200);
});
