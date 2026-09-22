'use strict';
const path=require('node:path');const {Store}=require('../memory/store');
const {KeyStore,BackupService}=require('../services/backup');const {SofiaCore}=require('./sofia-core');const {createHandler}=require('./http-handler');const {seed}=require('./seed');const {seed45}=require('./seed45');
const {Workspace}=require('./workspace');const {UsageService}=require('../services/usage');const {AudioService}=require('../services/audio');const {seed46}=require('./seed46');const {seed47}=require('./seed47');const {seed48}=require('./seed48');const {seed52}=require('./seed52');const {seed58}=require('./seed58');const {seed59}=require('./seed59');const {seed61}=require('./seed61');const {RoutingService}=require('../services/routing');const {VaultService}=require('../services/vault');const {Scheduler}=require('../services/scheduler');
function createRuntime(config,options={}){
 const store=options.store||new Store(path.join(config.dataDir,'sofia.sqlite'));seed(store);const workspace=new Workspace(store);seed45(store,workspace);seed46(store,workspace);seed47(store,workspace);seed48(store,workspace);seed52(store,workspace);seed58(store,workspace);seed59(store,workspace);seed61(store,workspace);
 const current=store.settings();
 // Migração personalizada da instalação local: a chave OPENAI_API_KEY existente era a chave do projeto compartilhado/cortesia já usada antes da v44.
 // Isso elimina a tela de primeiro uso sem inventar uma chave privada. Mensagens privadas continuam bloqueadas até o projeto privado ser configurado.
 if(config.apiKey&&!config.privateApiKey&&!config.sharedApiKey&&!current.routingEnabled&&current.legacyRoute==='none')store.updateSettings({routingEnabled:true,privacyMode:'auto',legacyRoute:'shared',sharedConfirmed:true,sharedBillingAcknowledged:true});
 const vault=new VaultService(store,{secureDir:options.secureDir});const routing=new RoutingService(store,config,options.providerFactory||(options.provider?()=>options.provider:undefined));
 const backups=new BackupService(store,config.backupDir,new KeyStore(options.secureDir));backups.vault=vault;
 const usageService=options.usageService||new UsageService(store,config,routing,options.fetchImpl||global.fetch);const audioService=options.audioService||new AudioService(config,options.fetchImpl||global.fetch);const core=new SofiaCore({store,config,workspace,routing,usageService});const scheduler=new Scheduler(workspace,options.schedulerOptions);
 const runtime={store,backups,core,config,workspace,routing,usageService,audioService,vault,scheduler};runtime.handler=createHandler(runtime);return runtime;
}
module.exports={createRuntime};
