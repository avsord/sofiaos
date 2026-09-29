'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');

function cookieFrom(value){return String(value||'').split(';')[0];}
async function onlineServer(t,{mailer}={}){
  const previous=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='test';
  t.after(()=>{if(previous===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=previous;});
  const f=fixture(t);f.config.loginPassword='senha-inicial-segura-133';f.config.loginEmail='owner@example.com';
  const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure'),accountMailer:mailer});
  const server=http.createServer(runtime.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return {...f,runtime,base};
}
async function login(base,password,email='owner@example.com'){
  return fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password})});
}

test('v133: login exige o e-mail cadastrado além da senha',async t=>{
  const {base}=await onlineServer(t);
  let r=await login(base,'senha-inicial-segura-133','outro@example.com');
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login?error=1');
  r=await login(base,'senha-inicial-segura-133');assert.equal(r.headers.get('location'),'/');
});

test('v133: recuperação envia link somente ao e-mail cadastrado e permite trocar a senha',async t=>{
  const sent=[];const mailer={configured:()=>true,sendPasswordReset:async payload=>sent.push(payload)};
  const {base}=await onlineServer(t,{mailer});
  let r=await fetch(base+'/forgot-password');assert.equal(r.status,200);assert.match(await r.text(),/Recuperar senha/);
  r=await fetch(base+'/auth/forgot-password',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'outro@example.com'})});
  assert.equal(r.headers.get('location'),'/forgot-password?sent=1');assert.equal(sent.length,0);
  r=await fetch(base+'/auth/forgot-password',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'owner@example.com'})});
  assert.equal(r.headers.get('location'),'/forgot-password?sent=1');assert.equal(sent.length,1);assert.equal(sent[0].to,'owner@example.com');
  const resetUrl=new URL(sent[0].url);assert.equal(resetUrl.pathname,'/reset-password');assert.ok(resetUrl.searchParams.get('token'));
  r=await fetch(base+resetUrl.pathname+resetUrl.search);assert.equal(r.status,200);assert.match(await r.text(),/Criar nova senha/);
  r=await fetch(base+'/auth/reset-password',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:resetUrl.searchParams.get('token'),password:'senha-nova-segura-133',confirm_password:'senha-nova-segura-133'})});
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login?reset=1');
  r=await login(base,'senha-inicial-segura-133');assert.equal(r.headers.get('location'),'/login?error=1');
  r=await login(base,'senha-nova-segura-133');assert.equal(r.headers.get('location'),'/');
  r=await fetch(base+resetUrl.pathname+resetUrl.search);assert.match(await r.text(),/Link inválido ou expirado/);
});

test('v133: proprietário pode alterar a senha dentro da conta e todas as sessões são invalidadas',async t=>{
  const {base}=await onlineServer(t);
  let r=await login(base,'senha-inicial-segura-133');const cookie=cookieFrom(r.headers.get('set-cookie'));assert.ok(cookie);
  r=await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}});const bootstrap=await r.json();assert.equal(r.status,200);assert.equal(bootstrap.auth.login_email,'owner@example.com');
  r=await fetch(base+'/api/auth/change-password',{method:'POST',headers:{Cookie:cookie,'X-Sofia-Token':bootstrap.token,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:'senha-inicial-segura-133',newPassword:'senha-alterada-segura-133',confirmPassword:'senha-alterada-segura-133'})});
  assert.equal(r.status,200);assert.equal((await r.json()).redirect,'/login?changed=1');
  r=await fetch(base+'/',{redirect:'manual',headers:{Cookie:cookie}});assert.equal(r.headers.get('location'),'/login');
  r=await login(base,'senha-alterada-segura-133');assert.equal(r.headers.get('location'),'/');
});
