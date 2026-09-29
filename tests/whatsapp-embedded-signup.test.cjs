'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {Store}=require('../src/memory/store');
const {createRuntime}=require('../src/core/runtime');

function runtimeFixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-wa126-'));
  const store=new Store(path.join(dir,'data','sofia.sqlite'));
  const config={root:path.resolve(__dirname,'..'),dataDir:path.join(dir,'data'),backupDir:path.join(dir,'backups'),apiKey:'',privateApiKey:'',sharedApiKey:'',model:'gpt-5.6-luna',apiTimeoutMs:50,maxMessageChars:12000,maxContextChars:20000,metaAppId:'1617872666710770',metaLoginConfigId:'1590251151959449',metaGraphVersion:'v26.0',metaAppSecret:'',whatsappVerifyToken:'sofia_webhook_2026',publicBaseUrl:'https://sofiaos.up.railway.app'};
  const runtime=createRuntime(config,{store,provider:{respond:async()=>({reply:'ok',usage:{}}),structured:async()=>({data:{},reply:'{}',usage:{}})},secureDir:path.join(dir,'secure')});
  const server=http.createServer(runtime.handler);
  t.after(async()=>{try{await runtime.scheduler.stop();}catch{} try{runtime.core.shutdown();}catch{} server.closeAllConnections();await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({runtime,server,base:'http://127.0.0.1:'+server.address().port})));
}

test('v126: endpoints públicos mínimos funcionam sem liberar o painel',async t=>{
  const f=await runtimeFixture(t);
  const health=await fetch(f.base+'/health');assert.equal(health.status,200);
  const privacy=await fetch(f.base+'/privacy');assert.equal(privacy.status,200);assert.match(await privacy.text(),/Política de Privacidade/);
  const connect=await fetch(f.base+'/whatsapp/connect');assert.equal(connect.status,200);assert.match(await connect.text(),/Conectar WhatsApp Business/);
  const cfg=await fetch(f.base+'/whatsapp/onboarding-config').then(r=>r.json());assert.equal(cfg.configId,'1590251151959449');assert.equal(cfg.featureType,'whatsapp_business_app_onboarding');
  const challenge=await fetch(f.base+'/webhook?hub.mode=subscribe&hub.verify_token=sofia_webhook_2026&hub.challenge=12345');assert.equal(challenge.status,200);assert.equal(await challenge.text(),'12345');
  const blocked=await new Promise((resolve,reject)=>{const u=new URL(f.base+'/api/bootstrap');const req=http.get({hostname:u.hostname,port:u.port,path:u.pathname,headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(blocked,403);
});
