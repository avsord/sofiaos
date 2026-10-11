import {idleWork} from './idle-work';
/** Counts/timings only: never retains message text, page titles, IDs or secrets. */
export type PerfEvent={name:string;start:number;end:number};
export type Stall={atMs:number;delayMs:number;early:boolean;events:string[]};
export type DataVolume={pages:number;entities:number;conversations:number;messages:number;historyBytes:number;cachedRoutes:number};
const clock=()=>globalThis.performance?.now?.()??Date.now();
const round=(n:number)=>Math.round(n*10)/10;
let reveal:number|null=null,timer:ReturnType<typeof setInterval>|null=null,last=0,active=true;
let mode='pending',events:PerfEvent[]=[],stalls:Stall[]=[],taps:{tab:string;ms:number;atMs:number;early:boolean}[]=[],mounts:{tab:string;ms:number;atMs:number}[]=[];
export type PerfError={scope:string;name:string;detail:string;components:string[];atMs:number};
let errors:PerfError[]=[];
/** Engine errors (TypeError etc.) describe code, not user content, so their text is kept.
 * Any other error keeps only its name. Component stack keeps component names only. */
export function perfError(scope:string,error:unknown,componentStack?:string|null):PerfError{
 const e=error as {name?:unknown;message?:unknown}|null;
 const name=typeof e?.name==='string'?e.name.slice(0,40):'Error';
 const engine=['TypeError','ReferenceError','RangeError','SyntaxError'].includes(name);
 const detail=engine&&typeof e?.message==='string'?e.message.slice(0,200):'';
 const components=String(componentStack||'').split('\n').map(l=>l.trim().match(/^(?:in|at)\s+([A-Za-z0-9_$.]+)/)?.[1]).filter((c):c is string=>!!c).slice(0,8);
 const row={scope,name,detail,components,atMs:reveal===null?0:round(clock()-reveal)};
 errors.push(row);if(errors.length>20)errors.shift();emit('ERROR',row);return row;
}
let volume:DataVolume={pages:0,entities:0,conversations:0,messages:0,historyBytes:0,cachedRoutes:0};
const totals=()=>({over50:0,over100:0,over250:0,maxMs:0});
let session=totals(),first5=totals();
function emit(type:string,value:unknown){console.info('SOFIA_PERF_'+type+' '+JSON.stringify(value));}
export function perfNow(){return clock();}
export function perfSinceReveal(){return reveal===null?0:Math.max(0,clock()-reveal);}
export function perfEvent(name:string,start:number,end=clock()){
 const row={name,start,end};events.push(row);if(events.length>500)events.shift();
 if(reveal!==null&&(end-start>50||name.startsWith('parse:')))emit('WORK',{name,atMs:round(start-reveal),durationMs:round(end-start)});
}
export function perfSync<T>(name:string,fn:()=>T):T{const start=clock();try{return fn();}finally{perfEvent(name,start);}}
export function perfInput(){if(reveal!==null)perfEvent('input',clock());}
export function perfTap(tab:string,start:number){if(reveal===null)return;const row={tab,ms:round(clock()-start),atMs:round(start-reveal),early:start-reveal<=3000};taps.push(row);if(taps.length>300)taps.shift();emit('TAP',row);}
export function perfMount(tab:string,start:number){if(reveal===null)return;const row={tab,ms:round(clock()-start),atMs:round(start-reveal)};mounts.push(row);if(mounts.length>100)mounts.shift();emit('MOUNT',row);}
export function perfVolume(data:DataVolume){volume=data;emit('VOLUME',data);}
export function historyBytes(raw:string){let bytes=0;for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<raw.length){bytes+=4;i++;}else bytes+=3;}return bytes;}
export function measureVolume(entries:readonly (readonly [string,unknown])[],bytes:number){
 const pages=new Set<string>(),entities=new Set<string>(),conversations=new Set<string>(),messages=new Set<string>();
 for(const [route,item] of entries){const value=item as any;if(!value)continue;
  for(const row of value.items||[]){if(typeof row.id!=='string')continue;if(route.startsWith('/conversations?'))conversations.add(row.id);else if(route.startsWith('/workspace/')||route.startsWith('/agenda')){entities.add(row.id);if(row.kind==='user_page')pages.add(row.id);}}
  if(value.conversation?.id)conversations.add(value.conversation.id);
  for(const row of value.messages||[])if(typeof row.id==='string')messages.add(row.id);
 }
 perfVolume({pages:pages.size,entities:entities.size,conversations:conversations.size,messages:messages.size,historyBytes:bytes,cachedRoutes:entries.length});
}
/** Every commit of an instrumented component: count, total and worst wall time (render start -> layout commit).
 * Each render is also a perf event ('render:<name>'), so stalls that used to show no event now name the component. */
type RenderStat={count:number;totalMs:number;maxMs:number;lastAtMs:number};
const renders=new Map<string,RenderStat>();
export function perfRender(name:string,start:number){
 const end=clock(),d=Math.max(0,end-start),s=renders.get(name)||{count:0,totalMs:0,maxMs:0,lastAtMs:0};
 s.count++;s.totalMs+=d;s.maxMs=Math.max(s.maxMs,d);s.lastAtMs=reveal===null?0:round(end-reveal);renders.set(name,s);
 perfEvent('render:'+name,start,end);
}
export function perfSetMode(value:string){mode=value;}
export function perfActive(value:boolean){active=value;last=clock();}
export function perfStart(){if(reveal!==null)return;reveal=clock();last=reveal;
 timer=setInterval(()=>{const now=clock(),delay=now-last-50,start=last;last=now;if(!active||delay<=50||reveal===null)return;
  const overlapping=events.filter(e=>e.end>=start&&e.start<=now).map(e=>e.name);
  const row={atMs:round(start-reveal),delayMs:round(delay),early:start-reveal<=5000,events:[...new Set(overlapping)].slice(-12)};
  for(const bucket of row.early?[session,first5]:[session]){bucket.over50++;if(delay>100)bucket.over100++;if(delay>250)bucket.over250++;bucket.maxMs=Math.max(bucket.maxMs,round(delay));}
  stalls.push(row);if(stalls.length>300)stalls.shift();emit('BLOCK',row);
 },50);
 // One bounded summary after the initial interaction window, no render loop.
 for(const delay of [6500,12000])setTimeout(()=>{const r=perfReport();emit('SUMMARY',{mode:r.mode,first5s:r.first5s,session:r.session,data:r.data});for(const row of r.idle)emit('IDLE',row);},delay);
}
export function perfReport(){return {mode,sinceRevealMs:round(perfSinceReveal()),measurement:'JS event-loop delay and commit-to-rAF estimates; not physical display latency',first5s:first5,session,top5:[...stalls].sort((a,b)=>b.delayMs-a.delayMs).slice(0,5),stalls:[...stalls],taps:[...taps],mounts:[...mounts],operations:events.filter(e=>e.name!=='input').slice(-100).map(e=>({name:e.name,atMs:reveal===null?0:round(e.start-reveal),durationMs:round(e.end-e.start)})),idle:idleWork.records().map(({error,...row})=>({...row,failed:!!error})),errors:[...errors],renders:Object.fromEntries([...renders].map(([k,v])=>[k,{count:v.count,totalMs:round(v.totalMs),maxMs:round(v.maxMs),lastAtMs:v.lastAtMs}])),data:{...volume}};}
export function perfStop(){if(timer!==null)clearInterval(timer);timer=null;}
