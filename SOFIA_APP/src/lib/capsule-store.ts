import {useEffect,useReducer} from 'react';
import {AppState} from 'react-native';
import type {SofiaApi} from './api';
import type {Entity} from './types';
import {capsuleDay,capsuleKey} from './capsule-model';
import {subscribeSystemChanged} from './system-events';
type Snapshot={plans:Entity[];history:Entity[];loaded:boolean;error:string;saving:string};
class CapsuleStore {
 snapshot:Snapshot={plans:[],history:[],loaded:false,error:'',saving:''};listeners=new Set<()=>void>();request=0;pending:Promise<void>|null=null;
 constructor(public api:SofiaApi){}
 emit(){this.listeners.forEach(f=>f());}
 async load(){if(this.pending)return this.pending;const request=++this.request;this.pending=(async()=>{try{const now=new Date(),from=capsuleDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-30));const plans:Entity[]=[];for(let offset=0;;offset+=100){const r=await this.api.entities('capsule','',offset);plans.push(...r.items);if(r.items.length<100)break;}const r=await this.api.capsuleHistory(from,capsuleDay(now));if(request===this.request){this.snapshot={...this.snapshot,plans,history:r.items,loaded:true,error:''};this.emit();}}catch(e){if(request===this.request){this.snapshot={...this.snapshot,error:e instanceof Error?e.message:'Não foi possível carregar Cápsulas.'};this.emit();}}finally{this.pending=null;}})();return this.pending;}
 async save(input:Partial<Entity>){const saved=await this.api.saveEntity(input);this.request++;this.snapshot={...this.snapshot,plans:this.snapshot.plans.some(p=>p.id===saved.id)?this.snapshot.plans.map(p=>p.id===saved.id?saved:p):[saved,...this.snapshot.plans],error:''};this.emit();if(!this.snapshot.loaded){await this.pending;await this.load();}return saved;}
 async take(id:string,day:string,time:string,taken=true){if(this.snapshot.saving)return;const key=capsuleKey(id,day,time);this.snapshot={...this.snapshot,saving:key,error:''};this.emit();try{const r=await this.api.capsuleTake(id,day,time,taken);this.request++;this.snapshot={...this.snapshot,history:[...this.snapshot.history.filter(h=>capsuleKey(h.data.capsule_id,h.data.day,h.data.time)!==key),...(r.item?[r.item]:[])]};}catch(e){this.snapshot={...this.snapshot,error:e instanceof Error?e.message:'A dose não foi alterada.'};throw e;}finally{this.snapshot={...this.snapshot,saving:''};this.emit();}}
}
const stores=new WeakMap<SofiaApi,CapsuleStore>();
export function capsuleStore(api:SofiaApi){let store=stores.get(api);if(!store){store=new CapsuleStore(api);stores.set(api,store);}return store;}
export function useCapsules(api:SofiaApi,active=true){const store=capsuleStore(api),[,tick]=useReducer(n=>n+1,0);useEffect(()=>{const changed=()=>tick();store.listeners.add(changed);const system=subscribeSystemChanged(owner=>{if(owner===api)void store.load();});const state=AppState.addEventListener('change',s=>{if(active&&s==='active')void store.load();});if(active)void store.load();let count=0;const timer=setInterval(()=>{if(active&&AppState.currentState==='active'){tick();if(++count%30===0)void store.load();}},1000);return()=>{store.listeners.delete(changed);system();state.remove();clearInterval(timer);};},[api,store,active]);return {...store.snapshot,load:()=>store.load(),save:(input:Partial<Entity>)=>store.save(input),take:(id:string,day:string,time:string,taken=true)=>store.take(id,day,time,taken)};}
