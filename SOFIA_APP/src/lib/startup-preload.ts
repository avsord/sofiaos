/** Read-ahead belongs to one authenticated API instance. Writes discard it. */
export class StartupReads {
 private entries=new Map<string,{promise:Promise<unknown>;until:number;version:number}>();
 private flights=new Map<string,Promise<unknown>>();
 private version=0;
 constructor(private now=Date.now){}
 seed(key:string,value:unknown){this.entries.set(key,{promise:Promise.resolve(value),until:this.now()+60000,version:this.version});}
 invalidate(){this.version++;this.entries.clear();this.flights.clear();}
 prime<T>(key:string,fetch:()=>Promise<T>):Promise<T>{
  const existing=this.entries.get(key);if(existing&&existing.until>this.now())return existing.promise as Promise<T>;
  const version=this.version,promise=this.read(key,fetch);
  const entry={promise,until:this.now()+60000,version};this.entries.set(key,entry);
  void promise.catch(()=>{if(this.entries.get(key)===entry)this.entries.delete(key);});
  return promise;
 }
 read<T>(key:string,fetch:()=>Promise<T>):Promise<T>{
  const entry=this.entries.get(key);
  if(entry&&entry.until>this.now()&&entry.version===this.version){
   // Consume a startup snapshot once; subsequent polling/refresh reads the server.
   const promise=entry.promise as Promise<T>;
   void promise.finally(()=>{if(this.entries.get(key)===entry)this.entries.delete(key);}).catch(()=>{});
   return promise;
  }
  this.entries.delete(key);
  const previous=this.flights.get(key);if(previous)return previous as Promise<T>;
  const promise=fetch();this.flights.set(key,promise);
  void promise.finally(()=>{if(this.flights.get(key)===promise)this.flights.delete(key);}).catch(()=>{});
  return promise;
 }
}
type WarmApi={
 home:()=>Promise<unknown>;tasks:()=>Promise<unknown>;catalog:()=>Promise<{catalog:Record<string,unknown>}>;
 library:()=>Promise<unknown>;entities:(kind:string)=>Promise<unknown>;dashboardWidgets:()=>Promise<unknown>;
 integrations:()=>Promise<unknown>;calendarStatus:()=>Promise<unknown>;ensureChat:()=>Promise<unknown>;
};
export async function preloadStartup(api:WarmApi,agenda:()=>Promise<unknown>){
 // Warm only data after the first frame. The visible Home surface and current
 // conversation get priority; catalog/library work is intentionally bounded.
 const primary=Promise.allSettled([agenda(),api.home(),api.tasks(),api.dashboardWidgets(),api.ensureChat()]);
 let catalog:{catalog:Record<string,unknown>}|null=null;
 try{catalog=await api.catalog();}catch{/* Consuming screens retain their own retry. */}
 await primary;
 const priority=['user_page','capsule','routine','monitor','film','book','shopping_item','annotation','note'];
 // Once the catalog is known, never probe a kind the server did not advertise.
 // On a catalog failure, warm only long-lived core kinds; consuming screens keep their own retry.
 const kinds=catalog?priority.filter(kind=>kind in catalog.catalog):['user_page','routine','monitor'];
 const queue:Array<()=>Promise<unknown>>=[
  ()=>api.library(),()=>api.integrations(),()=>api.calendarStatus(),
  ...kinds.map(kind=>()=>api.entities(kind))
 ];
 let next=0;
 // Two workers avoid saturating JS/network while the user starts interacting.
 await Promise.all(Array.from({length:2},async()=>{while(next<queue.length){const job=queue[next++];try{await job();}catch{/* Optional read-ahead never blocks the app. */}}}));
}
