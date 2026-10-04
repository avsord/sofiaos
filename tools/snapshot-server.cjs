'use strict';
// Run inside the authorized live container. Copies data; never restarts it.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');const {execFileSync}=require('node:child_process');
function snapshot(root,options={}){
 root=path.resolve(root);if(!fs.existsSync(path.join(root,'src/config/runtime.js')))throw Error('Sofia source root not found');
 const config=require(path.join(root,'src/config/runtime.js')).makeConfig({root});
 const secure=options.secureDir||new (require(path.join(root,'src/services/backup.js')).KeyStore)().directory;
 const target=fs.mkdtempSync(path.join(os.tmpdir(),'sofia-full-backup-'));fs.chmodSync(target,0o700);
 const manifest={format:'sofia-full-files-v1',created_at:new Date().toISOString(),source_root:root,data_path:config.dataDir,secure_path:secure,files:[],databases:[],runtime_node:process.version};
 const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 function copy(source,relative){
  const stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('Unexpected symbolic link in data: '+relative);
  const output=path.join(target,relative);
  if(stat.isDirectory()){fs.mkdirSync(output,{recursive:true,mode:0o700});for(const name of fs.readdirSync(source)){if(/(?:-wal|-shm)$/.test(name)||name==='sofia.lock'||name==='server.lock')continue;copy(path.join(source,name),path.join(relative,name));}return;}
  if(!stat.isFile())throw Error('Unsupported data file');fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
  const header=Buffer.alloc(16),fd=fs.openSync(source,'r');try{fs.readSync(fd,header,0,16,0);}finally{fs.closeSync(fd);}
  if(header.toString()==='SQLite format 3\0'){
   const live=new DatabaseSync(source,{readOnly:true});try{live.exec('PRAGMA busy_timeout=15000');live.prepare('VACUUM INTO ?').run(output);}finally{live.close();}
   const restored=new DatabaseSync(output,{readOnly:true});try{
    const integrity=restored.prepare('PRAGMA integrity_check').all();if(integrity.some(x=>Object.values(x)[0]!=='ok'))throw Error('Snapshot integrity check failed');
    const tables=restored.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    const counts=Object.fromEntries(tables.map(t=>[t.name,restored.prepare('SELECT count(*) AS n FROM "'+t.name.replace(/"/g,'""')+'"').get().n]));
    manifest.databases.push({file:relative,integrity:'ok',tables:counts});
   }finally{restored.close();}
  }else{
   const before=digest(source);fs.copyFileSync(source,output);if(before!==digest(source)||before!==digest(output))throw Error('Data changed during snapshot; retry before deploying');
  }
  fs.chmodSync(output,0o600);manifest.files.push({path:relative,size:fs.statSync(output).size,sha256:digest(output)});
 }
 copy(config.dataDir,'data');if(fs.existsSync(secure))copy(secure,'secure');
 if(fs.existsSync(path.join(root,'.env')))copy(path.join(root,'.env'),'runtime.env');
 if(!manifest.databases.some(d=>d.file==='data/sofia.sqlite'))throw Error('Main database absent');
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 const archive=target+'.tar.gz';execFileSync('tar',['-czf',archive,'-C',target,'.']);fs.chmodSync(archive,0o600);
 return {archive,sha256:digest(archive),bytes:fs.statSync(archive).size,database_count:manifest.databases.length,files:manifest.files.length};
}
if(require.main===module)process.stdout.write(JSON.stringify(snapshot(process.argv[2]||process.cwd()))+'\n');
module.exports={snapshot};
