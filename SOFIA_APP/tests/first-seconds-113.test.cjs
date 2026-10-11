// 0.3.113: what the first real-device report of 0.3.112 showed.
//  - 11 full rewrites of the ~4 MB archive in 3 min, each a ~200 ms JS stall.
//  - hidden-tab pre-mount (385/248/247 ms) running in one blocking pass while the user taps.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const load=require('./load-ts.cjs');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');

// ---------- StartupSnapshot ----------
function snapshotRig(){
 const queued=[];let t=1_000_000;const timers=[];
 const fluency={newFluency:()=>true,queueOptional:(name,run)=>{const job={name,run,live:true};queued.push(job);return()=>{job.live=false;};}};
 const {StartupSnapshot,MIN_WRITE_GAP_MS}=load('src/lib/startup-snapshot.ts',{'./fluency':fluency,'./fluency-metrics':{perfSync:(_n,f)=>f(),measureVolume:()=>({})}},{setTimeout:(fn,ms)=>{const x={fn,at:t+ms,live:true};timers.push(x);return x;},clearTimeout:x=>{if(x)x.live=false;}});
 const data=new Map();let writes=0;
 const storage={read:async k=>data.get(k)||null,write:async(k,v)=>{writes++;data.set(k,v);},remove:async k=>data.delete(k)};
 const snap=new StartupSnapshot(storage,'scope',()=>t);
 const pending=()=>queued.filter(j=>j.live);
 const runQueue=async()=>{for(const j of pending()){j.live=false;await j.run();}};
 const advance=ms=>{t+=ms;for(const x of timers.splice(0)){if(x.live&&x.at<=t)x.fn();else if(x.live)timers.push(x);}};
 return {snap,queued,pending,runQueue,advance,writes:()=>writes,MIN_WRITE_GAP_MS,set now(v){t=v;},get now(){return t;}};
}
const page={items:[{id:'a',title:'A'}],has_more:false};

test('uma resposta DIFERENTE agenda gravação; a MESMA resposta repetida não agenda nada',async()=>{
 const r=snapshotRig();
 r.snap.remember('/tasks',{items:[{id:1}]});assert.equal(r.pending().length,1,'dado novo: grava');
 await r.runQueue();const first=r.writes();assert.ok(first>=1);
 r.advance(r.MIN_WRITE_GAP_MS+1);
 r.snap.remember('/tasks',{items:[{id:1}]});          // idêntica ao que já está gravado
 assert.equal(r.pending().length,0,'resposta idêntica não pode regravar 4 MB');
 r.snap.remember('/tasks',{items:[{id:1},{id:2}]});   // mudou
 assert.equal(r.pending().length,1,'mudança real continua sendo gravada');
});

test('gravações comuns respeitam o intervalo mínimo; a segunda espera em vez de regravar logo',async()=>{
 const r=snapshotRig();
 r.snap.remember('/tasks',{items:[{id:1}]});await r.runQueue();
 r.advance(2000);                                      // 2 s depois
 r.snap.remember('/home',{x:1});
 assert.equal(r.pending().length,0,'dentro do intervalo: nada entra na fila agora');
 r.advance(r.MIN_WRITE_GAP_MS);                        // passou o intervalo
 assert.equal(r.pending().length,1,'depois do intervalo a gravação entra na fila, uma só');
 r.snap.remember('/home',{x:2});r.snap.remember('/home',{x:3});
 assert.equal(r.pending().length,1,'várias mudanças se juntam em uma gravação');
});

test('apagar dados NUNCA espera o intervalo (privacidade)',async()=>{
 const r=snapshotRig();
 r.snap.remember('/tasks',{items:[{id:1}]});await r.runQueue();
 r.advance(1000);r.snap.remember('/home',{x:1});assert.equal(r.pending().length,0,'atualização comum espera');
 r.snap.forgetData();assert.equal(r.pending().length,1,'apagar dados grava já, sem esperar 30 s');
 await r.runQueue();r.advance(500);
 r.snap.remember('/home',{x:9});r.snap.forgetChat();assert.equal(r.pending().length,1,'apagar conversa também é imediato');
 await r.runQueue();r.advance(300);
 r.snap.remember('/tasks',{items:[{id:7}]});r.snap.deleteRecord('task','7');assert.equal(r.pending().length,1,'remover um registro confirmado também é imediato');
});

