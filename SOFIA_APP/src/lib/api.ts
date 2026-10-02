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
  try { const p = JSON.parse(await AsyncStorage.getItem(PREFS_KEY) || '{}'); return { appearance: ['system','light','dark'].includes(p.appearance) ? p.appearance : 'system', enterToSend: p.enterToSend === true, autoSendVoice: p.autoSendVoice !== false }; }
  catch { return { appearance: 'system', enterToSend: false, autoSendVoice: true }; }
}
export function savePrefs(p: Prefs) { return AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public data?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
}
export class SofiaApi {
  constructor(private token = '', private onExpired: () => void = () => {}) {}
  private async request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', timeout = 20000): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(SITE + '/api/mobile' + path, { method, signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
      let data: Record<string, any>;
      try { data = await response.json(); } catch { throw new ApiError('O servidor não retornou dados válidos. A API móvel da Sofia precisa estar publicada.', 'INVALID_RESPONSE', response.status); }
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
      if (!response.ok && path === '/auth/login' && (response.status === 404 || response.status === 405 || data.code === 'AUTH_REQUIRED')) throw new ApiError('O servidor ainda precisa receber a API móvel da Sofia. Não é um erro da sua senha.', 'MOBILE_API_NOT_PUBLISHED', response.status);
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
  newConversation(title = 'Conversa com a Sofia') { return this.request<{conversation: Conversation}>('/conversations', {title}); }
  deleteMessage(id: string) { return this.request<{ok:boolean;id:string;conversation_id:string}>('/messages/' + encodeURIComponent(id), {}, 'DELETE'); }
  clearChatHistory() { return this.request<{ok:boolean;conversations:number;messages:number}>('/chat-history', {}, 'DELETE'); }
  history(id: string, before?: number) { return this.request<MessagePage>(`/conversations/${encodeURIComponent(id)}${before ? '?before=' + before : ''}`); }
  chat(data: object) { return this.request<ChatResult>('/messages', data, 'POST', 180000); }
  audio(data: object) { return this.request<ChatResult>('/messages/audio', data, 'POST', 180000); }
  home() { return this.request<HomeData>('/home'); }
  tasks() { return this.request<{items: Task[]}>('/tasks'); }
  taskState(task: Task, state: 'done' | 'todo') { return this.request<{item: Task}>('/tasks/' + encodeURIComponent(task.id), { state, revision: task.revision }, 'PATCH'); }
  saveTask(task: Partial<Task>) { return this.request<{item: Task}>('/tasks' + (task.id ? '/' + encodeURIComponent(task.id) : ''), task, task.id ? 'PATCH' : 'POST'); }
  deleteTask(id: string) { return this.request<{ok: boolean}>('/tasks/' + encodeURIComponent(id), undefined, 'DELETE'); }
  agenda() { return this.request<{items: AgendaItem[]}>('/agenda'); }
  createEvent(title: string, start_at: string) { return this.request<{item: AgendaItem}>('/agenda', { title, start_at }); }
  notifications() { return this.request<{items: Notice[]; push_enabled: boolean}>('/notifications'); }
  markRead(id: string) { return this.request<{ok: boolean}>('/notifications/' + encodeURIComponent(id) + '/read', {}); }
  profile(name: string) { return this.request<{profile: Profile}>('/profile', {name}, 'PATCH'); }
  catalog() { return this.request<Catalog>('/workspace/catalog'); }
  entities(kind: string, q = '', offset = 0) { return this.request<{items: Entity[]}>('/workspace/entities?limit=100&kind=' + encodeURIComponent(kind) + '&q=' + encodeURIComponent(q) + '&offset=' + offset); }
  entity(id: string) { return this.request<Entity>('/workspace/entities/' + encodeURIComponent(id)); }
  saveEntity(input: Partial<Entity>) { return this.request<Entity>('/workspace/entities' + (input.id ? '/' + encodeURIComponent(input.id) : ''), input, input.id ? 'PATCH' : 'POST'); }
  deleteEntity(id: string) { return this.request<{ok: boolean}>('/workspace/entities/' + encodeURIComponent(id), undefined, 'DELETE'); }
  uploadAttachment(id:string,input:{name:string;mime:string;base64:string}) { return this.request<{id:string}>('/workspace/entities/'+encodeURIComponent(id)+'/attachments',input,'POST',60000); }
  attachmentSource(id:string) { if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Imagem inválida.');return {uri:SITE+'/api/mobile/workspace/attachments/'+encodeURIComponent(id)+'?inline=1',headers:{Authorization:'Bearer '+this.token}}; }
  entityAction(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/action', input); }
  observations(id: string) { return this.request<{items: any[]}>('/workspace/entities/' + encodeURIComponent(id) + '/observations'); }
  observe(id: string, input: object) { return this.request<any>('/workspace/entities/' + encodeURIComponent(id) + '/observations', input); }
  integrations() { return this.request<{items: {name:string;key:string;status:string;description:string;connect_url?:string}[]}>('/workspace/integrations'); }
  audioSource(path: string) {
    if (!/^\/api\/mobile\/messages\/[A-Za-z0-9_-]+\/audio$/.test(path)) throw new Error('Endereço de áudio inválido.');
    return { uri: SITE + path, headers: { Authorization: 'Bearer ' + this.token } };
  }
}
