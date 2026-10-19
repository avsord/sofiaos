// 0.3.146: quando o app foi para o segundo plano (para saber se uma falha foi so interrupcao).
// AppState e carregado sob demanda: os testes carregam este modulo fora do React Native.
let lastBackgroundAt=0;
const appState=(()=>{try{return require('react-native').AppState as {currentState:string;addEventListener:(e:string,f:(s:string)=>void)=>{remove:()=>void}};}catch{return null;}})();
try{appState?.addEventListener('change',state=>{if(state!=='active')lastBackgroundAt=Date.now();});}catch{}
export function wentToBackgroundSince(t:number){return lastBackgroundAt>=t||(!!appState&&appState.currentState!=='active');}
export function waitForActive(maxMs=15000){if(!appState||appState.currentState==='active')return Promise.resolve();return new Promise<void>(resolve=>{let sub:{remove:()=>void}|null=null;const done=()=>{sub?.remove();clearTimeout(timer);resolve();};sub=appState.addEventListener('change',s=>{if(s==='active')done();});const timer=setTimeout(done,maxMs);});}
export function isChatSend(path:string,method:string){return method==='POST'&&/^\/(chat|conversations|messages)/.test(path)&&!path.startsWith('/chat-sync');}
import type {MercadoLivreOptions, MercadoLivreResponse} from './mercado-livre-types';
import type {StoreConnectionsState} from './store-connections-types';
import {readMercadoLivrePageOnDevice,canonicalMercadoLivreUrl} from './mercado-livre-device';
import {AUTH_STORAGE_KEY,PREFS_STORAGE_KEY,takeStartupAuth,takeStartupPrefs,invalidateStartupAuth,invalidateStartupPrefs} from './startup-read-ahead';
import {StartupSnapshot} from './startup-snapshot';
import {encryptedStorage} from './encrypted-storage';
export type CalendarState={configured:boolean;connected:boolean;syncing?:boolean;last_sync?:string;error?:string;calendar_name?:string;calendar_id?:string;warnings?:string[];item_errors?:{id:string;title:string;reason:string}[];conflicts?:{id:string;reason:string}[];calendars?:{id:string;summary:string;accessRole:string;selected?:boolean;primary?:boolean}[];email?:string;redirect_uri?:string;history?:{at:string;imported:number;created:number;updated:number;sent:number;removed:number;skipped:number;conflicts:number;ms:number}[];gmail?:{connected:boolean};drive?:{connected:boolean;portable?:{configured:boolean;at:string;error:string};folders?:string[];attachments?:{total:number;in_drive:number;local_mb:number};voices?:{total:number;in_drive:number;local_mb:number};pages?:number;last_backup?:string;last_backup_error?:string;backups:number;folder:string}};
import {StartupReads,preloadStartup} from './startup-preload';
import {themeTimes} from './theme-schedule';
import {agendaChanged} from './agenda-events';
import {systemChanged} from './system-events';
import {mergeMessages} from './chat-model';
import {LegacyMdAdapter} from './legacy-md';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Auth, Bootstrap, Conversation, MessagePage, ChatResult, HomeData, Task, AgendaItem, Notice, Profile, Prefs, Catalog, Entity, ChatSnapshot } from './types';
const rawBase = (process.env.EXPO_PUBLIC_API_URL || 'https://sofiaos.up.railway.app').replace(/\/+$/, '');
const parsedBase = new URL(rawBase);
if (parsedBase.protocol !== 'https:' || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash || parsedBase.pathname !== '/') throw new Error('Configure a raiz HTTPS do servidor Sofia.');
export const SITE = rawBase;
const AUTH_KEY = AUTH_STORAGE_KEY, PREFS_KEY = PREFS_STORAGE_KEY;
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export async function readAuth(): Promise<Auth | null> {
  const raw = await takeStartupAuth(()=>SecureStore.getItemAsync(AUTH_KEY));
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (typeof a.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(a.token) || !Number.isFinite(Date.parse(a.expires_at)) || !a.profile) { await forgetAuth(); return null; } return a as Auth; }
  catch { await forgetAuth(); return null; }
}
export function saveAuth(auth: Auth) { invalidateStartupAuth(); return SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(auth), secureOptions); }
export function forgetAuth() { invalidateStartupAuth(); return SecureStore.deleteItemAsync(AUTH_KEY); }
export async function readPrefs(): Promise<Prefs> {
  try { const p = JSON.parse(await takeStartupPrefs(()=>AsyncStorage.getItem(PREFS_KEY)) || '{}'); return { appearance: ['system','light','dark','schedule'].includes(p.appearance) ? p.appearance : 'schedule', enterToSend: p.enterToSend === true, autoSendVoice: p.autoSendVoice !== false, ...themeTimes(p) }; }
  catch { return { appearance: 'schedule', enterToSend: false, autoSendVoice: true, lightAt:'05:00', darkAt:'19:00' }; }
}
export function savePrefs(p: Prefs) { invalidateStartupPrefs(); return AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public data?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
}
// Organização dos widgets da Início guardada no aparelho enquanto o servidor
// não sincroniza (antes dava erro e o widget de Cápsulas não entrava).
const LOCAL_WIDGETS_KEY='sofia.native.dashboard-widgets.v1';
// Diagnóstico: últimas falhas de rede (rota, código, tempo). Sem corpo, token ou dados.
const apiFailures:Array<{at:string;path:string;method:string;status:number;code:string;ms:number}>=[];
function noteApiFailure(path:string,method:string,e:ApiError,ms:number){apiFailures.push({at:new Date().toISOString(),path:path.split('?')[0].slice(0,80),method,status:Number(e?.status)||0,code:String(e?.code||'?'),ms});if(apiFailures.length>40)apiFailures.shift();}
export function apiDiagnostics(){return {recentFailures:apiFailures.slice(-25)};}
export function startupSnapshotFor(scope:string){return new StartupSnapshot(encryptedStorage,SITE+'|'+scope.trim().toLowerCase()+'|startup-v1');}
export type ImportItem = {import_id: string; date: string; desc: string; amount: number; kind: string; category: string; duplicate: boolean; skip: string};
export class SofiaApi {
  private readonly md:LegacyMdAdapter;
  private readonly startupReads=new StartupReads();
  private warming=false;
  private preloadFlight:Promise<void>|null=null;
  private readonly snapshots:StartupSnapshot;
  private hydration:Promise<void>|null=null;
  private chatOpening:Promise<ChatSnapshot>|null=null;
  private cacheGeneration=0;
  private networkGate:Promise<void>=Promise.resolve();
  private releaseGate:(()=>void)|null=null;
  /** Cached reads stay available; live I/O cannot contend with first layout. */
  deferNetworkUntilPaint(){if(!this.releaseGate)this.networkGate=new Promise<void>(resolve=>{this.releaseGate=resolve;});return this;}
  releaseNetwork(){this.releaseGate?.();this.releaseGate=null;}

