// Avisos com o app FECHADO, sem Firebase: o Android acorda a Sofia em
// segundo plano (WorkManager, a cada ~15 min no mínimo, quando o sistema
// deixa), ela pergunta ao servidor se há avisos novos (e-mail importante,
// preço, finanças…) e mostra como notificação do celular. Na primeira vez só
// marca o que já existe como visto, para não despejar avisos antigos.
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AUTH_STORAGE_KEY} from './startup-read-ahead';

export const BG_TASK = 'sofia-notice-check';
const SEEN_KEY = 'sofia.native.bg-notice-seen.v1', CHANNEL = 'sofia-avisos', MAX_SEEN = 400, MAX_SHOWN = 4;
const BASE = String(process.env.EXPO_PUBLIC_API_URL || 'https://sofiaos.up.railway.app').replace(/\/$/, '');

type Notice = {id: string; title: string; body: string; state: string; category?: string; entity_id?: string; created_at: string};
export type Deps = {
  auth: () => Promise<string | null>; fetch: typeof fetch; get: (k: string) => Promise<string | null>; set: (k: string, v: string) => Promise<void>;
  notify: (n: {title: string; body: string; data: Record<string, unknown>}) => Promise<void>;
};
const realDeps: Deps = {
  auth: () => SecureStore.getItemAsync(AUTH_STORAGE_KEY),
  fetch: (...a) => fetch(...a),
  get: k => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v),
  notify: async n => {
    await Notifications.setNotificationChannelAsync(CHANNEL, {name: 'Avisos da Sofia', importance: Notifications.AndroidImportance.HIGH, sound: 'default'}).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({content: {title: n.title, body: n.body, sound: 'default', data: n.data}, trigger: {channelId: CHANNEL} as any});
  },
};

/** Uma rodada: devolve quantos avisos novos foram mostrados (ou -1 sem login). */
export async function checkNoticesOnce(deps: Deps = realDeps): Promise<number> {
  const raw = await deps.auth();
  if (!raw) return -1;
  let token = '';
  try { const a = JSON.parse(raw); if (a.expires_at && Date.parse(a.expires_at) < Date.now()) return -1; token = a.token; } catch { return -1; }
  const res = await deps.fetch(BASE + '/api/mobile/notifications', {headers: {Authorization: 'Bearer ' + token}});
  if (!res.ok) return 0;
  const data = await res.json() as {items?: Notice[]};
  const unread = (data.items || []).filter(n => n && n.state === 'unread' && n.id);
  const seenRaw = await deps.get(SEEN_KEY);
  const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
  const fresh = unread.filter(n => !seen.includes(n.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const next = [...seen, ...unread.map(n => n.id)].filter((v, i, all) => all.indexOf(v) === i).slice(-MAX_SEEN);
  await deps.set(SEEN_KEY, JSON.stringify(next));
  if (seenRaw === null) return 0; // primeira vez: não despeja o que já existia
  const shown = fresh.slice(-MAX_SHOWN);
  for (const n of shown) await deps.notify({title: n.title, body: n.body, data: {sofiaServerNotice: true, noticeId: n.id, category: n.category || '', entityId: n.entity_id || ''}});
  if (fresh.length > shown.length) await deps.notify({title: 'Sofia', body: `E mais ${fresh.length - shown.length} avisos. Abra o sino para ver.`, data: {sofiaServerNotice: true}});
  return fresh.length;
}

/** O app aberto já mostrou estes avisos no sino: não repetir como notificação depois. */
export async function markNoticesSeen(ids: string[]) {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (raw === null) return; // deixa a primeira rodada em segundo plano fazer a base
    const seen: string[] = JSON.parse(raw);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...ids].filter((v, i, all) => all.indexOf(v) === i).slice(-MAX_SEEN)));
  } catch { /* opcional */ }
}

try {
  TaskManager.defineTask(BG_TASK, async () => {
    try { await checkNoticesOnce(); return BackgroundTask.BackgroundTaskResult.Success; }
    catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  });
} catch { /* ambiente de teste */ }

export async function registerBackgroundNotices(): Promise<boolean> {
  try {
    if (await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!await TaskManager.isTaskRegisteredAsync(BG_TASK)) await BackgroundTask.registerTaskAsync(BG_TASK, {minimumInterval: 15});
    await checkNoticesOnce().catch(() => 0); // cria a base de "já vistos" logo no primeiro uso
    return true;
  } catch { return false; }
}
