import * as Notifications from 'expo-notifications';
import type {SofiaApi} from './api';
import type {Entity} from './types';
import {buildProduct, storesDue, pickAutomatic, readMemory, alertReasons, money} from './monitoring';
import type {ProductSeries, Candidate} from './monitoring';
import {readPrice, readerDiagnostics} from './price-reader';
import {notificationScope} from './bell-inbox';

export type StoreIssue = {kind: 'failed'; error: string; at: number} | {kind: 'confirm'; candidates: Candidate[]; title: string; at: number};
type State = {running: boolean; done: number; total: number; label: string; issues: Record<string, StoreIssue>; lastRun: number | null; epoch: number};
const state: State = {running: false, done: 0, total: 0, label: '', issues: {}, lastRun: null, epoch: 0};
const listeners = new Set<() => void>();
const emit = () => { state.epoch++; listeners.forEach(l => l()); };
export function collectorState(): State { return state; }

// ---- Diagnóstico (vai no relatório do painel: Perfil → 5 toques na versão) ----
type Outcome = {at: number; monitor: string; host: string; result: 'gravado' | 'confirmar' | 'falhou' | 'sem-preco' | 'moeda-diferente' | 'erro-ao-salvar'; amount?: number; origins?: string[]; candidates?: number; needsConfirmation?: boolean; error?: string};
const outcomes: Outcome[] = [];
const runs: Array<{at: number; ms: number; trigger: string; products: number; due: number; done: number; error?: string}> = [];
let lastProducts: ProductSeries[] = [];
const short = (id: string) => id.slice(0, 8);
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '?'; } };
function note(o: Outcome) { outcomes.push(o); if (outcomes.length > 60) outcomes.shift(); }
export function monitorDiagnostics(now = Date.now()) {
  return {
    collector: {running: state.running, done: state.done, total: state.total, lastRunAgoMin: state.lastRun ? Math.round((now - state.lastRun) / 60000) : null,
      pendingIssues: Object.entries(state.issues).map(([k, v]) => ({monitor: short(k.split('|')[0]), host: hostOf(k.split('|').slice(1).join('|')), kind: v.kind, ...(v.kind === 'failed' ? {error: v.error.slice(0, 80)} : {candidates: v.candidates.length}), agoMin: Math.round((now - v.at) / 60000)}))},
    reader: readerDiagnostics(),
    products: lastProducts.map(p => ({id: short(p.monitor.id), state: p.monitor.state, interval: Number(p.monitor.data?.interval_minutes) || 360,
      alerts: {newLow: !!p.monitor.data?.new_low, drop: p.monitor.data?.drop_percent || null, target: !!p.monitor.data?.target_price},
      memory: Object.keys((() => { try { return JSON.parse(String(p.monitor.data?.reader_memory || '{}')); } catch { return {}; } })()).length,
      stores: p.stores.map(s => ({host: s.host, primary: s.primary, readings: s.points.length, lastAgoMin: s.last ? Math.round((now - s.last.at) / 60000) : null})),
      bestPoints: p.best.length, hasNow: !!p.now, atLow: p.atLow})),
    runs: runs.slice(-15), outcomes: outcomes.slice(-40),
  };
}
export function onCollector(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function clearIssue(url: string) { delete state.issues[url]; emit(); }
export function issueKey(monitorId: string, url: string) { return monitorId + '|' + url; }

const CHANNEL = 'sofia-monitor';
let channelReady = false;
async function notify(scope: string, product: ProductSeries, storeName: string, total: number, reasons: string[]) {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    if (!channelReady) { await Notifications.setNotificationChannelAsync(CHANNEL, {name: 'Monitoramento de preços', importance: Notifications.AndroidImportance.HIGH, sound: 'default'}); channelReady = true; }
    const first = reasons[0];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: product.monitor.title + ' · ' + money(total, product.currency),
        body: first.charAt(0).toUpperCase() + first.slice(1) + ' na ' + storeName + (reasons.length > 1 ? ' — e também ' + reasons.slice(1).join(', ') : '') + '.',
        sound: 'default',
        data: {sofiaMonitor: true, scope: notificationScope(scope), monitorId: product.monitor.id},
      },
      trigger: {channelId: CHANNEL} as any,
    });
  } catch { /* aviso local é extra: o servidor já registra a oportunidade no sino */ }
}

export async function loadProducts(api: SofiaApi): Promise<ProductSeries[]> {
  const monitors: Entity[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await api.entities('monitor', '', offset);
    monitors.push(...r.items);
    if (r.items.length < 100) break;
  }
  return productsFrom(api, monitors);
}

/** Monta as séries a partir dos monitores já listados. Um monitor com erro
 * entra sem histórico, nunca derruba os outros. */
