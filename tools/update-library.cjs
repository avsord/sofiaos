'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const net=require('node:net');const crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const IGNORE=['/.env','/.env.*','/..env*','**/node_modules/','/.git/','/data/','/backups/','/exports/','/logs/','*.pem','*.key','*.pfx','*.p12','/tools/cloudflared/'];
function safe(root,rel){if(typeof rel!=='string'||rel.startsWith('/')||rel.includes('\\')||rel.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Caminho invalido no pacote.');const resolved=path.resolve(root,rel);if(!resolved.startsWith(path.resolve(root)+path.sep))throw new Error('Caminho fora do projeto.');let current=path.resolve(root);for(const part of rel.split('/')){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Atalho simbolico detectado. Nenhum arquivo foi alterado.');if(current!==resolved&&fs.existsSync(current)&&!fs.statSync(current).isDirectory())throw new Error('Uma pasta esperada e um arquivo: '+current+'. Nenhum arquivo foi alterado.');}return resolved;}
function portInUse(port,host='127.0.0.1'){return new Promise((resolve,reject)=>{const s=net.connect({port,host});s.once('connect',()=>{s.destroy();resolve(true);});s.setTimeout(2000,()=>{s.destroy();reject(new Error('Nao foi possivel conferir a porta local.'));});s.once('error',e=>{if(['ECONNREFUSED','EADDRNOTAVAIL','ENETUNREACH'].includes(e.code))resolve(false);else reject(new Error('Falha ao conferir a porta local.'));});});}
function plan(release,target){
  if(!fs.existsSync(path.join(target,'src','server.js'))||!fs.existsSync(path.join(target,'package.json')))throw new Error('SOFIA-OS nao encontrada nesse caminho. Nenhum arquivo foi alterado.');
  const version=process.versions.node.split('.').map(Number);if(version[0]<22||(version[0]===22&&version[1]<16))throw new Error('Use o Node 22.16 ou superior. O Node 24 instalado no projeto e compativel.');
  require('node:sqlite');
  const manifest=JSON.parse(fs.readFileSync(path.join(release,'MANIFESTO_V45.json'),'utf8'));
  if(manifest.version!==45||!Array.isArray(manifest.files))throw new Error('Manifesto invalido.');
  const changes=[];
  for(const file of manifest.files){if(file.path.startsWith('.')||/^(?:data|backups|node_modules|exports)\//.test(file.path)||/\.env/i.test(file.path))throw new Error('O pacote tentou incluir um arquivo protegido.');const source=safe(path.join(release,'projeto'),file.path),destination=safe(target,file.path);const bytes=fs.readFileSync(source);if(sha(bytes)!==file.sha256)throw new Error('O arquivo '+file.path+' nao passou na verificacao de integridade.');let before=null;
    if(fs.existsSync(destination)){before=fs.readFileSync(destination);if(sha(before)===file.sha256)continue;if(!file.before_sha256 || sha(before)!==file.before_sha256)throw new Error('O arquivo '+file.path+' mudou depois do ZIP enviado. Parei para nao apagar essa alteracao.');}
    changes.push({path:file.path,source,destination,before,afterHash:file.sha256});
  }
  const ignoreFile=safe(target,'.gitignore'),old=fs.existsSync(ignoreFile)?fs.readFileSync(ignoreFile,'utf8'):null;
  let ignore=old||'';const missing=IGNORE.filter(x=>!ignore.split(/\r?\n/).includes(x));
  if(missing.length){ignore+=(ignore&&!ignore.endsWith('\n')?'\n':'')+'\n# Sofia Core v45 — dados e credenciais locais\n'+missing.join('\n')+'\n';changes.push({path:'.gitignore',destination:ignoreFile,before:old===null?null:Buffer.from(old),bytes:Buffer.from(ignore),afterHash:sha(Buffer.from(ignore))});}
  return changes;
}
function apply(release,target,options={}){
  const changes=plan(release,target);if(!changes.length)return {already:true};
  const backupRoot=options.backupRoot||path.join(path.dirname(target),'Sofia_OS_backups_codigo');fs.mkdirSync(backupRoot,{recursive:true});const folder=path.join(backupRoot,'antes-v45-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8));fs.mkdirSync(folder);
  const receipt={version:45,target:path.resolve(target),created_at:new Date().toISOString(),files:[]};
  // All backups are written and verified before changing any project file.
  for(const c of changes){if(c.before!==null){const p=safe(folder,c.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c.before,{flag:'wx'});if(sha(fs.readFileSync(p))!==sha(c.before))throw new Error('Falha ao verificar backup. Projeto inalterado.');}receipt.files.push({path:c.path,existed:c.before!==null,before_sha256:c.before!==null?sha(c.before):null,after_sha256:c.afterHash});}
  fs.writeFileSync(path.join(folder,'RESTORE_RECEIPT.json'),JSON.stringify(receipt,null,2));
  const completed=[];
  try{for(const c of changes){const bytes=c.bytes||fs.readFileSync(c.source);fs.mkdirSync(path.dirname(c.destination),{recursive:true});const tmp=c.destination+'.v45-'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,bytes,{flag:'wx'});fs.renameSync(tmp,c.destination);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}completed.push(c);if(sha(fs.readFileSync(c.destination))!==c.afterHash)throw new Error('Falha ao conferir um arquivo instalado.');if(options.afterWrite)options.afterWrite(c.path);}}
  catch(error){for(const c of completed.reverse()){if(c.before===null)fs.unlinkSync(c.destination);else fs.writeFileSync(c.destination,c.before);}throw new Error('Instalacao interrompida; arquivos alterados foram revertidos. Motivo: '+error.message+'. Backup: '+folder,{cause:error});}
  return {already:false,files:changes.length,backup:folder};
}
function rollback(folder,target){
 const receipt=JSON.parse(fs.readFileSync(path.join(folder,'RESTORE_RECEIPT.json'),'utf8'));
 if(receipt.version!==45||path.resolve(target)!==receipt.target)throw new Error('Backup de codigo pertence a outra pasta.');
 const live=receipt.files.map(f=>{const dest=safe(target,f.path);if(!fs.existsSync(dest)||sha(fs.readFileSync(dest))!==f.after_sha256)throw new Error('Arquivo alterado depois da instalacao: '+f.path+'. Nenhuma reversao foi feita.');if(f.existed&&sha(fs.readFileSync(safe(folder,f.path)))!==f.before_sha256)throw new Error('Backup de codigo danificado.');return {...f,dest,bytes:fs.readFileSync(dest)};});
 const dbfile=path.join(target,'data','sofia.sqlite');let archive=null,baseline=null;
 if(fs.existsSync(dbfile)){
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(dbfile);let version;
  try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');version=db.prepare('PRAGMA user_version').get().user_version;}finally{db.close();}
  if(version===2){
    const old=dbfile+'.before-v45';if(!fs.existsSync(old))throw new Error('Banco v45 sem copia anterior v44. Reversao automatica recusada para nao perder dados. Mantenha a v45 e use RESTAURAR_MEMORIA com backup adequado.');
    const check=new DatabaseSync(old,{readOnly:true});try{if(check.prepare('PRAGMA user_version').get().user_version!==1||check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Copia do banco v44 invalida. Nada foi revertido.');}finally{check.close();}
    const dir=path.join(folder,'DADOS_V45_PRESERVADOS_'+Date.now());fs.mkdirSync(dir,{mode:0o700});archive=path.join(dir,'sofia.sqlite');fs.copyFileSync(dbfile,archive);fs.chmodSync(archive,0o600);
    if(sha(fs.readFileSync(archive))!==sha(fs.readFileSync(dbfile)))throw new Error('Falha ao preservar banco atual.');baseline=old;
  }else if(version!==1)throw new Error('Versao de banco desconhecida. Nenhuma reversao foi feita.');
 }
 const changed=[];let databaseChanged=false;
 try{
   for(const f of [...live].reverse()){if(f.existed)fs.copyFileSync(safe(folder,f.path),f.dest);else fs.unlinkSync(f.dest);changed.push(f);}
   if(baseline){fs.copyFileSync(baseline,dbfile);databaseChanged=true;for(const ext of ['-wal','-shm'])fs.rmSync(dbfile+ext,{force:true});}
 }catch(e){for(const f of changed)fs.writeFileSync(f.dest,f.bytes);if(databaseChanged&&archive)fs.copyFileSync(archive,dbfile);throw new Error('Reversao interrompida; a versao atual foi reposta. Motivo: '+e.message);}
 if(archive)console.log('Dados novos da v45 preservados em:',archive,'. A v44 abre o retrato anterior; os dados novos nao foram mesclados nela.');
 return receipt.files.length;
}
async function main(){const release=path.resolve(__dirname,'..'),target=path.resolve(process.argv[2]||path.join(os.homedir(),'SOFIA-OS'));console.log('SOFIA OS | ATUALIZACAO V45');console.log('Destino:',target);let port=3000;
  const env=path.join(target,'.env');if(fs.existsSync(env)){const m=fs.readFileSync(env,'utf8').match(/^\s*PORT\s*=\s*["']?(\d+)/m);if(m)port=Number(m[1]);}
  if(await portInUse(port))throw new Error('A porta '+port+' esta em uso. Pare a Sofia com Ctrl+C antes de atualizar. Nenhum processo foi encerrado.');
  const lock=path.join(target,'data','server.lock');if(fs.existsSync(lock)){let alive=true;const l=JSON.parse(fs.readFileSync(lock,'utf8'));try{process.kill(l.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw new Error('A memoria esta em uso por outro processo. Pare a Sofia antes de atualizar.');}
  const result=apply(release,target);if(result.already)console.log('Esta versao ja esta instalada.');else{console.log('ATUALIZACAO CONCLUIDA:',result.files,'arquivos.');console.log('Backup de codigo:',result.backup);}
  console.log('Sua .env, chave, dados, webhook e tunel foram preservados.');console.log('Agora abra INICIAR_SOFIA.cmd dentro da pasta SOFIA-OS.');
}
module.exports={safe,plan,apply,rollback,portInUse};if(require.main===module)main().catch(e=>{console.error('ERRO:',e.message);process.exitCode=1;});
