'use strict';
// Adicionar/mover o widget de Cápsulas na Início dava "Esta rota do aplicativo não existe":
// o app salva a ordem com PATCH /md/dashboard e o servidor só aceitava GET/POST.
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http'),fs=require('node:fs');
const {fixture}=require('./helpers.cjs');const {createRuntime}=require('../src/core/runtime');
async function setup(t){
 const f=fixture(t);f.config.loginPassword='integration-test-password-only';f.config.loginEmail='owner@example.com';
 const r=createRuntime(f.config,{store:f.store,provider:f.provider,secureDir:path.join(f.dir,'secure')});
 const server=http.createServer(r.handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
 const {token}=await (await fetch(base+'/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:f.config.loginPassword})})).json();
 const call=async(m,p,body)=>{const x=await fetch(base+'/api/mobile'+p,{method:m,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:x.status,body:await x.json().catch(()=>null)};};
 return {call};
}
test('PATCH /md/dashboard (o que o app usa) salva a ordem com Capsulas; GET devolve a mesma',async t=>{
 const {call}=await setup(t);
 const r=await call('PATCH','/md/dashboard',{widgets:['capsules','monitoring','tasks']});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body.widgets,['capsules','monitoring','tasks']);
 const g=await call('GET','/md/dashboard');assert.deepEqual(g.body.widgets,['capsules','monitoring','tasks']);assert.equal(g.body.saved,true);
 assert.equal((await call('POST','/md/dashboard',{widgets:['tasks']})).status,200,'POST continua valendo');
 assert.equal((await call('PATCH','/md/dashboard',{widgets:'x'})).status,400,'lista invalida continua recusada');
});
test('o app realmente usa PATCH nessa rota (o teste acima cobre o caminho real)',()=>{
 const a=fs.readFileSync(path.join(__dirname,'../SOFIA_APP/src/lib/api.ts'),'utf8');
 assert.ok(a.includes("this.request<{widgets:string[]}>('/md/dashboard',{widgets},'PATCH')"));
});