  private rememberChatResult(result:ChatResult,input:object){
    const id=result.conversation_id||(input as {conversation_id?:string}).conversation_id;if(!id)return;
    const current=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');
    const before=current?.conversation?.id===id?current:this.snapshots.peek<ChatSnapshot>('/conversations/'+id);
    const conversation=before?.conversation||(result.conversation?.id===id?result.conversation:undefined)||{id,title:'Conversa com a Sofia',channel:'mobile',state:'active',created_at:result.messages[0]?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
    const saved:ChatSnapshot={...before,conversation,current_id:id,cursor_revision:before?.cursor_revision||0,deleted_ids:before?.deleted_ids||[],messages:mergeMessages(before?.messages||[],result.messages).slice(-100),has_more:result.has_more};
    this.snapshots.remember('/chat-sync/current',saved);this.snapshots.remember('/conversations/'+id,saved);
  }
  async hydrate(){if(!this.hydration)this.hydration=this.snapshots.hydrate().then(()=>{for(const [key,value] of this.snapshots.all())this.startupReads.seed(key,value);});return this.hydration;}
  async persistLaunch(){await this.snapshots.flush();}
  async prefetchCache(path:string){if(!/^\/(workspace\/|conversations\?|agenda\?|md\/dashboard)/.test(path))return;const value=await this.fetchRequest(path,undefined,'GET',20000);this.startupReads.seed(path,value);}
  cached<T>(path:string){return this.snapshots.peek<T>(path);}
  /** Guarda um resumo calculado no app (ex.: widget da Início) no mesmo cache criptografado da abertura. */
  rememberLocal(path:string,value:unknown){this.snapshots.remember(path,value);}
  async discardCache(){this.cacheGeneration++;this.startupReads.invalidate();await this.snapshots.clear();}
  async liveBootstrap(){return this.fetchRequest<Bootstrap>('/bootstrap',undefined,'GET',20000);}
  preload(agenda:()=>Promise<unknown>){
    if(!this.preloadFlight){const flight=this.runPreload(agenda);this.preloadFlight=flight;void flight.finally(()=>{if(this.preloadFlight===flight)this.preloadFlight=null;}).catch(()=>{});}
    return this.preloadFlight;
  }
  private async runPreload(agenda:()=>Promise<unknown>){
    await this.hydrate();
    // Only paths that already came from disk need an explicit live refresh.
    // On a cold cache preloadStartup fetches them once, so do not fetch twice.
    const paths=['/home','/tasks','/md/dashboard','/workspace/catalog',...['user_page','capsule','routine','monitor'].map(kind=>'/workspace/entities?limit=100&kind='+kind+'&q=&offset=0')];
    const refresh=paths.filter(path=>this.snapshots.peek(path)!==undefined);
    this.warming=true;void this.conversations().catch(()=>{});try{await preloadStartup(this,agenda);}finally{this.warming=false;}
    let index=0;await Promise.all(Array.from({length:2},async()=>{while(index<refresh.length){const path=refresh[index++];try{const value=await this.fetchRequest(path,undefined,'GET',20000);this.startupReads.seed(path,value);}catch{}}}));
    if(refresh.length)systemChanged(this);
  }
  readonly owner: string;
  constructor(private token = '', private onExpired: () => void = () => {},scope='anonymous',restored?:StartupSnapshot) {this.owner=scope;this.md=new LegacyMdAdapter(this.request.bind(this),AsyncStorage,scope);this.snapshots=restored||startupSnapshotFor(scope);if(restored){for(const [key,value] of restored.all())this.startupReads.seed(key,value);}}
  get mdLocalOnly(){return this.md.localOnly;}
  private async request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', timeout = 20000): Promise<T> {
    if(method!=='GET'){
      // Merge retained records before a mutation can reconcile or remove any
      // projection restored by the lightweight launch path.
      await this.hydrate();
      if(!path.startsWith('/chat-sync/current')&&!path.startsWith('/chat-sync/select')){this.cacheGeneration++;this.startupReads.invalidate();}
      const result=await this.fetchRequest<T>(path,body,method,timeout);
      if(method==='DELETE'){
        // Fence reads begun during the write too. Failed deletes never get here.
        this.cacheGeneration++;this.startupReads.invalidate();
        const task=/^\/tasks\/([^/]+)$/.exec(path),entity=/^\/workspace\/entities\/([^/]+)$/.exec(path);
        if(task||entity){this.snapshots.deleteRecord(task?'task':'entity',decodeURIComponent((task||entity)![1]));await this.snapshots.flush();}
      }
      return result;
    }
    const read=()=>this.fetchRequest<T>(path,body,method,timeout);
    return this.warming&&path!=='/bootstrap' ? this.startupReads.prime(path,read) : this.startupReads.read(path,read);
  }
  private async fetchRequest<T>(path:string,body:unknown,method:string,timeout:number,signal?:AbortSignal):Promise<T>{
    const started=Date.now();
    try{return await this.fetchOnce<T>(path,body,method,timeout,signal);}
    catch(error){
      const e=error as ApiError;
      // 0.3.146: requisicao que "caiu" porque o app foi para o segundo plano (Gmail, navegador,
      // tela bloqueada) nao e falha da Sofia nem falta de internet. Leitura: espera o app voltar
      // e repete uma vez, em silencio. Escrita: vira INTERRUPTED, com texto da propria operacao.
      const interrupted=wentToBackgroundSince(started);
      if(interrupted&&method!=='GET'&&(e.code==='TIMEOUT'||e.code==='NETWORK')&&!isChatSend(path,method)){noteApiFailure(path,method,e,Date.now()-started);throw new ApiError('A operação foi interrompida quando o app saiu da tela. Confira se ela foi concluída antes de repetir.','INTERRUPTED',0);}
      // Leitura que caiu porque o servidor estava reiniciando, ocupado, demorou ou o app saiu da tela: tenta de novo uma vez, em silêncio.
      // (Antes a nova tentativa so valia se o erro viesse antes do prazo - um TIMEOUT nunca repetia.)
      if(method==='GET'&&!signal?.aborted&&(e.status===502||e.status===503||e.status===504||e.code==='TIMEOUT'||(e.code==='NETWORK'&&interrupted))){
        await waitForActive();
        await new Promise(r=>setTimeout(r,interrupted?300:1200));
        try{return await this.fetchOnce<T>(path,body,method,timeout,signal);}catch(again){noteApiFailure(path,method,again as ApiError,Date.now()-started);throw again;}
      }
      noteApiFailure(path,method,e,Date.now()-started);throw error;
    }
  }
  private async fetchOnce<T>(path:string,body:unknown,method:string,timeout:number,signal?:AbortSignal):Promise<T>{
    if(signal?.aborted)throw new ApiError('Leitura cancelada.','CANCELLED',0);
    await this.networkGate;
    if(signal?.aborted)throw new ApiError('Leitura cancelada.','CANCELLED',0);
    const generation=this.cacheGeneration,controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
    try {
      const response = await fetch(SITE + '/api/mobile' + path, { method, signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
      let data: Record<string, any>;
      try { data = await response.json(); } catch { throw new ApiError('O servidor não retornou dados válidos. A API móvel da Sofia precisa estar publicada.', 'INVALID_RESPONSE', response.status); }
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
      if (!response.ok) { if (response.status === 401 && path !== '/auth/login') {this.onExpired();} throw new ApiError(data.error || (response.status>=502&&response.status<=504?'O servidor da Sofia está reiniciando ou ocupado ('+response.status+'). Tente de novo em alguns segundos.':'Não foi possível concluir ('+response.status+').'), data.code || (response.status>=502&&response.status<=504?'SERVER_UNAVAILABLE':'HTTP_ERROR'), response.status, data); }
      if(method==='GET'&&generation===this.cacheGeneration)this.snapshots.remember(path,data);
      if(generation===this.cacheGeneration&&path.startsWith('/chat-sync')&&data.conversation&&Array.isArray(data.messages)){this.snapshots.remember('/chat-sync/current',{...data,messages:data.messages.slice(-100)});this.snapshots.remember('/conversations/'+data.conversation.id,{...data,messages:data.messages.slice(-100)});}
      return data as T;
    } catch (error) {
      if(signal?.aborted)throw new ApiError('Leitura cancelada.','CANCELLED',0);
      if (error instanceof ApiError) throw error;
      // 0.3.146: o aviso de "mensagem pode ter chegado" e so do envio do chat; as outras operacoes dizem o que demorou.
      if (controller.signal.aborted) throw new ApiError(isChatSend(path, method) ? 'A conexão demorou. Recarregue antes de reenviar: sua mensagem pode ter chegado.' : 'A Sofia demorou para responder. Tente de novo.', 'TIMEOUT', 0);
      throw new ApiError('Sem conexão com a Sofia. Verifique a internet e tente novamente.', 'NETWORK', 0);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
  }
  /** Encomendas (0.3.142): consulta a transportadora agora e devolve o registro atualizado. */
  refreshPackage(id: string) { return this.request<{item: Entity; changed: boolean; error: string}>('/packages/refresh', { id }); }
  login(email: string, password: string, device: string) { return this.request<Auth>('/auth/login', { email: email.trim(), password, device_name: device }); }
  bootstrap() { return this.request<Bootstrap>('/bootstrap'); }
  logout() { return this.request<{ok: boolean}>('/auth/logout', {}); }
  logoutAll() { return this.request<{ok: boolean}>('/auth/logout-all', {}); }
  changePassword(currentPassword: string,newPassword: string,confirmPassword: string) { return this.request<{ok: boolean}>('/auth/change-password', {currentPassword,newPassword,confirmPassword}); }
  syncChat(id?:string) { return this.request<ChatSnapshot>('/chat-sync'+(id?'?conversation_id='+encodeURIComponent(id):'')); }
  private async resumeChat():Promise<ChatSnapshot>{
    await this.hydrate();
    const current=await this.request<ChatSnapshot>('/chat-sync');
    // An explicit deletion is authoritative. Do not recover deleted messages.
    if(current.messages?.length||current.deleted_ids?.length)return current;
    const listing=await this.conversations();
    const candidates=listing.items.filter(c=>['web','mobile'].includes(c.channel)&&(!c.state||c.state==='active')&&c.id!==current.conversation?.id&&c.message_count!==0);
    // Legacy servers omit counts; bound probes. New servers place populated threads first.
    for(const item of candidates.slice(0,6)){
      try{
        const history=await this.history(item.id);
        if(history.messages.length)return await this.selectChat(item.id);
      }catch(e){if((e as ApiError).status!==404)throw e;}
    }
    return current;
  }
  ensureChat() {
    if(!this.chatOpening){const opening=this.resumeChat().then(async page=>{await this.snapshots.flush();return page;});this.chatOpening=opening;void opening.finally(()=>{if(this.chatOpening===opening)this.chatOpening=null;}).catch(()=>{});}
    return this.chatOpening;
  }
  selectChat(id:string) { return this.request<ChatSnapshot>('/chat-sync/select',{conversation_id:id}); }
  async deleteChatMessages(id:string,ids:string[]) {const result=await this.request<{deleted_ids:string[];failed:{id:string;error:string}[]}>('/chat-sync/delete',{conversation_id:id,ids});this.cacheGeneration++;this.startupReads.invalidate();const before=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');if(before?.conversation?.id===id&&before){const removed=new Set(result.deleted_ids);this.snapshots.remember('/chat-sync/current',{...before,messages:before.messages.filter(m=>!removed.has(m.id)),deleted_ids:[...new Set([...before.deleted_ids,...result.deleted_ids])]});}this.snapshots.forget('/conversations/'+id);await this.snapshots.flush();return result;}
  conversations(offset = 0) { return this.request<{items: Conversation[]; has_more: boolean; next_offset: number}>('/conversations?offset=' + offset); }
  capsuleHistory(from:string,to:string){return this.request<{items:Entity[]}>('/md/capsules/doses?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));}
  capsuleTake(capsule_id:string,day:string,time:string,taken=true){return this.request<{ok:boolean;item:Entity|null}>('/md/capsules/doses',{capsule_id,day,time,taken},'POST');}
  async dashboardWidgets(){const raw=await AsyncStorage.getItem(LOCAL_WIDGETS_KEY).catch(()=>null);const local=raw?JSON.parse(raw):null;if(!await this.feature('dashboard_widgets')){if(Array.isArray(local))return {widgets:local as string[]};return {widgets:['monitoring','tasks']};}const r=await this.request<{widgets:string[]|null;saved?:boolean}>('/md/dashboard');if(Array.isArray(r.widgets)&&(r.saved!==false||!Array.isArray(local)))return {widgets:r.widgets};
   // Servidor ainda sem organização salva: leva a do aparelho para lá (nada se perde ao trocar de celular).
   const start=Array.isArray(local)?local as string[]:['monitoring','tasks'];await this.request('/md/dashboard',{widgets:start},'POST').catch(()=>{});return {widgets:start};}
  async saveDashboardWidgets(widgets:string[]){if(!await this.feature('dashboard_widgets')){const clean=widgets.filter(w=>['monitoring','tasks','capsules','reminders','packages'].includes(w));await AsyncStorage.setItem(LOCAL_WIDGETS_KEY,JSON.stringify(clean));return {widgets:clean};}return this.request<{widgets:string[]}>('/md/dashboard',{widgets},'PATCH');}
  async deleteConversations(ids:string[]) { if(!await this.feature('conversation_delete'))throw new Error('A exclusão de conversas aguarda a atualização do servidor. Nenhuma conversa foi apagada.');const result=await this.request<{ok:boolean}>('/md/conversations',{ids},'DELETE');this.cacheGeneration++;this.startupReads.invalidate();this.snapshots.forget('/conversations?offset=0');for(const id of ids)this.snapshots.forget('/conversations/'+id);const current=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');if(current?.conversation&&ids.includes(current.conversation.id))this.snapshots.forget('/chat-sync/current');await this.snapshots.flush();return result; }
  newConversation(title = 'Conversa com a Sofia') { return this.request<{conversation: Conversation}>('/conversations', {title}); }
  async deleteMessage(id: string) {const result=await this.request<{ok:boolean;id:string;conversation_id:string}>('/messages/' + encodeURIComponent(id), {}, 'DELETE');this.cacheGeneration++;this.startupReads.invalidate();this.snapshots.forget('/conversations/'+result.conversation_id);const current=this.snapshots.peek<ChatSnapshot>('/chat-sync/current');if(current?.conversation?.id===result.conversation_id&&current)this.snapshots.remember('/chat-sync/current',{...current,messages:current.messages.filter(m=>m.id!==id),deleted_ids:[...current.deleted_ids,id]});await this.snapshots.flush();return result;}
  async clearChatHistory() {const result=await this.request<{ok:boolean;conversations:number;messages:number}>('/chat-history', {}, 'DELETE');this.cacheGeneration++;this.startupReads.invalidate();this.snapshots.forgetChat();await this.snapshots.flush();return result;}
  history(id: string, before?: number) { return this.request<MessagePage>(`/conversations/${encodeURIComponent(id)}${before ? '?before=' + before : ''}`); }
  async chat(data: object) { const result=await this.request<ChatResult>('/messages', data, 'POST', 180000);this.rememberChatResult(result,data);await this.snapshots.flush();systemChanged(this);return result; }
  async audio(data: object) { const result=await this.request<ChatResult>('/messages/audio', data, 'POST', 180000);this.rememberChatResult(result,data);await this.snapshots.flush();systemChanged(this);return result; }
  home() { return this.request<HomeData>('/home'); }
  movePage(input:{id:string;revision:number;parentId:string;kind:string;anchorId:string}) { return this.md.move(input); }
  allNotifications(offset=0) { return this.md.notices(offset); }
  clearNotification(id:string) { return this.md.clear(id); }
  // Não depende mais de page_order: o servidor responde a agenda Google por conta própria.
  async calendarStatus():Promise<CalendarState> { try{return await this.request<CalendarState>('/md/calendar/status');}catch(e){if((e as ApiError).status===404)return {configured:false,connected:false};throw e;} }
  driveBackup() { return this.request<{ok?:boolean;skipped?:boolean;bytes?:number}>('/md/drive/backup',{},'POST',120000); }
  calendarConnect() { return this.request<{url:string}>('/md/calendar/connect',{app:true}); }
  // Conexoes de lojas (Price Tracker): o mesmo formato para todas as lojas.
  storeConnections() { return this.request<StoreConnectionsState>('/price-tracker/connections'); }
  private mlConnectedCache:{at:number;value:boolean}|null=null;
  /** Lembrado por 5 min: evita uma consulta extra a cada leitura de preco. */
  async mlAccountConnected(){
    if(this.mlConnectedCache&&Date.now()-this.mlConnectedCache.at<300000)return this.mlConnectedCache.value;
    try{const st=await this.storeConnections();const value=!!st.stores.find(x=>x.provider==='mercadolivre')?.connected;this.mlConnectedCache={at:Date.now(),value};return value;}
    catch{return this.mlConnectedCache?.value??false;}
  }
  storeConnect(provider:string) { this.mlConnectedCache=null; return this.request<{url:string}>('/price-tracker/connections/'+provider+'/connect',{app:true}); }
  storeDisconnect(provider:string) { this.mlConnectedCache=null; return this.request<{ok:boolean}>('/price-tracker/connections/'+provider+'/disconnect',{}); }
  calendarDisconnect() { return this.request<{ok:boolean}>('/md/calendar/disconnect',{}); }
  calendarSync() { return this.request<{ok:boolean}>('/md/calendar/sync',{},'POST',90000); }
  calendarSelect(id:string) { return this.request<{ok:boolean}>('/md/calendar/select',{id}); }
  async feature(name:string):Promise<boolean>{try{const c=await this.request<Record<string,unknown>>('/md/capabilities');return c[name]===true;}catch(e){if((e as ApiError).status===404)return false;throw e;}}
  tasks() { return this.request<{items: Task[]}>('/tasks'); }
  taskState(task: Task, state: 'done' | 'todo') { return this.request<{item: Task}>('/tasks/' + encodeURIComponent(task.id), { state, revision: task.revision }, 'PATCH'); }
  async saveTask(task: Partial<Task>) { const saved=await this.request<{item: Task}>('/tasks' + (task.id ? '/' + encodeURIComponent(task.id) : ''), task, task.id ? 'PATCH' : 'POST');systemChanged(this);return saved; }
  deleteTask(id: string) { return this.request<{ok: boolean}>('/tasks/' + encodeURIComponent(id), undefined, 'DELETE'); }
  agenda(month?:string) { return this.request<{items: AgendaItem[];refresh_pending?:boolean}>('/agenda'+(month?'?month='+encodeURIComponent(month):'')); }
  createEvent(title: string, start_at: string) { return this.request<{item: AgendaItem}>('/agenda', { title, start_at }); }
  notifications() { return this.request<{items: Notice[]; push_enabled: boolean}>('/notifications'); }
  /** 0.3.146: marcar TODAS como lidas no servidor (nao so as carregadas). */
  markAllRead() { return this.md.readAll(); }
  /** 0.3.182: registros de Financas apagados que ainda estao nos backups diarios do servidor. */
  financeRecoverable() { return this.request<{items: {id: string; kind: string; title: string; data: Record<string, any>; state: string; updated_at: string; backup: string}[]}>('/md/finance/recoverable'); }
  financeRecover(id: string) { return this.request<Entity>('/md/finance/recover', {id}, 'POST'); }
  markRead(id: string) { return this.request<{ok: boolean}>('/notifications/' + encodeURIComponent(id) + '/read', {}); }
  profile(name: string) { return this.request<{profile: Profile}>('/profile', {name}, 'PATCH'); }
  catalog() { return this.request<Catalog>('/workspace/catalog'); }
  async entities(kind: string, q = '', offset = 0) { const result=await this.request<{items:Entity[]}>('/workspace/entities?limit=100&kind='+encodeURIComponent(kind)+'&q='+encodeURIComponent(q)+'&offset='+offset);return kind==='user_page'?{...result,items:await this.md.decorate(result.items)}:result; }
  library(q = '', offset = 0) { return this.request<{items:Entity[]}>('/workspace/entities?limit=100&group=library&q='+encodeURIComponent(q)+'&offset='+offset); }
  async entity(id: string) { const item=await this.request<Entity>('/workspace/entities/'+encodeURIComponent(id));return item.kind==='user_page'?(await this.md.decorate([item]))[0]:item; }
  async saveEntity(input: Partial<Entity>) { const body=input.data?await this.md.clean(input):input;const saved=await this.request<Entity>('/workspace/entities'+(input.id?'/'+encodeURIComponent(input.id):''),body,input.id?'PATCH':'POST');if(['commitment','reminder'].includes(saved.kind))agendaChanged(this);systemChanged(this);return saved.kind==='user_page'?(await this.md.decorate([saved]))[0]:saved; }
  async deleteEntity(id: string) { const result=await this.request<{ok: boolean}>('/workspace/entities/' + encodeURIComponent(id), undefined, 'DELETE');agendaChanged(this);return result; }
  uploadAttachment(id:string,input:{name:string;mime:string;base64:string}) { return this.request<{id:string}>('/workspace/entities/'+encodeURIComponent(id)+'/attachments',input,'POST',60000); }
  /** 0.3.199: miniatura minuscula da foto (o chat mostra desfocada sem baixar o original do Drive). */
  attachmentThumb(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Imagem inválida.');return {uri:SITE+'/api/mobile/workspace/attachments/'+encodeURIComponent(id)+'?thumb=1',headers:{Authorization:'Bearer '+this.token}}; }
  attachmentSource(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Imagem inválida.');return {uri:SITE+'/api/mobile/workspace/attachments/'+encodeURIComponent(id)+'?inline=1',headers:{Authorization:'Bearer '+this.token}}; }
  entityAction(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/action', input); }
  async libraryOrganization(){const items:Entity[]=[];for(let offset=0;;offset+=100){const page=await this.request<{items:Entity[]}>('/workspace/entities?group=library&limit=100&offset='+offset);items.push(...page.items);if(page.items.length<100)return {items};}}
  financeImportPreview(text: string, target: 'account' | 'card', targetId: string) { return this.request<{format: string; items: ImportItem[]; total: number; duplicates: number}>('/md/finance/import', {text, target, target_id: targetId}, 'POST', 60000); }
  financeImportCommit(items: ImportItem[], target: 'account' | 'card', targetId: string) { return this.request<{created: number; skipped: number}>('/md/finance/import/commit', {items, target, target_id: targetId}, 'POST', 60000); }
  financeBundle(window?: {from: string; to: string}) { return this.request<{items: Record<string, Entity[]>; carry?: Record<string, number>; window?: {from: string; to: string} | null; at: string}>('/md/finance' + (window ? '?from=' + window.from + '&to=' + window.to : ''), undefined, 'GET', 30000); }
  // POST read bypasses the write cache invalidation path. No token goes to the store.
  async readMercadoLivre(link:string,options:MercadoLivreOptions={}):Promise<MercadoLivreResponse> {
    const {signal,fetchUrl,...params}=options;
    // O Mercado Livre recusa a Railway (data center) e manda para login. O celular baixa a
    // pagina como TEXTO e o servidor so faz a extracao estrita. Se o celular nao conseguir,
    // cai no caminho antigo (servidor busca sozinho) — nunca WebView.
    // Conta do Mercado Livre conectada: o servidor le pela API oficial e ignora a pagina.
    // Ai o celular nem abre o navegador invisivel (que e o que demora e pede verificacao).
    const page=await this.mlAccountConnected()?{ok:false as const,code:'API'}:await readMercadoLivrePageOnDevice(fetchUrl||canonicalMercadoLivreUrl(link),signal);
    if(!page.ok&&page.code==='CANCELLED')return {ok:false,code:'CANCELLED',message:'Leitura cancelada.',keepLastPrice:true as const};
    const body=page.ok?{link,...params,html:page.html,finalUrl:page.finalUrl}:{link,...params};
    const r=await this.fetchRequest<MercadoLivreResponse>('/price-tracker/mercadolivre/read',body,'POST',40000,signal);
    // Diagnostico: se o celular tambem falhou, o motivo dele vai junto (sem conteudo da pagina).
    return !r.ok&&!page.ok&&page.code!=='API'?{...r,message:r.message+' (celular: '+page.code+')'}:r;
  }
  monitorObservations() { return this.request<{items: Record<string, any[]>}>('/md/monitors/observations'); }
  observations(id: string) { return this.request<{items: any[];status?:{last_at:string|null;last_error:string|null;next_at:string|null}}>('/workspace/entities/' + encodeURIComponent(id) + '/observations'); }
  mailSecret(id: string, password: string) { return this.request<{ok: boolean; messages: number}>('/mail/accounts/' + encodeURIComponent(id) + '/secret', {password}, 'POST', 45000); }
  mailForget(id: string) { return this.request<{ok: boolean}>('/mail/accounts/' + encodeURIComponent(id) + '/forget', {}); }
  /** rescanDays > 0 reavalia os ultimos dias (regra nova/editada) sem mexer no ponto de leitura. */
  mailCheck(accountId = '', rescanDays = 0) { return this.request<{accounts: number; scanned: number; hits: number; errors: {account: string; error: string}[]; skipped?: boolean}>('/mail/check', {account_id: accountId, rescan_days: rescanDays}, 'POST', 120000); }
  observe(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/observations', input); }
  integrations() { return this.request<{items: {name:string;key:string;status:string;description:string;connect_url?:string}[]}>('/workspace/integrations'); }
  audioSource(path: string) {
    if (!/^\/api\/mobile\/messages\/[A-Za-z0-9_-]+\/audio$/.test(path)) throw new Error('Endereço de áudio inválido.');
    return { uri: SITE + path, headers: { Authorization: 'Bearer ' + this.token } };
  }
}
