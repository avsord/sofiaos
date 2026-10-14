import {isMercadoLivreUrl} from './price-provider';
import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {buildInjectedScript, parsePriceMessage, buildLinksScript, parseLinksMessage} from './price-extractor';
import type {PriceReaderMessage, LinksReaderMessage} from './price-extractor';
import {readerUrl, readerAgent} from './monitoring';
import {setMercadoLivrePageReader, type DevicePage} from './mercado-livre-device';

// Uma única WebView invisível atende o app inteiro, uma página por vez.
// Telas pedem leituras com readPrice()/readLinks(); o <PriceReaderHost/>
// (montado nos serviços de fundo) executa a fila. Sem host montado, a
// leitura falha com mensagem clara em vez de ficar pendurada.
type Job =
  | {id: number; kind: 'price'; url: string; resolve: (m: PriceReaderMessage) => void}
  | {id: number; kind: 'links'; url: string; target: string; exclude: string; terms: string; resolve: (m: LinksReaderMessage) => void}
  // Mercado Livre: so copia o bloco de dados da pagina (__NORDIC_RENDERING_CTX__). Nada de
  // preco interpretado aqui; a extracao estrita continua no servidor.
  | {id: number; kind: 'ml-state'; url: string; resolve: (m: DevicePage) => void};

const TIMEOUT_MS = 26000;
// Navegador de celular comum: algumas lojas recusam ou mudam a página quando
// percebem a WebView padrão do Android.
export const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
export const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const queue: Job[] = [];
let current: Job | null = null, seq = 0, hosts = 0, startedAt = 0;
// Diagnóstico: só domínio, tempo e resultado de cada página — nunca o link
// completo nem o conteúdo da página.
type ReadLog = {at: number; kind: 'price' | 'links' | 'ml-state'; host: string; ms: number; ok: boolean; error?: string; links?: number; anchors?: number; blocked?: boolean; tries?: number};
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
function finish(job: Job, message: PriceReaderMessage | LinksReaderMessage | DevicePage) {
  if (current !== job) return;
  current = null;
  const ok = message.ok, error = message.ok ? undefined : ('error' in message ? message.error : message.code).slice(0, 80);
  totals.jobs++; if (ok) totals.ok++; else { totals.failed++; if (/a tempo/.test(error || '')) totals.timeouts++; }
  const extra = message.ok && 'links' in message ? {links: message.links.length, anchors: message.anchors, blocked: message.blocked, tries: message.tries} : {};
  log.push({at: Date.now(), kind: job.kind, host: hostOnly(job.url), ms: Date.now() - startedAt, ok, ...(error ? {error} : {}), ...extra});
  if (log.length > 60) log.shift();
  (job.resolve as (m: typeof message) => void)(message);
  emit();
  setTimeout(next, 250);
}
function enqueue(job: Job) {
  if (!hosts) {
    totals.noHost++;
    if (job.kind === 'ml-state') { job.resolve({ok: false, code: 'READER_NOT_MOUNTED'}); return; }
    (job.resolve as (m: {ok: false; error: string}) => void)({ok: false, error: 'O leitor de páginas ainda não está pronto. Tente de novo em alguns segundos.'}); return;
  }
  queue.push(job);
  next();
}
function cancel(job: Job, message: PriceReaderMessage | LinksReaderMessage | DevicePage) {
  const i = queue.indexOf(job);
  if (i >= 0) { queue.splice(i, 1); (job.resolve as (m: typeof message) => void)(message); return; }
  finish(job, message);
}

export function readPrice(url: string): Promise<PriceReaderMessage> {
  if (isMercadoLivreUrl(url)) return Promise.resolve({ok: false, error: 'Mercado Livre é lido pelo servidor, nunca pela WebView.'});
  // O link guardado não muda; só o endereço aberto pelo leitor é limpo/ajustado por loja.
  const target = readerUrl(url);
  return new Promise(resolve => enqueue({id: ++seq, kind: 'price', url: target, resolve}));
}
export function readLinks(url: string, target: string, exclude: string, terms = ''): Promise<LinksReaderMessage> {
  if (isMercadoLivreUrl(url)) return Promise.resolve({ok: false, error: 'A busca de links do Mercado Livre não usa navegação automática.'});
  return new Promise(resolve => enqueue({id: ++seq, kind: 'links', url, target, exclude, terms, resolve}));
}
export function readerBusy() { return !!current || queue.length > 0; }

/** Mercado Livre com navegador de verdade (JS ligado), invisivel. Testado: o ML entrega
 * a pagina a um Chrome anonimo e recusa fetch de texto. A pagina tenta abrir o app do
 * ML (meli://, intent://): a regra de navegacao abaixo so deixa http(s) do proprio ML. */
