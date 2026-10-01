'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/memory/store');
const {createRuntime}=require('../src/core/runtime');
const PRIVATE_KEY='sk-'+'private_sync_test_'.repeat(3);

function config(dir,privateApiKey=''){
  return {root:path.resolve(__dirname,'..'),dataDir:path.join(dir,'data'),backupDir:path.join(dir,'backups'),apiKey:'',privateApiKey,sharedApiKey:'',adminApiKey:'',model:'gpt-5.6-luna',transcriptionModel:'gpt-transcribe',publicBaseUrl:'http://127.0.0.1',loginPassword:'',loginEmail:'',smtpHost:'',smtpPort:465,smtpSecure:true,smtpUser:'',smtpPass:'',smtpFrom:'',apiTimeoutMs:100,turnTimeoutMs:100,maxMessageChars:12000,maxContextChars:20000};
}

test('private server key restores the already configured private filter state after a fresh deploy',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-filter-sync-'));
  const store=new Store(path.join(dir,'data','sofia.sqlite'));
  t.after(()=>{try{store.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});
  assert.equal(store.settings().routingEnabled,false);
  assert.equal(store.settings().privateConfirmed,false);
  createRuntime(config(dir,PRIVATE_KEY),{store,secureDir:path.join(dir,'secure'),providerFactory:()=>({})});
  const settings=store.settings();
  assert.equal(settings.routingEnabled,true);
  assert.equal(settings.privateConfirmed,true);
});

test('server does not invent a private configuration when the private key is absent',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-filter-no-key-'));
  const store=new Store(path.join(dir,'data','sofia.sqlite'));
  t.after(()=>{try{store.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});
  createRuntime(config(dir,''),{store,secureDir:path.join(dir,'secure'),providerFactory:()=>({})});
  const settings=store.settings();
  assert.equal(settings.privateConfirmed,false);
});
