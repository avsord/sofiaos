// 0.3.115. The 0.3.114 on-device report: ~154 ms of Agenda JS before the calendar is reached, and the Home widget repeats the
// same recurrence expansion. agenda-recurrence.ts asked Intl.formatToParts ~13 times per recurring event on every expansion.
// Memoising the two pure conversions must change NO result. Proven here against a frozen copy of the previous code.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function build(source){
 let calls=0;
 function DTF(...a){const f=new Intl.DateTimeFormat(...a);const orig=f.formatToParts.bind(f);f.formatToParts=d=>{calls++;return orig(d);};return f;}
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:()=>({}),Intl:{DateTimeFormat:DTF},Date,Math,Map,Set,Number,String,Array,Object,JSON,Error},{});
 return {...exports,calls:()=>calls,reset:()=>{calls=0;}};
}
const OLD=()=>build(fs.readFileSync(path.join(__dirname,'fixtures','agenda-recurrence.0.3.114.ts.txt'),'utf8'));
const NEW=()=>build(read('src/lib/agenda-recurrence.ts'));
const ZONES=['UTC','America/Sao_Paulo','America/New_York','Europe/Lisbon','Asia/Kolkata','Pacific/Auckland','Australia/Lord_Howe'];
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function dataset(random,n){
 const freq=['weekly','monthly','yearly'],pick=a=>a[Math.floor(random()*a.length)];
 // start dates anywhere in 2024-2028, with extra weight on the days around daylight-saving changes
 const hot=['2026-03-08','2026-03-29','2026-04-05','2026-09-27','2026-10-04','2026-10-25','2026-11-01','2027-03-14','2027-03-28','2025-10-26','2025-03-30'];
 return Array.from({length:n},(_,i)=>{
  const day=random()<0.35?pick(hot):new Date(Date.UTC(2024,0,1+Math.floor(random()*1800))).toISOString().slice(0,10);
  const zone=pick(ZONES),repeat=random()<0.9?'sofia-repeat-v1:'+pick(freq)+':'+zone:'';
  const allDay=random()<0.4;
  const data=allDay?{calendar_all_day:true,calendar_date_start:day}:{start_at:`${day}T${String(Math.floor(random()*24)).padStart(2,'0')}:${pick(['00','15','30','45'])}:00.000Z`};
  return {id:'i'+i,state:random()<0.05?'done':'open',tags:repeat?[repeat]:[],data};
 });
}
const MONTHS=[[2026,0],[2026,1],[2026,2],[2026,3],[2026,8],[2026,9],[2026,10],[2027,2],[2025,9],[2025,2],[2026,11]];

test('as respostas são IDÊNTICAS às da versão anterior: 7 fusos, dias de horário de verão, recorrência semanal/mensal/anual',()=>{
 const o=OLD(),n=NEW();let compared=0,occurrences=0;
 for(let seed=1;seed<=24;seed++){
  const items=dataset(rng(seed),80);
  for(const [y,m] of MONTHS){
   const month=new Date(y,m,1);
   const a=JSON.stringify(o.expandAgenda(items,month)),b=JSON.stringify(n.expandAgenda(items,month));
   assert.equal(b,a,`diferença: seed=${seed} mês=${y}-${m+1}`);compared++;occurrences+=JSON.parse(a).length;
  }
 }
 assert.ok(compared>=250&&occurrences>5000,`amostra pequena demais: ${compared} comparações, ${occurrences} ocorrências`);
});

test('occurrences() isolada também é idêntica, em todos os dias de 2026 nas três fronteiras de horário de verão',()=>{
 const o=OLD(),n=NEW();
 for(const zone of ZONES){
  for(const startDay of ['2026-03-07','2026-03-08','2026-03-28','2026-03-29','2026-04-04','2026-04-05','2026-09-26','2026-09-27','2026-10-03','2026-10-04','2026-10-24','2026-10-25','2026-10-31','2026-11-01']){
   for(const h of [0,1,2,3,9,23]){
    const item={id:'x',state:'open',tags:['sofia-repeat-v1:weekly:'+zone],data:{start_at:`${startDay}T${String(h).padStart(2,'0')}:30:00.000Z`}};
    for(const m of [2,3,8,9,10]){
     const from=new Date(2026,m,1),to=new Date(2026,m+1,1);
     assert.equal(JSON.stringify(n.occurrences(item,from,to)),JSON.stringify(o.occurrences(item,from,to)),`${zone} ${startDay} ${h}h mês ${m+1}`);
    }
   }
  }
 }
});

test('a SEGUNDA expansão (a que se repete a cada atualização, e entre Home e Agenda) não chama Intl nenhuma vez',()=>{
 const o=OLD(),n=NEW();const items=dataset(rng(7),150),month=new Date(2026,9,1);
 o.expandAgenda(items,month);const oldFirst=o.calls();o.reset();o.expandAgenda(items,month);const oldSecond=o.calls();
 n.expandAgenda(items,month);const newFirst=n.calls();n.reset();n.expandAgenda(items,month);const newSecond=n.calls();
 assert.ok(oldSecond>300,'a versão anterior pagava tudo de novo: '+oldSecond);assert.equal(oldSecond,oldFirst,'sem memória a segunda custava o mesmo que a primeira');
 assert.equal(newSecond,0,'agora é de graça');
 assert.ok(newFirst<=oldFirst,`a primeira nunca pode piorar: ${newFirst} vs ${oldFirst}`);
});

test('eventos de dia inteiro (aniversários, feriados) custam quase nada na primeira expansão',()=>{
 const o=OLD(),n=NEW();
 const items=Array.from({length:150},(_,i)=>({id:'a'+i,state:'open',tags:['sofia-repeat-v1:weekly:America/Sao_Paulo'],data:{calendar_all_day:true,calendar_date_start:`2026-${String(1+(i*7)%12).padStart(2,'0')}-${String(1+(i*5)%28).padStart(2,'0')}`}}));
 const month=new Date(2026,9,1);
 o.expandAgenda(items,month);n.expandAgenda(items,month);
 assert.ok(n.calls()*8<o.calls(),`esperado pelo menos 8x menos: ${n.calls()} vs ${o.calls()}`);
});

test('a memória é limitada: milhares de instantes diferentes continuam dando respostas idênticas',()=>{
 const o=OLD(),n=NEW();
 for(let k=0;k<400;k++){
  const item={id:'m'+k,state:'open',tags:['sofia-repeat-v1:weekly:'+ZONES[k%ZONES.length]],data:{start_at:new Date(Date.UTC(2024,0,1,k%24,(k*7)%60)+k*86400000*3).toISOString()}};
  const month=new Date(2024+Math.floor(k/100),k%12,1);
  assert.equal(JSON.stringify(n.expandAgenda([item],month)),JSON.stringify(o.expandAgenda([item],month)),'k='+k);
 }
});

test('instrumentação: o relatório passa a mostrar quanto custa expandir, priorizar e criar o gravador de áudio',()=>{
 assert.ok(read('src/screens/Agenda.tsx').includes("perfSync('agenda:expand'")&&read('src/screens/Agenda.tsx').includes("perfSync('agenda:priority'"));
 assert.ok(read('src/components/DashboardWidgets.tsx').includes("perfSync('home:expand'")&&read('src/components/DashboardWidgets.tsx').includes("perfSync('home:priority'"));
 assert.ok(read('src/components/Composer.tsx').includes("timeFirst('composer:recorder'"));
});