export function readMercadoLivreState(url: string, signal?: AbortSignal): Promise<DevicePage> {
  if (!isMercadoLivreUrl(url)) return Promise.resolve({ok: false, code: 'UNSUPPORTED_HOST'});
  if (signal?.aborted) return Promise.resolve({ok: false, code: 'CANCELLED'});
  return new Promise(resolve => {
    const job: Job = {id: ++seq, kind: 'ml-state', url: String(url).trim().replace(/^http:\/\//i, 'https://'), resolve: m => { signal?.removeEventListener?.('abort', onAbort); resolve(m); }};
    const onAbort = () => cancel(job, {ok: false, code: 'CANCELLED'});
    signal?.addEventListener?.('abort', onAbort);
    enqueue(job);
  });
}
setMercadoLivrePageReader(readMercadoLivreState);

const ML_HOST = /^https:\/\/(?:[a-z0-9-]+\.)*mercadoli(?:vre|bre)\.com(?:\.[a-z]{2})?(?:[\/?#]|$)/i;
/** http(s) apenas. Leituras comuns nunca navegam para o ML; a leitura do ML so navega dentro do ML. */
export function allowNavigation(job: {kind: Job['kind']} | null, url: string) {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return false;
  if (job?.kind === 'ml-state') return ML_HOST.test(u);
  return !isMercadoLivreUrl(u);
}
/** Roda dentro da pagina: copia o <script id="__NORDIC_RENDERING_CTX__"> e a URL final. */
export function buildMercadoLivreStateScript() {
  return `(function(){var tries=0;function send(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function verify(){var p=location.pathname||'';return /\\/(jms|login|registration|account-verification|captcha|security|challenge)/i.test(p)||/recaptcha|captcha/i.test(document.body?document.body.innerHTML.slice(0,20000):'');}
function tick(){var el=document.getElementById('__NORDIC_RENDERING_CTX__');
if(el&&el.textContent&&el.textContent.length>200){send({kind:'ml-state',ok:true,html:'<script id="__NORDIC_RENDERING_CTX__">'+el.textContent+'</script>',finalUrl:location.href});return;}
if(verify()){send({kind:'ml-state',ok:false,code:'VERIFICATION_REQUIRED',finalUrl:location.href});return;}
if(++tries>40){send({kind:'ml-state',ok:false,code:'STATE_NOT_FOUND',finalUrl:location.href});return;}
setTimeout(tick,250);}tick();})();true;`;
}
export function parseMercadoLivreStateMessage(raw: string): DevicePage {
  try {
    const m = JSON.parse(String(raw || ''));
    if (!m || m.kind !== 'ml-state') return {ok: false, code: 'STATE_NOT_FOUND'};
    if (m.ok === true && typeof m.html === 'string' && m.html.length > 200 && m.html.length < 6_000_000 && typeof m.finalUrl === 'string' && ML_HOST.test(m.finalUrl)) return {ok: true, html: m.html, finalUrl: m.finalUrl};
    return {ok: false, code: typeof m.code === 'string' && /^[A-Z_]{3,40}$/.test(m.code) ? m.code : 'STATE_NOT_FOUND'};
  } catch { return {ok: false, code: 'STATE_NOT_FOUND'}; }
}

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
    const t = setTimeout(() => finish(job, job.kind === 'ml-state' ? {ok: false, code: 'TIMEOUT'} : {ok: false, error: 'A loja não respondeu a tempo.'}), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [job]);
  if (!job) return null;
  // Carregado sob demanda: a WebView nativa não entra na abertura do app.
  const WebView = require('react-native-webview').default;
  const script = job.kind === 'price' ? buildInjectedScript() : job.kind === 'ml-state' ? buildMercadoLivreStateScript() : buildLinksScript(job.target, job.exclude, job.terms);
  const fail = (code: string, error: string) => finish(job, job.kind === 'ml-state' ? {ok: false, code} : {ok: false, error});
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{position: 'absolute', width: 2, height: 2, left: -10, top: -10, opacity: 0, overflow: 'hidden'}}>
      <WebView
        key={job.id}
        source={{uri: job.url}}
        injectedJavaScript={script}
        javaScriptEnabled
        // Mercado Livre: versao de COMPUTADOR, a mesma do HTML real em que o conversor foi
        // validado. Com agente de celular o ML entrega a pagina mobile, com os dados em outro formato.
        userAgent={job.kind === 'ml-state' || readerAgent(job.url) === 'desktop' ? DESKTOP_AGENT : USER_AGENT}
        // Página de loja tenta abrir o app dela (intent://, meli://, aliexpress://...).
        // A leitura é invisível: só http(s) carrega, o resto é recusado em silêncio.
        // IMPORTANTE: a biblioteca manda qualquer link FORA desta lista para Linking.openURL —
        // era isso que abria o app do Mercado Livre (meli://, intent://). Com '*' tudo passa
        // pela regra de baixo, que só deixa carregar http(s) e recusa o resto em silêncio.
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(req: any) => allowNavigation(job, String(req?.url || ''))}
        javaScriptCanOpenWindowsAutomatically={false}
        // Mesmos cookies da página aberta à mão em 'Ver a página que a Sofia lê':
        // verificação ou aceite feitos lá passam a valer para a leitura escondida.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsLinkPreview={false}
        domStorageEnabled
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction
        onMessage={(e: any) => finish(job, job.kind === 'price' ? parsePriceMessage(e.nativeEvent.data) : job.kind === 'ml-state' ? parseMercadoLivreStateMessage(e.nativeEvent.data) : parseLinksMessage(e.nativeEvent.data))}
        onError={() => fail('NETWORK', 'Não consegui abrir essa página.')}
        onHttpError={(e: any) => { const st = e.nativeEvent.statusCode; if (st >= 400) fail(st === 429 ? 'RATE_LIMITED' : st === 401 ? 'VERIFICATION_REQUIRED' : st === 403 ? 'BLOCKED' : 'HTTP_ERROR', 'A loja recusou o acesso (' + st + ').'); }}
      />
    </View>
  );
}