export async function productsFrom(api: SofiaApi, all: Entity[]): Promise<ProductSeries[]> {
  const monitors = all.filter(e => e.state !== 'archived' && e.data?.method === 'product')
    .sort((a, b) => String((a as any).created_at || '').localeCompare(String((b as any).created_at || '')));
  const out: ProductSeries[] = [];
  // Um pedido só para todos os produtos; servidor antigo cai no modo um-por-um.
  let bundle: Record<string, any[]> | null = null;
  if (monitors.length > 1) { try { bundle = (await api.monitorObservations()).items; } catch { bundle = null; } }
  for (let i = 0; i < monitors.length; i++) {
    if (bundle) { out.push(buildProduct(monitors[i], bundle[monitors[i].id] || [], i)); continue; }
    try { const o = await api.observations(monitors[i].id); out.push(buildProduct(monitors[i], o.items, i)); }
    catch { out.push(buildProduct(monitors[i], [], i)); }
  }
  lastProducts = out;
  return out;
}

/** Grava uma leitura confirmada (pela página ou pelo usuário). */
export async function recordPrice(api: SofiaApi, monitor: Entity, url: string, amount: number, scope = '', rows?: Record<string, any>[], storeName = '') {
  const at = new Date().toISOString();
  const history = rows ?? (await api.observations(monitor.id).then(r => r.items).catch(() => []));
  const reasons = alertReasons(monitor, history, url, amount);
  await api.observe(monitor.id, {price: amount, shipping: 0, variant: monitor.data.variant, currency: monitor.data.currency || 'BRL', source: url, source_key: url.slice(0, 120) + '|' + at, observed_at: at});
  if (reasons.length && scope) await notify(scope, buildProduct(monitor, history), storeName || url, amount, reasons);
}

/** Lê, uma loja por vez, só o que venceu o intervalo de cada produto.
 * Nunca roda duas vezes ao mesmo tempo. */
export async function runCollection(api: SofiaApi, opts: {force?: boolean; scope?: string; only?: string; trigger?: string} = {}): Promise<void> {
  if (state.running) return;
  const began = Date.now(), run = {at: began, ms: 0, trigger: opts.trigger || (opts.force ? 'manual' : 'automatica') + (opts.only ? ':um-produto' : ''), products: 0, due: 0, done: 0} as (typeof runs)[number];
  state.running = true; state.done = 0; state.total = 0; state.label = 'Preparando…'; emit();
  try {
    const products = (await loadProducts(api)).filter(p => !opts.only || p.monitor.id === opts.only);
    const jobs = products.flatMap(p => storesDue(p, Date.now(), !!opts.force).map(s => ({p, s})));
    state.total = jobs.length; run.products = products.length; run.due = jobs.length; emit();
    for (const {p, s} of jobs) {
      state.label = s.name + ' · ' + p.monitor.title; emit();
      const key = issueKey(p.monitor.id, s.url);
      const read = await readPrice(s.url);
      const base = {at: Date.now(), monitor: short(p.monitor.id), host: s.host};
      if (!read.ok) { state.issues[key] = {kind: 'failed', error: read.error, at: Date.now()}; note({...base, result: 'falhou', error: read.error.slice(0, 80)}); }
      else {
        const pick = pickAutomatic(read.result, readMemory(p.monitor)[s.url]);
        const meta = {candidates: read.result.candidates.length, needsConfirmation: read.result.needsConfirmation, origins: (pick || read.result.best)?.origins?.slice(0, 3)};
        if (pick && (!pick.currency || pick.currency === (p.monitor.data.currency || 'BRL'))) {
          try {
            const rows = await api.observations(p.monitor.id).then(r => r.items);
            await recordPrice(api, p.monitor, s.url, pick.amount, opts.scope, rows, s.name);
            delete state.issues[key]; note({...base, ...meta, result: 'gravado', amount: pick.amount});
          } catch (e: any) { state.issues[key] = {kind: 'failed', error: String(e?.message || 'Não consegui salvar a leitura.'), at: Date.now()}; note({...base, ...meta, result: 'erro-ao-salvar', error: String(e?.message || '').slice(0, 80)}); }
        } else if (pick) { note({...base, ...meta, result: 'moeda-diferente', amount: pick.amount}); state.issues[key] = {kind: 'failed', error: 'A loja mostrou o preço em outra moeda (' + pick.currency + ').', at: Date.now()}; }
        else if (read.result.candidates.length) { state.issues[key] = {kind: 'confirm', candidates: read.result.candidates, title: read.title, at: Date.now()}; note({...base, ...meta, result: 'confirmar'}); }
        else { state.issues[key] = {kind: 'failed', error: 'A página abriu, mas não mostrou preço.', at: Date.now()}; note({...base, ...meta, result: 'sem-preco'}); }
      }
      state.done++; run.done = state.done; emit();
    }
  } catch (e: any) { run.error = String(e?.message || e).slice(0, 80); /* sem rede: tenta de novo na próxima rodada */ }
  finally { run.ms = Date.now() - began; runs.push(run); if (runs.length > 30) runs.shift(); state.running = false; state.label = ''; state.lastRun = Date.now(); emit(); }
}
