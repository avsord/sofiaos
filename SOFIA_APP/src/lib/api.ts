export type CalendarState={configured:boolean;connected:boolean;syncing?:boolean;last_sync?:string;error?:string;calendar_name?:string;calendar_id?:string;warnings?:string[];conflicts?:{id:string;reason:string}[];calendars?:{id:string;summary:string;accessRole:string}[]};
import {themeTimes} from './theme-schedule';
import {agendaChanged} from './agenda-events';
import {LegacyMdAdapter} from './legacy-md';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Auth, Bootstrap, Conversation, MessagePage, ChatResult, HomeData, Task, AgendaItem, Notice, Profile, Prefs, Catalog, Entity, ChatSnapshot } from './types';
const rawBase = (process.env.EXPO_PUBLIC_API_URL || 'https://sofiaos.up.railway.app').replace(/\/+$/, '');
const parsedBase = new URL(rawBase);
if (parsedBase.protocol !== 'https:' || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash || parsedBase.pathname !== '/') throw new Error('Configure a raiz HTTPS do servidor Sofia.');
export const SITE = rawBase;
const AUTH_KEY = 'sofia.native.session.v1', PREFS_KEY = 'sofia.native.preferences.v1';
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export async function readAuth(): Promise<Auth | null> {
  const raw = await SecureStore.getItemAsync(AUTH_KEY);
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (typeof a.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(a.token) || !Number.isFinite(Date.parse(a.expires_at)) || Date.parse(a.expires_at) <= Date.now() || !a.profile) { await forgetAuth(); return null; } return a as Auth; }
  catch { await forgetAuth(); return null; }
}
export function saveAuth(auth: Auth) { return SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(auth), secureOptions); }
export function forgetAuth() { return SecureStore.deleteItemAsync(AUTH_KEY); }
export async function readPrefs(): Promise<Prefs> {
  try { const p = JSON.parse(await AsyncStorage.getItem(PREFS_KEY) || '{}'); return { appearance: ['system','light','dark','schedule'].includes(p.appearance) ? p.appearance : 'schedule', enterToSend: p.enterToSend === true, autoSendVoice: p.autoSendVoice !== false, ...themeTimes(p) }; }
  catch { return { appearance: 'schedule', enterToSend: false, autoSendVoice: true, lightAt:'05:00', darkAt:'19:00' }; }
}
export function savePrefs(p: Prefs) { return AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public data?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
}
export class SofiaApi {
  private readonly md:LegacyMdAdapter;
  constructor(private token = '', private onExpired: () => void = () => {},scope='anonymous') {this.md=new LegacyMdAdapter(this.request.bind(this),AsyncStorage,scope);}
  get mdLocalOnly(){return this.md.localOnly;}
  private async request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', timeout = 20000): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(SITE + '/api/mobile' + path, { method, signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
      let data: Record<string, any>;
      try { data = await response.json(); } catch { throw new ApiError('O servidor não retornou dados válidos. A API móvel da Sofia precisa estar publicada.', 'INVALID_RESPONSE', response.status); }
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
      if (!response.ok) { if (response.status === 401 && path !== '/auth/login') this.onExpired(); throw new ApiError(data.error || 'Não foi possível concluir.', data.code || 'HTTP_ERROR', response.status, data); }
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError('A conexão demorou. Recarregue antes de reenviar: sua mensagem pode ter chegado.', 'TIMEOUT', 0);
      throw new ApiError('Sem conexão com a Sofia. Verifique a internet e tente novamente.', 'NETWORK', 0);
    } finally { clearTimeout(timer); }
  }
  login(email: string, password: string, device: string) { return this.request<Auth>('/auth/login', { email: email.trim(), password, device_name: device }); }
  bootstrap() { return this.request<Bootstrap>('/bootstrap'); }
  logout() { return this.request<{ok: boolean}>('/auth/logout', {}); }
  logoutAll() { return this.request<{ok: boolean}>('/auth/logout-all', {}); }
  changePassword(currentPassword: string,newPassword: string,confirmPassword: string) { return this.request<{ok: boolean}>('/auth/change-password', {currentPassword,newPassword,confirmPassword}); }
  syncChat(id?:string) { return this.request<ChatSnapshot>('/chat-sync'+(id?'?conversation_id='+encodeURIComponent(id):'')); }
  ensureChat() { return this.request<ChatSnapshot>('/chat-sync/current',{}); }
  selectChat(id:string) { return this.request<ChatSnapshot>('/chat-sync/select',{conversation_id:id}); }
  deleteChatMessages(id:string,ids:string[]) { return this.request<{deleted_ids:string[];failed:{id:string;error:string}[]}>('/chat-sync/delete',{conversation_id:id,ids}); }
  conversations(offset = 0) { return this.request<{items: Conversation[]; has_more: boolean; next_offset: number}>('/conversations?offset=' + offset); }
  dashboardWidgets(){return this.request<{widgets:string[]}>('/md/dashboard');}
  async saveDashboardWidgets(widgets:string[]){if(!await this.feature('dashboard_widgets'))throw new Error('A sincronização dos widgets aguarda a atualização do servidor. A organização anterior foi mantida.');return this.request<{widgets:string[]}>('/md/dashboard',{widgets},'PATCH');}
  async deleteConversations(ids:string[]) { if(!await this.feature('conversation_delete'))throw new Error('A exclusão de conversas aguarda a atualização do servidor. Nenhuma conversa foi apagada.');return this.request<{ok:boolean}>('/md/conversations',{ids},'DELETE'); }
  newConversation(title = 'Conversa com a Sofia') { return this.request<{conversation: Conversation}>('/conversations', {title}); }
  deleteMessage(id: string) { return this.request<{ok:boolean;id:string;conversation_id:string}>('/messages/' + encodeURIComponent(id), {}, 'DELETE'); }
  clearChatHistory() { return this.request<{ok:boolean;conversations:number;messages:number}>('/chat-history', {}, 'DELETE'); }
  history(id: string, before?: number) { return this.request<MessagePage>(`/conversations/${encodeURIComponent(id)}${before ? '?before=' + before : ''}`); }
  chat(data: object) { return this.request<ChatResult>('/messages', data, 'POST', 180000); }
  audio(data: object) { return this.request<ChatResult>('/messages/audio', data, 'POST', 180000); }
  home() { return this.request<HomeData>('/home'); }
  movePage(input:{id:string;revision:number;parentId:string;kind:string;anchorId:string}) { return this.md.move(input); }
  allNotifications(offset=0) { return this.md.notices(offset); }
  clearNotification(id:string) { return this.md.clear(id); }
  async calendarStatus():Promise<CalendarState> { if(!await this.md.supports())return {configured:false,connected:false}; return this.request<CalendarState>('/md/calendar/status'); }
  calendarConnect() { return this.request<{url:string}>('/md/calendar/connect',{}); }
  calendarDisconnect() { return this.request<{ok:boolean}>('/md/calendar/disconnect',{}); }
  calendarSync() { return this.request<{ok:boolean}>('/md/calendar/sync',{},'POST',90000); }
  calendarSelect(id:string) { return this.request<{ok:boolean}>('/md/calendar/select',{id}); }
  async feature(name:string):Promise<boolean>{try{const c=await this.request<Record<string,unknown>>('/md/capabilities');return c[name]===true;}catch(e){if((e as ApiError).status===404)return false;throw e;}}
  tasks() { return this.request<{items: Task[]}>('/tasks'); }
  taskState(task: Task, state: 'done' | 'todo') { return this.request<{item: Task}>('/tasks/' + encodeURIComponent(task.id), { state, revision: task.revision }, 'PATCH'); }
  saveTask(task: Partial<Task>) { return this.request<{item: Task}>('/tasks' + (task.id ? '/' + encodeURIComponent(task.id) : ''), task, task.id ? 'PATCH' : 'POST'); }
  deleteTask(id: string) { return this.request<{ok: boolean}>('/tasks/' + encodeURIComponent(id), undefined, 'DELETE'); }
  agenda(month?:string) { return this.request<{items: AgendaItem[];refresh_pending?:boolean}>('/agenda'+(month?'?month='+encodeURIComponent(month):'')); }
  createEvent(title: string, start_at: string) { return this.request<{item: AgendaItem}>('/agenda', { title, start_at }); }
  notifications() { return this.request<{items: Notice[]; push_enabled: boolean}>('/notifications'); }
  markRead(id: string) { return this.request<{ok: boolean}>('/notifications/' + encodeURIComponent(id) + '/read', {}); }
  profile(name: string) { return this.request<{profile: Profile}>('/profile', {name}, 'PATCH'); }
  catalog() { return this.request<Catalog>('/workspace/catalog'); }
  async entities(kind: string, q = '', offset = 0) { const result=await this.request<{items:Entity[]}>('/workspace/entities?limit=100&kind='+encodeURIComponent(kind)+'&q='+encodeURIComponent(q)+'&offset='+offset);return kind==='user_page'?{...result,items:await this.md.decorate(result.items)}:result; }
  library(q = '', offset = 0) { return this.request<{items:Entity[]}>('/workspace/entities?limit=100&group=library&q='+encodeURIComponent(q)+'&offset='+offset); }
  async entity(id: string) { const item=await this.request<Entity>('/workspace/entities/'+encodeURIComponent(id));return item.kind==='user_page'?(await this.md.decorate([item]))[0]:item; }
  async saveEntity(input: Partial<Entity>) { const body=input.data?await this.md.clean(input):input;const saved=await this.request<Entity>('/workspace/entities'+(input.id?'/'+encodeURIComponent(input.id):''),body,input.id?'PATCH':'POST');if(['commitment','reminder'].includes(saved.kind))agendaChanged(this);return saved.kind==='user_page'?(await this.md.decorate([saved]))[0]:saved; }
  async deleteEntity(id: string) { const result=await this.request<{ok: boolean}>('/workspace/entities/' + encodeURIComponent(id), undefined, 'DELETE');agendaChanged(this);return result; }
  uploadAttachment(id:string,input:{name:string;mime:string;base64:string}) { return this.request<{id:string}>('/workspace/entities/'+encodeURIComponent(id)+'/attachments',input,'POST',60000); }
  attachmentSource(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Imagem inválida.');return {uri:SITE+'/api/mobile/workspace/attachments/'+encodeURIComponent(id)+'?inline=1',headers:{Authorization:'Bearer '+this.token}}; }
  entityAction(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/action', input); }
  async libraryOrganization(){const items:Entity[]=[];for(let offset=0;;offset+=100){const page=await this.request<{items:Entity[]}>('/workspace/entities?group=library&limit=100&offset='+offset);items.push(...page.items);if(page.items.length<100)return {items};}}
  observations(id: string) { return this.request<{items: any[];status?:{last_at:string|null;last_error:string|null;next_at:string|null}}>('/workspace/entities/' + encodeURIComponent(id) + '/observations'); }
  observe(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/observations', input); }
  integrations() { return this.request<{items: {name:string;key:string;status:string;description:string;connect_url?:string}[]}>('/workspace/integrations'); }
  audioSource(path: string) {
    if (!/^\/api\/mobile\/messages\/[A-Za-z0-9_-]+\/audio$/.test(path)) throw new Error('Endereço de áudio inválido.');
    return { uri: SITE + path, headers: { Authorization: 'Bearer ' + this.token } };
  }
}
