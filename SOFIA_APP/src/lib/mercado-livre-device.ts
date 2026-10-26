/** Leitura do Mercado Livre pelo CELULAR, como texto.
 *
 * Por que existe: o Mercado Livre manda para login/verificação os acessos que
 * vêm de servidores de data center (a Railway). Do celular, a conexão é a de
 * casa ou 4G e a página do produto vem normal.
 *
 * Regras (as mesmas do leitor do servidor):
 *  - só baixa TEXTO via fetch: nada de WebView, Linking.openURL ou intent;
 *  - só hosts do Mercado Livre, só HTTPS; login/verificação = falha, nunca contorno;
 *  - não interpreta preço aqui: recorta só o bloco __NORDIC_RENDERING_CTX__ e o
 *    servidor faz a extração estrita (anúncio + vendedor + preço conferidos).
 */
export type DevicePage = {ok: true; html: string; finalUrl: string} | {ok: false; code: string; finalUrl?: string};

const HOST = /^https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br(?:\/|$)|^https:\/\/(?:www\.)?mercadolivre\.com\/sec\//i;
const VERIFY = /\/(jms|login|registration|gz\/account-verification|account-verification|captcha|security|challenge)\b/i;
const BLOCK_START = /<script\b[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>/i;
const MAX_CHARS = 6_000_000;
const HEADERS = {
  // Versao de computador: mesmo formato do HTML em que o conversor foi validado.
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  'accept-language': 'pt-BR,pt;q=0.9',
};

function pathOf(url: string) {
  const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i.exec(url);
  return m?.[1] || '/';
}

export async function fetchMercadoLivrePage(
  url: string,
  {signal, fetchImpl = (globalThis as any).fetch, timeoutMs = 20000}: {signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number} = {}
): Promise<DevicePage> {
  const target = String(url || '').trim().replace(/^http:\/\//i, 'https://');
  if (!HOST.test(target)) return {ok: false, code: 'UNSUPPORTED_HOST'};
  if (typeof fetchImpl !== 'function') return {ok: false, code: 'NETWORK'};
  if (signal?.aborted) return {ok: false, code: 'CANCELLED'};
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener?.('abort', stop);
  try {
    let res: Response;
    try { res = await fetchImpl(target, {method: 'GET', headers: HEADERS, signal: controller.signal}); }
    catch { return {ok: false, code: signal?.aborted ? 'CANCELLED' : controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'}; }
    // O fetch do celular segue redirecionamentos sozinho: conferir ONDE terminou.
    const finalUrl = String((res as any).url || target);
    if (!HOST.test(finalUrl)) return {ok: false, code: 'UNSAFE_REDIRECT'};
    if (VERIFY.test(pathOf(finalUrl))) return {ok: false, code: 'VERIFICATION_REQUIRED'};
    if (res.status === 429) return {ok: false, code: 'RATE_LIMITED'};
    if (res.status === 401) return {ok: false, code: 'VERIFICATION_REQUIRED'};
    if (res.status === 403) return {ok: false, code: 'BLOCKED'};
    if (res.status < 200 || res.status >= 300) return {ok: false, code: 'HTTP_ERROR'};
    const text = await res.text();
    if (text.length > MAX_CHARS) return {ok: false, code: 'TOO_LARGE'};
    const start = text.search(BLOCK_START);
    if (start < 0) return {ok: false, code: /captcha|recaptcha|verifica[çc][ãa]o de seguran|tráfego incomum/i.test(text) ? 'VERIFICATION_REQUIRED' : 'STATE_NOT_FOUND'};
    const end = text.indexOf('</script>', start);
    if (end < 0) return {ok: false, code: 'STATE_NOT_FOUND'};
    // Só o bloco de dados do produto vai ao servidor: sem cookies, tokens ou o resto da página.
    return {ok: true, html: text.slice(start, end + '</script>'.length), finalUrl};
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', stop);
  }
}

/** Leitor com navegador de verdade (WebView invisivel, JS ligado), registrado por
 * price-reader.tsx quando o host esta montado. O Mercado Livre serve a pagina a um
 * navegador anonimo (testado na aba anonima do Chrome), mas recusa pedidos de texto
 * sem JavaScript — tanto do servidor quanto do celular. Por isso o navegador vem
 * primeiro e o fetch de texto fica de reserva. */
export type MercadoLivrePageReader = (url: string, signal?: AbortSignal) => Promise<DevicePage>;
let pageReader: MercadoLivrePageReader | null = null;
export function setMercadoLivrePageReader(reader: MercadoLivrePageReader | null) { pageReader = reader; }
export function mercadoLivrePageReader() { return pageReader; }
/** Navegador primeiro; texto de reserva. Nunca lanca. */
export async function readMercadoLivrePageOnDevice(url: string, signal?: AbortSignal): Promise<DevicePage> {
  if (signal?.aborted) return {ok: false, code: 'CANCELLED'};
  if (pageReader) {
    try { const r = await pageReader(url, signal); if (r.ok || r.code === 'CANCELLED') return r; } catch {}
    if (signal?.aborted) return {ok: false, code: 'CANCELLED'};
  }
  try { return await fetchMercadoLivrePage(url, {signal}); } catch { return {ok: false, code: 'NETWORK'}; }
}

/** Endereco limpo do produto: sem parametros de compartilhamento/rastreio (eles
 * costumam levar a tela "Abra o app do Mercado Livre"). Preserva o anuncio
 * escolhido (pdp_filters / wid). Se nao reconhecer o formato, devolve o original. */
export function canonicalMercadoLivreUrl(raw: string): string {
  const url = String(raw || '').trim().replace(/^http:\/\//i, 'https://');
  const m = /^https:\/\/((?:www\.|produto\.)?mercadolivre\.com\.br)(\/[^?#]*)?([?][^#]*)?(#.*)?$/i.exec(url);
  if (!m) return url;
  const host = m[1].toLowerCase(), path = decodeURIComponentSafe(m[2] || '/'), rest = (m[3] || '') + '&' + (m[4] || '').replace(/^#/, '');
  const item = (/(?:pdp_filters=item_id(?::|%3A)|[?&#]wid=|[?&#]item_id=)(MLB-?\d{6,16})/i.exec('&' + rest) || [])[1];
  const itemId = item ? 'MLB' + item.replace(/^MLB-?/i, '') : null;
  const catalog = /\/p\/(MLB\d{6,16})(?:\/|$)/i.exec(path);
  if (catalog) return 'https://www.mercadolivre.com.br/p/' + catalog[1].toUpperCase() + (itemId ? '?pdp_filters=item_id%3A' + itemId : '');
  const up = /\/up\/(MLBU\d{6,16})(?:\/|$)/i.exec(path);
  if (up) return 'https://www.mercadolivre.com.br/up/' + up[1].toUpperCase() + (itemId ? '?wid=' + itemId : '');
  if (/^\/MLB-?\d{6,16}(?:-[^/]*)?\/?$/i.test(path)) return 'https://' + host + path;
  return url;
}
function decodeURIComponentSafe(v: string) { try { return decodeURIComponent(v); } catch { return v; } }

/** 0.3.237: link de compartilhar (produto.mercadolivre.com.br/MLB-...) redireciona para a pagina de catalogo
 * (/p/MLB...?pdp_filters=item_id:...). O celular segue o redirecionamento e devolve so o ENDERECO final (nao le a
 * pagina). Se parar numa tela de verificacao, o destino costuma vir dentro do endereco: procura o /p/ ali tambem. */
export async function resolveMercadoLivreCatalogUrl(
  url: string,
  {signal, fetchImpl = (globalThis as any).fetch, timeoutMs = 12000}: {signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number} = {}
): Promise<string | null> {
  const target = String(url || '').trim().replace(/^http:\/\//i, 'https://');
  if (!HOST.test(target) || typeof fetchImpl !== 'function' || signal?.aborted) return null;
  const controller = new AbortController(), stop = () => controller.abort(), timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener?.('abort', stop);
  try {
    const res = await fetchImpl(target, {method: 'GET', headers: HEADERS, signal: controller.signal});
    const finalUrl = String((res as any).url || '');
    try { controller.abort(); } catch { /* nao precisa do corpo */ }
    trace('consulta', String((res as any).status || '?') + ' ' + where(finalUrl));
    return catalogUrlOrNull(finalUrl);
  } catch { trace('consulta', 'falhou'); return null; }
  finally { clearTimeout(timer); signal?.removeEventListener?.('abort', stop); }
}

/** 0.3.239: diagnostico - onde cada etapa do celular parou (so host + caminho; nunca parametros, cookies ou pagina). */
export let lastCatalogTrace = '';
export function resetCatalogTrace() { lastCatalogTrace = ''; }
function where(u: unknown): string { const m = /^https?:\/\/([^/?#]+)(\/[^?#]*)?/i.exec(typeof u === 'string' ? u : ''); return m ? (m[1] + (m[2] || '/')).slice(0, 90) : 'sem endereço'; }
function trace(step: string, info: string) { lastCatalogTrace = (lastCatalogTrace ? lastCatalogTrace + '; ' : '') + step + ': ' + info; }
/** O endereco so serve se for do Mercado Livre e trouxer o catalogo (/p/MLB...), direto ou dentro do destino. */
export function catalogUrlOrNull(url: unknown): string | null {
  const u = typeof url === 'string' ? url : '';
  if (!HOST.test(u)) return null;
  let decoded = u; try { decoded = decodeURIComponent(u); } catch { /* mantem */ }
  return /\/p\/MLB\d{6,16}/i.test(decoded) ? u : null;
}
/** 0.3.238: o ML troca o endereco para /p/MLB... pelo JavaScript da pagina (nao e redirecionamento comum).
 * O navegador invisivel executa a pagina como o navegador da pessoa e devolve ONDE terminou - mesmo que depois
 * peca verificacao. Usado so quando a consulta simples nao achou o catalogo. */
export async function resolveCatalogViaBrowser(url: string, signal?: AbortSignal): Promise<string | null> {
  if (!pageReader || signal?.aborted) { trace('navegador', pageReader ? 'cancelado' : 'indisponível'); return null; }
  try { const r = await pageReader(url, signal); trace('navegador', (r.ok ? 'OK' : (r as any).code) + ' ' + where((r as any).finalUrl)); return catalogUrlOrNull((r as any).finalUrl); } catch { trace('navegador', 'falhou'); return null; }
}
