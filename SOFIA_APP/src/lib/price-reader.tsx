import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {buildInjectedScript, parsePriceMessage, buildLinksScript, parseLinksMessage} from './price-extractor';
import type {PriceReaderMessage, LinksReaderMessage} from './price-extractor';

// Uma única WebView invisível atende o app inteiro, uma página por vez.
// Telas pedem leituras com readPrice()/readLinks(); o <PriceReaderHost/>
// (montado nos serviços de fundo) executa a fila. Sem host montado, a
// leitura falha com mensagem clara em vez de ficar pendurada.
type Job =
  | {id: number; kind: 'price'; url: string; resolve: (m: PriceReaderMessage) => void}
  | {id: number; kind: 'links'; url: string; target: string; exclude: string; resolve: (m: LinksReaderMessage) => void};

const TIMEOUT_MS = 20000;
const queue: Job[] = [];
let current: Job | null = null, seq = 0, hosts = 0, startedAt = 0;
// Diagnóstico: só domínio, tempo e resultado de cada página — nunca o link
// completo nem o conteúdo da página.
type ReadLog = {at: number; kind: 'price' | 'links'; host: string; ms: number; ok: boolean; error?: string};
const log: ReadLog[] = [];
let totals = {jobs: 0, ok: 0, failed: 0, timeouts: 0, noHost: 0};
const hostOnly = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return '?'; } };
export function readerDiagnostics() {
  return {hostMounted: hosts > 0, queue: queue.length, busy: current ? {kind: current.kind, host: hostOnly(current.url), forMs: Date.now() - startedAt} : null, totals: {...totals}, recent: log.slice(-25)};
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function next() {
  if (current || !queue.length || !hosts) return;
  current = queue.shift()!;
  startedAt = Date.now();
  emit();
}
function finish(job: Job, message: PriceReaderMessage | LinksReaderMessage) {
  if (current !== job) return;
  current = null;
  const ok = message.ok, error = message.ok ? undefined : message.error.slice(0, 80);
  totals.jobs++; if (ok) totals.ok++; else { totals.failed++; if (/a tempo/.test(error || '')) totals.timeouts++; }
  log.push({at: Date.now(), kind: job.kind, host: hostOnly(job.url), ms: Date.now() - startedAt, ok, ...(error ? {error} : {})});
  if (log.length > 60) log.shift();
  (job.resolve as (m: typeof message) => void)(message);
  emit();
  setTimeout(next, 250);
}
function enqueue(job: Job) {
  if (!hosts) { totals.noHost++; (job.resolve as (m: {ok: false; error: string}) => void)({ok: false, error: 'O leitor de páginas ainda não está pronto. Tente de novo em alguns segundos.'}); return; }
  queue.push(job);
  next();
}

export function readPrice(url: string): Promise<PriceReaderMessage> {
  return new Promise(resolve => enqueue({id: ++seq, kind: 'price', url, resolve}));
}
export function readLinks(url: string, target: string, exclude: string): Promise<LinksReaderMessage> {
  return new Promise(resolve => enqueue({id: ++seq, kind: 'links', url, target, exclude, resolve}));
}
export function readerBusy() { return !!current || queue.length > 0; }

export function PriceReaderHost() {
  const [, tick] = useState(0);
  useEffect(() => {
    hosts++;
    const l = () => tick(n => n + 1);
    listeners.add(l);
    next();
    return () => { listeners.delete(l); hosts--; };
  }, []);
  const job = current;
  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => finish(job, {ok: false, error: 'A loja não respondeu a tempo.'}), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [job]);
  if (!job) return null;
  // Carregado sob demanda: a WebView nativa não entra na abertura do app.
  const WebView = require('react-native-webview').default;
  const script = job.kind === 'price' ? buildInjectedScript() : buildLinksScript(job.target, job.exclude);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{position: 'absolute', width: 2, height: 2, left: -10, top: -10, opacity: 0, overflow: 'hidden'}}>
      <WebView
        key={job.id}
        source={{uri: job.url}}
        injectedJavaScript={script}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        onMessage={(e: any) => finish(job, job.kind === 'price' ? parsePriceMessage(e.nativeEvent.data) : parseLinksMessage(e.nativeEvent.data))}
        onError={() => finish(job, {ok: false, error: 'Não consegui abrir essa página.'})}
        onHttpError={(e: any) => { if (e.nativeEvent.statusCode >= 400) finish(job, {ok: false, error: 'A loja recusou o acesso (' + e.nativeEvent.statusCode + ').'}); }}
      />
    </View>
  );
}
