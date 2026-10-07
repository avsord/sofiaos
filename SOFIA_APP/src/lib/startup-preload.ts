/** Read-ahead belongs to one authenticated API instance. Writes discard it. */
export class StartupReads {
 private entries=new Map<string,{promise:Promise<unknown>;until:number;version:number}>();
 private flights=new Map<string,Promise<unknown>>();
 private version=0;
 constructor(private now=Date.now){}
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
export async function preloadStartup(api:{home:()=>Promise<unknown>;tasks:()=>Promise<unknown>;catalog:()=>Promise<{catalog:Record<string,unknown>}>;library:()=>Promise<unknown>;entities:(kind:string)=>Promise<unknown>;dashboardWidgets:()=>Promise<unknown>;integrations:()=>Promise<unknown>;calendarStatus:()=>Promise<unknown>},agenda:()=>Promise<unknown>){
 // Start the current month immediately, independent of the selected menu.
 const primary=Promise.allSettled([agenda(),api.home(),api.tasks(),api.library(),api.dashboardWidgets(),api.integrations(),api.calendarStatus()]);
 try{
  const catalog=await api.catalog(),kinds=Object.keys(catalog.catalog);
  let next=0;
  // Bound background work so chat/navigation stay responsive on a slow connection.
  await Promise.all(Array.from({length:3},async()=>{while(next<kinds.length){const kind=kinds[next++];try{await api.entities(kind);}catch{/* Each screen retains its own retry and error state. */}}}));
 }catch{/* Failed catalog reads are retried by their consuming screens. */}
 await primary;
}
