'use strict';
const fs=require('node:fs');const path=require('node:path');const readline=require('node:readline/promises');const {spawnSync}=require('node:child_process');
const {Store}=require('../src/memory/store');const {KeyStore,BackupService,openBackup}=require('../src/services/backup');const {acquireLock}=require('../src/core/lock');const {AppError,id}=require('../src/core/util');
function restore(root,bytes,passphrase,options={}) {
  const {VaultService}=require('../src/services/vault');
  const dataDir=path.join(root,'data'),file=path.join(dataDir,'sofia.sqlite'),tmp=path.join(dataDir,'restore-'+id()+'.sqlite');
  const release=acquireLock(dataDir);let current,candidate,newVault;let previousKeyFile,previousKeyBytes,keyChanged=false,swapped=false;
  const old=file+'.restore-previous';
  try {
    const envelope=JSON.parse(bytes.toString('utf8'));const keys=new KeyStore(options.secureDir);
    const snapshot=openBackup(bytes,{passphrase,key:envelope.mode==='local-user'?keys.get():undefined});
    candidate=new Store(tmp,{recover:false});candidate.importSnapshot(snapshot);candidate.updateSettings({privacyMode:'local',routingEnabled:false});
    if(candidate.db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new AppError('BAD_BACKUP','A integridade do banco restaurado falhou.');
    const initialized=candidate.db.prepare("SELECT value FROM vault_state WHERE key='initialized'").get()?.value==='true';
    if(initialized){
      if(typeof snapshot.vault_key!=='string'||Buffer.from(snapshot.vault_key,'base64').length!==32)throw new AppError('VAULT_KEY','O backup não contém a chave do cofre. A restauração não foi aplicada.');
      // Verify ciphertext using the candidate key without replacing the user's existing key yet.
      newVault=new VaultService(candidate,{secureDir:options.secureDir});newVault.master=Buffer.from(snapshot.vault_key,'base64');
      newVault.decrypt(newVault.state('secret'),'totp');
      for(const e of candidate.db.prepare('SELECT * FROM vault_entries').all())newVault.decrypt(e,e.id);
    }
    const stats=candidate.stats();candidate.close();candidate=null;
    if(fs.existsSync(file)){
      current=new Store(file,{recover:false});const previous=new BackupService(current,path.join(root,'backups'),keys);
      previous.vault=new VaultService(current,{secureDir:options.secureDir});previous.create('before-restore');current.close();current=null;
    }
    if(fs.existsSync(old))throw new AppError('RESTORE_PENDING','Existe uma recuperação anterior pendente. Nada foi sobrescrito.');
    if(newVault){previousKeyFile=newVault.file();previousKeyBytes=fs.existsSync(previousKeyFile)?fs.readFileSync(previousKeyFile):null;newVault.importKey(Buffer.from(snapshot.vault_key,'base64'));keyChanged=true;}
    if(fs.existsSync(file))fs.renameSync(file,old);
    try{fs.renameSync(tmp,file);swapped=true;}catch(e){if(fs.existsSync(old))fs.renameSync(old,file);throw e;}
    for(const suffix of ['-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);
    if(fs.existsSync(old))fs.unlinkSync(old);
    return stats;
  }catch(e){if(keyChanged&&!swapped){if(previousKeyBytes)fs.writeFileSync(previousKeyFile,previousKeyBytes,{mode:0o600});else fs.rmSync(previousKeyFile,{force:true});}throw e;
  }finally{try{candidate?.close();current?.close();}catch{}for(const f of [tmp,tmp+'-wal',tmp+'-shm'])try{fs.unlinkSync(f);}catch{}release();}
}
function secretPrompt() {
  return new Promise((resolve,reject)=>{
    const input=process.stdin,output=process.stdout;
    if(!input.isTTY || typeof input.setRawMode!=='function')return reject(new AppError('NO_TTY','Abra RESTAURAR_MEMORIA.cmd em um terminal interativo.'));
    const previous=Boolean(input.isRaw);let value='',finished=false;
    const finish=(error)=>{if(finished)return;finished=true;input.removeListener('data',onData);input.removeListener('error',onError);input.removeListener('end',onEnd);input.setRawMode(previous);input.pause();output.write('\n');error?reject(error):resolve(value);value='';};
    const onError=()=>finish(new AppError('NO_INPUT','A leitura foi interrompida.'));
    const onEnd=()=>finish(new AppError('NO_INPUT','Entrada encerrada.'));
    const onData=buffer=>{const text=buffer.toString('utf8');if(text.startsWith('\x1b'))return;for(const char of text){if(finished)return;if(char==='\x03')return finish(new AppError('CANCELLED','Recuperação cancelada.'));if(char==='\r'||char==='\n')return finish();if(char==='\x7f'||char==='\b'){if(value){value=Array.from(value).slice(0,-1).join('');output.write('\b \b');}}else if(char>=' '&&value.length<512){value+=char;output.write('*');}}};
    output.write('Senha do backup (oculta): ');input.setRawMode(true);input.on('data',onData);input.once('error',onError);input.once('end',onEnd);input.resume();
  });
}
async function main(){const rl=readline.createInterface({input:process.stdin,output:process.stdout});let password;
  try{console.log('RESTAURO DA MEMORIA — pare a Sofia antes. O estado atual sera protegido por backup.');const name=(await rl.question('Caminho completo do arquivo .sofia-backup: ')).trim().replace(/^"|"$/g,'');if(!fs.existsSync(name))throw new AppError('MISSING','Arquivo nao encontrado.');const bytes=fs.readFileSync(name),e=JSON.parse(bytes.toString('utf8'));const confirm=await rl.question('Restaurar a memoria deste backup? Digite RESTAURAR: ');if(confirm!=='RESTAURAR')return console.log('Cancelado.');rl.close();
    if(e.mode==='password')password=await secretPrompt();
    const stats=restore(path.resolve(__dirname,'..'),bytes,password);console.log('Restauro concluido e validado.',stats);
  }finally{password=undefined;rl.close();}}
module.exports={restore};if(require.main===module)main().catch(e=>{console.error(e instanceof AppError?e.message:'Restauro nao concluido. Nenhuma credencial foi exibida.');process.exitCode=1;});
