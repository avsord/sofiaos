'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {saveCredential,saveCredentialValidated,loadPersistedCredentials}=require('../src/services/credentials');
const key=label=>'sk-'+('TEST_ONLY_NOT_REAL_'+label).repeat(3);
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-durability-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const mount=path.join(dir,'volume');fs.mkdirSync(mount);const root=path.join(dir,'deploy-a');fs.mkdirSync(root);return {dir,mount,root,config:{root,dataDir:path.join(mount,'data'),railwayDeployment:true,railwayVolumeMountPath:mount,privateApiKey:'',sharedApiKey:'',adminApiKey:''}};}
test('credential survives deletion of deploy directory and loads in the next release',t=>{
 const f=fixture(t);saveCredential(f.config,'private',key('private'));saveCredential(f.config,'shared',key('shared'));
 assert.equal(fs.existsSync(path.join(f.root,'.env')),false);
 fs.rmSync(f.root,{recursive:true,force:true});const next={...f.config,root:path.join(f.dir,'deploy-b'),privateApiKey:'',sharedApiKey:''};
 loadPersistedCredentials(next);assert.equal(next.privateApiKey,key('private'));assert.equal(next.sharedApiKey,key('shared'));
 assert.equal(fs.statSync(path.join(f.config.dataDir,'runtime-credentials.env')).mode&0o777,0o600);
});
test('a cloud save without a mount cannot report success or modify active credentials',t=>{
 const f=fixture(t);f.config.railwayVolumeMountPath='';const old=process.env.RAILWAY_VOLUME_MOUNT_PATH;delete process.env.RAILWAY_VOLUME_MOUNT_PATH;t.after(()=>{if(old!==undefined)process.env.RAILWAY_VOLUME_MOUNT_PATH=old;});
 assert.throws(()=>saveCredential(f.config,'private',key('new')),e=>e.code==='PERSISTENCE_UNAVAILABLE');assert.equal(f.config.privateApiKey,'');assert.equal(fs.existsSync(f.config.dataDir),false);
});
test('data outside the volume is rejected, including a sibling with a shared prefix',t=>{
 const f=fixture(t);f.config.dataDir=f.mount+'-ephemeral';assert.throws(()=>saveCredential(f.config,'private',key('new')),e=>e.code==='PERSISTENCE_UNAVAILABLE');
});
test('a symlink outside the volume is rejected',t=>{
 const f=fixture(t);fs.symlinkSync(f.root,f.config.dataDir,'dir');assert.throws(()=>saveCredential(f.config,'private',key('new')),e=>e.code==='PERSISTENCE_UNAVAILABLE');assert.equal(fs.existsSync(path.join(f.root,'runtime-credentials.env')),false);
});
test('web credential rotation is not undone by an old bootstrap key on restart',t=>{
 const f=fixture(t);saveCredential(f.config,'private',key('old'));saveCredential(f.config,'private',key('rotated'));
 const next={...f.config,privateApiKey:key('old')};loadPersistedCredentials(next);assert.equal(next.privateApiKey,key('rotated'));
});
test('no stored credential leaves environment configuration unchanged and does not use shared as private',t=>{
 const f=fixture(t);f.config.sharedApiKey=key('shared');loadPersistedCredentials(f.config);assert.equal(f.config.privateApiKey,'');assert.equal(f.config.sharedApiKey,key('shared'));
});
test('corrupt storage is preserved and never replaced with an empty configuration',t=>{
 const f=fixture(t);fs.mkdirSync(f.config.dataDir);const file=path.join(f.config.dataDir,'runtime-credentials.env');fs.writeFileSync(file,'corrupt-config');
 assert.throws(()=>loadPersistedCredentials(f.config),e=>e.code==='CREDENTIAL_FILE_INVALID');assert.throws(()=>saveCredential(f.config,'private',key('new')),e=>e.code==='CREDENTIAL_FILE_INVALID');assert.equal(fs.readFileSync(file,'utf8'),'corrupt-config');
});
test('missing durable storage fails before any provider validation request',async t=>{
 const f=fixture(t);f.config.dataDir=f.root;let calls=0;
 await assert.rejects(saveCredentialValidated(f.config,'private',key('new'),async()=>{calls++;return {ok:true,status:200};}),e=>e.code==='PERSISTENCE_UNAVAILABLE');assert.equal(calls,0);
});