test('modo Antigo continua exatamente como era: toda resposta agenda gravação',()=>{
 const queued=[];const timers=[];
 const {StartupSnapshot}=load('src/lib/startup-snapshot.ts',{'./fluency':{newFluency:()=>false,queueOptional:(n,run)=>{queued.push(n);return()=>{};}},'./fluency-metrics':{perfSync:(_n,f)=>f(),measureVolume:()=>({})}},{setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout(){}});
 const snap=new StartupSnapshot({read:async()=>null,write:async()=>{},remove:async()=>{}},'scope',()=>1);
 snap.remember('/tasks',{items:[1]});snap.remember('/tasks',{items:[1]});
 assert.deepEqual(timers,[450],'timer legado de 450 ms preservado; sem a regra de idêntico nem intervalo');
 assert.equal(queued.length,0);
});

// ---------- pré-montagem das abas ----------
function mountsRig(){
 const jobs=[];const transitions=[];let tick=0;const timers=[];
 const wrapped={...React,startTransition:fn=>{transitions.push(++tick);return React.startTransition(fn);}};
 const exports={};
 const code=ts.transpileModule(read('src/lib/startup-mounts.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const deps={react:wrapped,'./types':{},'./fluency':{queueOptional:(name,run)=>{const j={name,run,live:true};jobs.push(j);return()=>{j.live=false;};}},'./startup-mounts-legacy':{useLegacyStartupMounts:()=>new Set(['home'])}};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in deps,'Unexpected '+n);return deps[n];},Set,Array,setTimeout:(fn,ms)=>{const x={fn,ms,live:true};timers.push(x);return x;},clearTimeout:x=>{if(x)x.live=false;}},{});
 const Probe=({active,seen})=>{const w=exports.useStartupMounts(true,active,true,'new',[]);seen.current=w;return null;};
 return {exports,jobs,transitions,timers,Probe,live:()=>jobs.filter(j=>j.live),fire:()=>{for(const x of timers.splice(0))if(x.live)x.fn();}};
}

test('pré-montagem: nada entra na fila antes do silêncio de 2,5 s; trocar de aba REINICIA a espera',async()=>{
 const m=mountsRig();const seen={current:null};let tree;
 await act(async()=>{tree=create(React.createElement(m.Probe,{active:'home',seen}));});
 assert.equal(m.live().length,0,'nenhuma aba é montada em segundo plano de imediato');
 assert.ok(m.timers.some(t=>t.live&&t.ms===m.exports.PRERENDER_QUIET_MS),'existe a espera de silêncio');
 await act(async()=>{tree.update(React.createElement(m.Probe,{active:'chat',seen}));});   // o usuário trocou de aba
 const alive=m.timers.filter(t=>t.live&&t.ms===m.exports.PRERENDER_QUIET_MS);
 assert.equal(alive.length,1,'a espera anterior foi cancelada e uma nova começou');
 await act(async()=>{m.fire();});
 assert.deepEqual(m.live().map(j=>j.name).sort(),['prerender:agenda','prerender:apps','prerender:pages','prerender:profile'],'só depois do silêncio as abas ainda não vistas entram na fila');
});

test('pré-montagem: cada aba é montada DENTRO de startTransition (fatiada, interrompível pelo toque)',async()=>{
 const m=mountsRig();const seen={current:null};let tree;
 await act(async()=>{tree=create(React.createElement(m.Probe,{active:'home',seen}));});
 await act(async()=>{m.fire();});
 assert.equal(m.transitions.length,0,'enfileirar não monta nada');
 const job=m.live().find(j=>j.name==='prerender:agenda');
 await act(async()=>{job.run();});
 assert.equal(m.transitions.length,1,'a montagem passou por startTransition');
 assert.ok(seen.current.has('agenda'),'e a aba ficou montada');
});

test('o ANTIGO falha nestes testes: sem espera de silêncio e sem transição (o teste reproduz o problema)',async()=>{
 const oldSrc=require('child_process').execFileSync('git',['show','98a4069:SOFIA_APP/src/lib/startup-mounts.ts'],{cwd:root,encoding:'utf8'});
 assert.ok(!oldSrc.includes('startTransition'),'a versão 0.3.112 monta em passada única');
 assert.ok(!oldSrc.includes('PRERENDER_QUIET_MS'));
});

test('o app grava o que está pendente ao ir para segundo plano (só no modo Novo)',()=>{
 const app=read('App.tsx');
 assert.ok(app.includes("state==='background'&&newFluency())void api.persistLaunch()"));
});
