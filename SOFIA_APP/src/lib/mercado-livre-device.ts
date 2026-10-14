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
export type DevicePage = {ok: true; html: string; finalUrl: string} | {ok: false; code: string};

const HOST = /^https:\/\/(?:www\.|produto\.)?mercadolivre\.com\.br(?:\/|$)|^https:\/\/(?:www\.)?mercadolivre\.com\/sec\//i;
const VERIFY = /\/(jms|login|registration|gz\/account-verification|account-verification|captcha|security|challenge)\b/i;
const BLOCK_START = /<script\b[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>/i;
const MAX_CHARS = 6_000_000;
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
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
