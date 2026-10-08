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
 private entries=new Map<string,Entry>();private timer:ReturnType<typeof setTimeout>|undefined;private closed=false;private revision=0;
 constructor(private storage:SnapshotStorage,private scope:string,private now=Date.now){}
 async hydrate(){const revision=this.revision;try{const raw=await this.storage.read(this.scope);if(!raw||raw.length>MAX_BYTES*2||this.closed||revision!==this.revision)return;const parsed=JSON.parse(raw);if(parsed.schema!==1||!Array.isArray(parsed.entries))return;for(const pair of parsed.entries){if(!Array.isArray(pair)||pair.length!==2)continue;const [path,e]=pair;if(typeof path==='string'&&cacheableRead(path)&&!this.entries.has(path)&&e&&typeof e.at==='number'&&fresh(path,e.at,this.now()))this.entries.set(path,e);}}catch{/* Cache failure must not prevent a normal network login. */}}
 peek<T>(path:string):T|undefined {const e=this.entries.get(path);return e&&fresh(path,e.at,this.now())?e.value as T:undefined;}
 all(){return [...this.entries].map(([key,e])=>[key,e.value] as const);}
 remember(path:string,value:unknown){if(this.closed||!cacheableRead(path))return;try{const text=JSON.stringify(value);if(text.length>1024*1024)return;this.entries.set(path,{at:this.now(),value:JSON.parse(text)});this.schedule();}catch{}}
 forgetData(){if(this.closed)return;this.revision++;for(const key of this.entries.keys())if(key!=='/bootstrap'&&!chatRead(key))this.entries.delete(key);this.schedule();}
 forgetChat(){if(this.closed)return;this.revision++;for(const key of this.entries.keys())if(chatRead(key))this.entries.delete(key);this.schedule();}
 forget(path:string){if(this.closed)return;this.revision++;this.entries.delete(path);this.schedule();}
 private schedule(){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},450);}
 async flush(){if(this.closed)return;const entries=[...this.entries].sort((a,b)=>Number(b[0]==='/chat-sync/current')-Number(a[0]==='/chat-sync/current')||b[1].at-a[1].at).slice(0,32);let text=JSON.stringify({schema:1,entries});while(text.length>MAX_BYTES&&entries.length>1){entries.pop();text=JSON.stringify({schema:1,entries});}try{await this.storage.write(this.scope,text);}catch{/* Confirmed server writes never depend on the optional cache. */}}
 async clear(){this.closed=true;if(this.timer)clearTimeout(this.timer);this.entries.clear();try{await this.storage.remove(this.scope);}catch{}}
}
