'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {AppError,id}=require('./util');
function acquireLock(directory) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'server.lock');const token=id();
  if(fs.existsSync(file)) {
    let old;try{old=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new AppError('LOCK_INVALID','Existe uma trava local ilegível. Não a removi automaticamente.',409);}
    let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    // Dentro de um contêiner, cada reinício começa a numeração de processos do
    // zero — o processo novo quase sempre recebe o mesmo PID baixo (1, 7...)
    // que o processo anterior tinha. "O PID existe" então não prova nada: é
    // quase sempre o PRÓPRIO processo novo se confundindo com o antigo, e a
    // trava nunca mais solta sozinha. Uma trava com mais de 2 minutos é tratada
    // como abandonada de qualquer forma; local, numa disputa de verdade entre
    // dois processos de uma pessoa, a segunda tentativa sempre acontece em
    // segundos, bem dentro desse prazo.
    const ageMs=Date.now()-Date.parse(old.started_at||0);
    const stale=!Number.isFinite(ageMs)||ageMs>120000;
    if(alive&&!stale)throw new AppError('ALREADY_RUNNING','Já há um processo associado à Sofia. Pare o servidor anterior com Ctrl+C.',409);
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file,JSON.stringify({pid:process.pid,token,started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  return ()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}catch{}};
}
module.exports={acquireLock};
