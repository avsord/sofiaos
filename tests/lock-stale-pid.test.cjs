'use strict';
// Causa real do loop infinito de "Crashed" na Railway, confirmada no log do
// dono: "Já há um processo associado à Sofia." Dentro de um contêiner, cada
// reinício começa a numeração de PID do zero, então o processo novo quase
// sempre recebe o MESMO pid baixo que o processo anterior (morto) tinha — a
// trava achava que esse pid "existe" e nunca soltava sozinha, em loop pra
// sempre a cada reinício do Railway.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {acquireLock}=require('../src/core/lock');

function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'lock-stale-'));t.after(()=>(()=>{try{fs.rmSync(d,{recursive:true,force:true,maxRetries:10,retryDelay:200});}catch{}})());return d;}
function writeLock(d,data){fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'server.lock'),JSON.stringify(data),{mode:0o600});}

test('trava antiga com o MESMO pid do processo atual (reinício de contêiner) e idade alta: não bloqueia mais',t=>{
 const d=dir(t);
 // process.pid "existe" por definição (sou eu mesmo) — exatamente a armadilha do bug.
 writeLock(d,{pid:process.pid,token:'velho',started_at:new Date(Date.now()-10*60000).toISOString()});
 const release=acquireLock(d); // não deve lançar ALREADY_RUNNING
 assert.equal(JSON.parse(fs.readFileSync(path.join(d,'server.lock'),'utf8')).pid,process.pid);
 release();
});

test('disputa de verdade entre dois processos continua bloqueada (trava fresca, dentro da janela)',t=>{
 const d=dir(t);
 const release=acquireLock(d);
 assert.throws(()=>acquireLock(d),e=>e.code==='ALREADY_RUNNING');
 release();
});

test('trava fresca com pid que claramente não existe mais: solta normalmente (comportamento de sempre)',t=>{
 const d=dir(t);
 writeLock(d,{pid:999999,token:'morto',started_at:new Date().toISOString()});
 const release=acquireLock(d);release();
});

test('trava sem started_at (formato antigo) não trava o servidor para sempre',t=>{
 const d=dir(t);
 writeLock(d,{pid:process.pid,token:'sem-data'});
 const release=acquireLock(d);release();
});
