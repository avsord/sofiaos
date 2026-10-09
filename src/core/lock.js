'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {AppError,id}=require('./util');
function acquireLock(directory) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'server.lock');const token=id();
  if(fs.existsSync(file)) {
    let old;try{old=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new AppError('LOCK_INVALID','Existe uma trava local ilegível. Não a removi automaticamente.',409);}
    let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)throw new AppError('ALREADY_RUNNING','Já há um processo associado à Sofia. Pare o servidor anterior com Ctrl+C.',409);
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file,JSON.stringify({pid:process.pid,token,started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  return ()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}catch{}};
}
module.exports={acquireLock};
