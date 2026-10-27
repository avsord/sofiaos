'use strict';
// 0.3.247: o site e o proprio app (Expo para web) servido em public/web pela raiz; o painel antigo fica em /painel-antigo (com login).
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const {fixture}=require('./helpers.cjs');
const {createRuntime}=require('../src/core/runtime');
const PASSWORD='web-app-fixture-only-247';
async function setup(t){
 const f=fixture(t);f.config.loginPassword=PASSWORD;f.config.loginEmail='owner@example.com';
 const runtime=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(runtime.handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;f.config.publicBaseUrl=base;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 async function request(route,body,method=body===undefined?'GET':'POST',token=''){
  const response=await fetch(base+'/api/mobile'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 const login=await request('/auth/login',{email:'owner@example.com',password:PASSWORD});
 assert.equal(login.status,200,JSON.stringify(login.body));
 return {...f,...runtime,request,token:login.body.token};
}

function raw(f,p,headers={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:new URL(f.config.publicBaseUrl).port,path:p,method:'GET',headers},res=>{let d=[];res.on('data',x=>d.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(d).toString('utf8')}));});r.on('error',reject);r.end();});}
test('raiz serve o app no navegador (index do Expo), com politica de seguranca propria e sem exigir o login antigo',async t=>{
 const f=await setup(t);
 assert.ok(fs.existsSync(path.join(__dirname,'..','public','web','index.html')),'public/web/index.html precisa existir (npm run build:web)');
 const r=await raw(f,'/');assert.equal(r.status,200);assert.match(r.headers['content-type'],/text\/html/);
 assert.match(r.body,/_expo\/static\/js\/web\/index-[a-f0-9]+\.js/,'index do Expo');
 assert.match(String(r.headers['content-security-policy']),/script-src 'self'/);assert.match(String(r.headers['content-security-policy']),/connect-src 'self'/);
 const js=r.body.match(/\/_expo\/static\/js\/web\/index-[a-f0-9]+\.js/)[0];
 const b=await raw(f,js);assert.equal(b.status,200);assert.match(b.headers['content-type'],/javascript/);assert.match(String(b.headers['cache-control']),/immutable/);
 assert.equal((await raw(f,'/_expo/../package.json')).status===200,false,'nao sai da pasta do site');
 assert.equal((await raw(f,'/_expo/static/nada.js')).status,404);
});
test('painel antigo continua em /painel-antigo e, no ambiente da Railway, manda para o login quem nao esta logado',async t=>{
 const f=await setup(t);
 const prev=process.env.RAILWAY_ENVIRONMENT;process.env.RAILWAY_ENVIRONMENT='production';t.after(()=>{if(prev===undefined)delete process.env.RAILWAY_ENVIRONMENT;else process.env.RAILWAY_ENVIRONMENT=prev;});
 const r=await raw(f,'/painel-antigo');assert.equal(r.status,303);assert.equal(r.headers.location,'/login');
 const site=await raw(f,'/');assert.equal(site.status,200,'o site novo continua publico (tem a propria tela de login)');
});
