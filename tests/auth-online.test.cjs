'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');

function cookieFrom(setCookie){return String(setCookie||'').split(';')[0];}

test('v130: Railway redireciona raiz para login e libera painel somente após senha correta',async t=>{
  const old=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=old;});
  const f=fixture(t);f.config.loginPassword='senha-segura-de-teste-130';
  const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port,base='http://127.0.0.1:'+port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});

  let r=await fetch(base+'/',{redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');
  r=await fetch(base+'/login');assert.equal(r.status,200);assert.match(await r.text(),/Entrar na Sofia/);
  r=await fetch(base+'/api/bootstrap');assert.equal(r.status,401);

  r=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:'errada-errada-errada'})});
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login?error=1');

  r=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:f.config.loginPassword})});
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');const cookie=cookieFrom(r.headers.get('set-cookie'));assert.match(cookie,/^sofia_session=/);
  r=await fetch(base+'/',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.match(await r.text(),/Sofia OS · v130/);
  r=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal((await r.json()).version,'130.0.0');
});

test('v130: páginas Meta continuam públicas sem sessão',async t=>{
  const old=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(old===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=old;});
  const f=fixture(t);f.config.loginPassword='senha-segura-de-teste-130';
  const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
  const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const port=server.address().port,base='http://127.0.0.1:'+port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  for(const route of ['/health','/site','/privacy','/terms','/data-deletion','/whatsapp/connect']){const r=await fetch(base+route);assert.equal(r.status,200,route);}
});
