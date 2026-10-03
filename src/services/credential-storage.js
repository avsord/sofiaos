'use strict';
const fs=require('node:fs'),path=require('node:path');
const {AppError,atomicWrite}=require('../core/util');
const FIELDS={private:'OPENAI_PRIVATE_API_KEY',shared:'OPENAI_SHARED_API_KEY',admin:'OPENAI_ADMIN_KEY'};
const PROPS={private:'privateApiKey',shared:'sharedApiKey',admin:'adminApiKey'};
const validKey=value=>typeof value==='string'&&/^sk-[A-Za-z0-9_-]{16,}$/.test(value);
const isRailway=config=>config.railwayDeployment===true||Boolean(process.env.RAILWAY_ENVIRONMENT||process.env.RAILWAY_SERVICE_ID||process.env.RAILWAY_PROJECT_ID);
const fileFor=config=>path.join(config.dataDir||path.join(config.root,'data'),'runtime-credentials.env');
function within(parent,child){const r=path.relative(parent,child);return r===''||(!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep));}
function storageError(){return new AppError('PERSISTENCE_UNAVAILABLE','O armazenamento persistente do servidor ainda não foi confirmado. A chave não foi salva. O responsável precisa conferir o volume do Railway e o diretório de dados antes de atualizar o servidor.',409);}
function writableCredentialFile(config){
  const file=fileFor(config),dir=path.dirname(file);
  if(isRailway(config)){
    const mount=config.railwayVolumeMountPath||process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if(!mount||!path.isAbsolute(mount)||!within(path.resolve(mount),path.resolve(dir)))throw storageError();
    // Do not create a fake mount point or follow a data-directory symlink outside the volume.
    let realMount;try{realMount=fs.realpathSync(mount);}catch{throw storageError();}
    let ancestor=dir;while(!fs.existsSync(ancestor)){const up=path.dirname(ancestor);if(up===ancestor)throw storageError();ancestor=up;}
    if(!within(realMount,fs.realpathSync(ancestor)))throw storageError();
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    if(!within(realMount,fs.realpathSync(dir)))throw storageError();
  }
  return file;
}
function readValues(file){
  if(!fs.existsSync(file))return {};
  if(fs.statSync(file).size>1024*1024)throw new AppError('BAD_ENV','Arquivo de configuração inesperado.');
  const found={};
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    if(!line.trim()||line.trim().startsWith('#'))continue;
    const m=/^\s*(OPENAI_PRIVATE_API_KEY|OPENAI_SHARED_API_KEY|OPENAI_ADMIN_KEY)\s*=\s*(\S+)\s*$/.exec(line);
    if(!m||!validKey(m[2])||found[m[1]])throw new AppError('CREDENTIAL_FILE_INVALID','O arquivo de credenciais precisa de recuperação. Nada foi apagado ou substituído.',409);
    found[m[1]]=m[2];
  }
  return found;
}
function loadPersistedCredentials(config){
  const found=readValues(fileFor(config));
  // The last credential saved by the authenticated owner is authoritative.
  // An older deployment/bootstrap key must not silently undo a rotation made in the web UI.
  for(const route of Object.keys(FIELDS))if(found[FIELDS[route]])config[PROPS[route]]=found[FIELDS[route]];
  return {private:Boolean(config.privateApiKey),shared:Boolean(config.sharedApiKey),admin:Boolean(config.adminApiKey)};
}
function persistCredential(config,route,key){
  if(!FIELDS[route]||!validKey(key))throw new AppError('BAD_KEY','Credencial inválida. Nada foi salvo.');
  const file=writableCredentialFile(config),found=readValues(file);
  found[FIELDS[route]]=key;
  const bytes=Buffer.from(Object.entries(found).map(([name,value])=>name+'='+value).join('\n')+'\n');
  // One authoritative, atomic, fsynced file. Never write secrets into the deploy's .env.
  atomicWrite(file,bytes);
  const saved=readValues(file);if(saved[FIELDS[route]]!==key)throw new AppError('CREDENTIAL_SAVE_FAILED','Não foi possível confirmar o salvamento da credencial.',500);
  config[PROPS[route]]=key;
  return {persistence:isRailway(config)?'volume':'local'};
}
module.exports={loadPersistedCredentials,persistCredential,writableCredentialFile};
