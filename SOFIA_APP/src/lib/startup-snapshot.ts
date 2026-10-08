/** A disposable encrypted view cache. The server remains authoritative. */
export type SnapshotStorage={read:(scope:string)=>Promise<string|null>;write:(scope:string,value:string)=>Promise<unknown>;remove:(scope:string)=>Promise<unknown>};
type Entry={at:number;value:unknown};
const MAX_AGE=14*86400000,MAX_BYTES=4*1024*1024;
export const chatRead=(path:string)=>path==='/chat-sync/current'||path==='/conversations?offset=0'||/^\/conversations\/[\w-]+$/.test(path);
const fresh=(path:string,at:number,now:number)=>at<=now+60000&&(chatRead(path)||now-at<MAX_AGE);
export function cacheableRead(path:string){
 if(chatRead(path))return true;
 if(['/bootstrap','/home','/tasks','/workspace/catalog','/workspace/integrations','/md/dashboard','/agenda','/chat-sync/current'].includes(path))return true;
 if(/^\/agenda\?month=\d{4}-\d{2}$/.test(path))return true;
 return path.startsWith('/workspace/entities?')&&/(?:\?|&)offset=0(?:&|$)/.test(path)&&!/[?&]q=[^&]+/.test(path);
}
export class StartupSnapshot {
 private encoded=new WeakMap<Entry,string>();private exposed=new WeakSet<Entry>();
 private entries=new Map<string,Entry>();private timer:ReturnType<typeof setTimeout>|undefined;private closed=false;private revision=0;
 constructor(private storage:SnapshotStorage,private scope:string,private now=Date.now){}
 async hydrate(){const revision=this.revision;try{const raw=await this.storage.read(this.scope);if(!raw||raw.length>MAX_BYTES*2||this.closed||revision!==this.revision)return;const parsed=JSON.parse(raw);if(parsed.schema!==1||!Array.isArray(parsed.entries))return;for(const pair of parsed.entries){if(!Array.isArray(pair)||pair.length!==2)continue;const [path,e]=pair;if(typeof path==='string'&&cacheableRead(path)&&!this.entries.has(path)&&e&&typeof e.at==='number'&&fresh(path,e.at,this.now()))this.entries.set(path,e);}}catch{/* Cache failure must not prevent a normal network login. */}}
 private expose(entry:Entry){this.exposed.add(entry);this.encoded.delete(entry);return entry.value;}
 peek<T>(path:string):T|undefined {const e=this.entries.get(path);return e&&fresh(path,e.at,this.now())?this.expose(e) as T:undefined;}
 all(){return [...this.entries].map(([key,e])=>[key,this.expose(e)] as const);}
 remember(path:string,value:unknown){if(this.closed||!cacheableRead(path))return;
  const prior=this.entries.get(path)?.value as any,latest=value as any;
  // Protect chat history against unexplained empty API responses.
  // Confirmed user deletions use forgetChat()/forget(), never this path.
  if(chatRead(path)&&prior&&latest){
   if(Array.isArray(prior.messages)&&prior.messages.length&&Array.isArray(latest.messages)&&!latest.messages.length&&
      prior.conversation?.id===latest.conversation?.id&&!(latest.deleted_ids||[]).length)return;
   if(path==='/conversations?offset=0'&&Array.isArray(prior.items)&&prior.items.length&&Array.isArray(latest.items)&&!latest.items.length)return;
  }
  try{const text=JSON.stringify(value);if(text.length>1024*1024)return;const entry:Entry={at:this.now(),value:JSON.parse(text)};this.entries.set(path,entry);this.encoded.set(entry,'{"at":'+JSON.stringify(entry.at)+',"value":'+text+'}');this.schedule();}catch{}}
 forgetData(){if(this.closed)return;this.revision++;for(const key of this.entries.keys())if(key!=='/bootstrap'&&!chatRead(key))this.entries.delete(key);this.schedule();}
 forgetChat(){if(this.closed)return;this.revision++;for(const key of this.entries.keys())if(chatRead(key))this.entries.delete(key);this.schedule();}
 forget(path:string){if(this.closed)return;this.revision++;this.entries.delete(path);this.schedule();}
 private schedule(){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},450);}
 async flush(){
  if(this.closed)return;
  const entries=[...this.entries].sort((a,b)=>Number(b[0]==='/chat-sync/current')-Number(a[0]==='/chat-sync/current')||b[1].at-a[1].at).slice(0,32);
  const prefix='{"schema":1,"entries":[',suffix=']}',parts:string[]=[];
  let size=prefix.length+suffix.length;
  for(const [path,entry] of entries){
   let encoded=this.exposed.has(entry)?undefined:this.encoded.get(entry);
   if(encoded===undefined){encoded=JSON.stringify(entry);if(!this.exposed.has(entry))this.encoded.set(entry,encoded);}
   const part='['+JSON.stringify(path)+','+encoded+']',extra=part.length+(parts.length?1:0);
   // Same priority, 32-entry limit and character budget as schema 1. Do not
   // repeatedly serialize all the old records while trimming the tail.
   if(parts.length&&size+extra>MAX_BYTES)break;
   parts.push(part);size+=extra;
  }
  try{await this.storage.write(this.scope,prefix+parts.join(',')+suffix);}catch{/* Confirmed server writes never depend on the optional cache. */}
 }
 async clear(){this.closed=true;if(this.timer)clearTimeout(this.timer);this.entries.clear();this.encoded=new WeakMap();this.exposed=new WeakSet();try{await this.storage.remove(this.scope);}catch{}}
}
