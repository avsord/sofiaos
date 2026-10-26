'use strict';
// 0.3.243: a Meta continua aparecendo depois de o Android congelar/matar o app logo depois de abrir.
// Usa o codigo REAL do pacote de abertura (StartupSnapshot) com um armazenamento em memoria.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const load=require('./load-ts.cjs');
const flu={newFluency:()=>true,queueOptional:(n,fn)=>{Promise.resolve().then(fn);return()=>{};}};
const S=load('src/lib/startup-snapshot.ts',{'./fluency':flu,'./fluency-metrics':{perfSync:(n,f)=>f(),perfEvent:()=>{},perfNow:()=>0,measureVolume:()=>{}},'./chat-window':{recentChatPage:x=>x}},{setTimeout,clearTimeout,Date,JSON,Math});
const GW=load('src/lib/goal-widget.ts',{react:require('react'),'./startup-snapshot':{GOAL_WIDGET_PATH:S.GOAL_WIDGET_PATH}});
const G={name:'Dinheiro guardado',saved:19000,target:30000,monthly:900,deadline:'',today:'2026-10-26'};
const month=new Date().toISOString().slice(0,7);
async function session(storage,{persist}){
  const s=new S.StartupSnapshot(storage,'u');await s.hydrateLaunch();
  s.remember('/tasks',{items:[]});s.remember('/agenda?month='+month,{items:[]});
  const api={cached:p=>s.peek(p),rememberLocal:(p,v)=>s.remember(p,v),...(persist?{persistLaunchProjection:()=>s.persistLaunchNow()}:{})};
  return {s,api};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('app morto logo depois de calcular a Meta (sem gravacao ao sair): na abertura seguinte a Meta JA esta no primeiro quadro',async()=>{
  const disk=new Map(),storage={read:async k=>disk.get(k)??null,write:async(k,v)=>{disk.set(k,v);},remove:async k=>{disk.delete(k);}};
  // primeira vez que o app abre ja com pacote de abertura (como no celular), sem a Meta
  let {s}=await session(storage,{persist:true});await s.flush();
  // abre, calcula a Meta... e o Android mata o app (nenhum flush ao sair)
  ({s}=await session(storage,{persist:true}));await s.flush();/* gravacao normal da abertura: a proxima comum so em 30 s */GW.writeGoalWidget({cached:p=>s.peek(p),rememberLocal:(p,v)=>s.remember(p,v),persistLaunchProjection:()=>s.persistLaunchNow()},{goal:G});await sleep(20);s.closed=true;clearTimeout(s.lazyTimer);
  // abre de novo
  const s3=new S.StartupSnapshot(storage,'u');await s3.hydrateLaunch();
  const r=GW.readGoalWidget({cached:p=>s3.peek(p),rememberLocal:()=>{}},'2026-10-27');
  assert.equal(r.known,true,'a Meta foi gravada na hora, com o app aberto');assert.equal(r.goal.saved,19000);
});
test('o defeito antigo: SEM a gravacao imediata, o mesmo ciclo perde a Meta (por isso ela sumia e depois aparecia)',async()=>{
  const disk=new Map(),storage={read:async k=>disk.get(k)??null,write:async(k,v)=>{disk.set(k,v);},remove:async k=>{disk.delete(k);}};
  let {s}=await session(storage,{persist:false});await s.flush();
  ({s}=await session(storage,{persist:false}));await s.flush();GW.writeGoalWidget({cached:p=>s.peek(p),rememberLocal:(p,v)=>s.remember(p,v)},{goal:G});await sleep(20);s.closed=true;clearTimeout(s.lazyTimer);
  const s3=new S.StartupSnapshot(storage,'u');await s3.hydrateLaunch();
  assert.equal(GW.readGoalWidget({cached:p=>s3.peek(p),rememberLocal:()=>{}},'2026-10-27').known,false);
});
test('a leitura LOCAL de Financas nunca esconde a Meta; so a resposta do servidor pode dizer "sem meta"',()=>{
  const f=fs.readFileSync(path.join(__dirname,'..','src/screens/Finance.tsx'),'utf8');
  assert.ok(f.includes('if (!next && !fromServer) return;'));
  assert.ok(f.includes('void readCache(api).then(b => show(b, false))')&&f.includes(".then(b => show(b, true))"));
  const a=fs.readFileSync(path.join(__dirname,'..','src/lib/api.ts'),'utf8');assert.ok(a.includes('async persistLaunchProjection(){await this.snapshots.persistLaunchNow();}'));
});
