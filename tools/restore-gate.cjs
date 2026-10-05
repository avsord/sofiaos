'use strict';
// One-time authenticated restore into an empty persistent volume. No private data in source.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {verify}=require('./verify-snapshot.cjs');
const {DatabaseSync}=require('node:sqlite');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function authorized(header,token){const a=Buffer.from(header||''),b=Buffer.from('Bearer '+token);return !!token&&a.length===b.length&&crypto.timingSafeEqual(a,b);}
function restore(base,bytes,expected){
 if(!/^[a-f0-9]{64}$/.test(expected||'')||digest(bytes)!==expected)throw Error('Archive checksum mismatch');
 fs.mkdirSync(base,{recursive:true,mode:0o700});
 if(fs.existsSync(path.join(base,'data'))||fs.existsSync(path.join(base,'secure')))throw Error('Persistent data already exists; refusing overwrite');
 const stage=fs.mkdtempSync(path.join(base,'.restore-')),archive=path.join(stage,'backup.tar.gz'),unpacked=path.join(stage,'unpacked');
 try{
  fs.writeFileSync(archive,bytes,{mode:0o600});fs.mkdirSync(unpacked,{mode:0o700});
  const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:1024*1024}).split('\n').filter(Boolean);
  if(names.some(n=>path.isAbsolute(n)||n.split('/').includes('..')))throw Error('Unsafe archive path');
  execFileSync('tar',['-xzf',archive,'-C',unpacked,'--no-same-owner']);
  function check(p){for(const entry of fs.readdirSync(p,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Symbolic link in backup');if(entry.isDirectory())check(path.join(p,entry.name));else if(!entry.isFile())throw Error('Unsupported backup entry');}}
  check(unpacked);const result=verify(unpacked),manifest=JSON.parse(fs.readFileSync(path.join(unpacked,'manifest.json'),'utf8'));
  if(!manifest.databases.some(x=>x.file==='data/sofia.sqlite'))throw Error('Main database missing');
  const data=path.join(unpacked,'data'),secure=path.join(unpacked,'secure');
  if(!fs.existsSync(path.join(secure,'backup-master-v1.key')))throw Error('Backup key missing');
  fs.renameSync(data,path.join(base,'data'));fs.renameSync(secure,path.join(base,'secure'));
  const marker={archive_sha256:expected,verified:true,files:result.files,databases:result.databases,restored_at:new Date().toISOString(),tables:manifest.databases.find(x=>x.file==='data/sofia.sqlite').tables};
  fs.writeFileSync(path.join(base,'restore-complete.json'),JSON.stringify(marker),{mode:0o600,flag:'wx'});
  return {verified:true,files:result.files,databases:result.databases,archive_sha256:expected};
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
function existing(base){
 const marker=path.join(base,'restore-complete.json'),dbpath=path.join(base,'data','sofia.sqlite');
 if(!fs.existsSync(marker))return false;
 if(!JSON.parse(fs.readFileSync(marker,'utf8')).verified||!fs.existsSync(dbpath)||!fs.existsSync(path.join(base,'secure','backup-master-v1.key')))throw Error('Persistent restore incomplete');
 const db=new DatabaseSync(dbpath,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').all().some(r=>Object.values(r)[0]!=='ok'))throw Error('Persistent database integrity failed');}finally{db.close();}return true;
}
async function run(options={}){
 const base=options.base||process.env.SOFIA_PERSISTENT_DIR;
 if(!base||!path.isAbsolute(base))throw Error('Persistent volume path required');
 const start=options.start||(()=>require('../src/server').startServer({root:path.resolve(__dirname,'..'),runtimeOptions:{secureDir:path.join(base,'secure')}}));
 if(existing(base))return start();
 const token=options.token||process.env.SOFIA_RESTORE_TOKEN,expected=options.expected||process.env.SOFIA_RESTORE_SHA256;
 if(!token||token.length<40||!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Restore authorization required');
 let busy=false;
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const server=http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:false,phase:'restore',ready:false});
  if(req.method!=='POST'||req.url!=='/internal/restore-once')return send(res,503,{error:'Restauracao dos dados em andamento.'});
  if(!authorized(req.headers.authorization,token))return send(res,401,{error:'Unauthorized'});
  if(busy)return send(res,409,{error:'Restore already running'});
  busy=true;let size=0;const chunks=[];
  req.on('data',chunk=>{size+=chunk.length;if(size>100*1024*1024){req.destroy();busy=false;}else chunks.push(chunk);});
  req.on('error',()=>{busy=false;});
  req.on('end',()=>{
   try{const result=restore(base,Buffer.concat(chunks),expected);res.once('finish',()=>server.close(()=>{delete process.env.SOFIA_RESTORE_TOKEN;start().catch(()=>{console.error('[Sofia] Restored data preserved; application startup failed.');process.exitCode=1;});}));send(res,200,result);}
   catch{busy=false;send(res,422,{error:'Restore verification failed. Application not started.'});}
  });
 });server.requestTimeout=120000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??Number(process.env.PORT||8080),'0.0.0.0',resolve);});
 console.log('[Sofia] Empty persistent volume: authenticated restore required before application starts.');return server;
}
if(require.main===module)run().catch(()=>{console.error('[Sofia] Persistent startup verification failed. Data not overwritten.');process.exitCode=1;});
module.exports={restore,existing,authorized,run};
