import type {PriceReaderMessage} from './price-extractor';

// Leitor direto: algumas lojas publicam os dados do produto numa API própria.
// Quando dá para usar isso, a Sofia não abre página nenhuma — nada de navegador
// escondido, nada de redirecionar para o app da loja, nada de tela de login.
// É mais rápido, mais confiável e não dá para ser confundido com um robô
// navegando no site. Se a loja não tiver esse caminho, ou ele falhar, a leitura
// normal (navegador escondido) continua valendo como estava.

/** MLB1234567890 a partir de qualquer forma de link do Mercado Livre. */
export function mercadoLivreItemId(url: string): string {
  const raw = String(url || '');
  let u: URL | null = null;
  try { u = new URL(raw); } catch { u = null; }
  if (u && !/(^|\.)mercadoli(vre|bre)\.com(\.br)?$/i.test(u.hostname.replace(/^www\./, ''))) return '';
  if (!u && !/mercadoli(vre|bre)\.com/i.test(raw)) return '';
  const from = (s: string) => { const m = /\b(MLB)-?(\d{6,})\b/i.exec(s || ''); return m ? 'MLB' + m[2] : ''; };
  if (u) {
    // O link de compartilhar traz o anúncio real em pdp_filters/wid, enquanto o
    // endereço em si é a página do catálogo (/p/MLB...), que varia de vendedor.
    return from(u.searchParams.get('pdp_filters') || '') || from(u.searchParams.get('wid') || '')
      || from(u.hash) || from(u.pathname) || '';
  }
  return from(raw);
}

type Fetcher = (url: string, init?: {signal?: AbortSignal; headers?: Record<string, string>}) => Promise<{ok: boolean; status: number; json: () => Promise<any>}>;

async function getJson(fetcher: Fetcher, url: string, timeoutMs: number): Promise<any | null> {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {signal: ctrl.signal, headers: {Accept: 'application/json'}});
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Preço e nome do produto pela API do Mercado Livre, sem abrir a página. */
export async function readMercadoLivre(url: string, fetcher: Fetcher = fetch as any, timeoutMs = 12000): Promise<PriceReaderMessage | null> {
  const id = mercadoLivreItemId(url);
  if (!id) return null;
  const item = await getJson(fetcher, 'https://api.mercadolibre.com/items/' + id, timeoutMs);
  // Sem resposta utilizável (loja exigindo credencial, fora do ar, id de catálogo):
  // devolve null para a leitura normal assumir, em vez de dizer que falhou.
  if (!item || typeof item !== 'object') return null;
  if (item.status && ['closed', 'inactive'].includes(String(item.status)) && !(Number(item.price) > 0)) return null;
  const amount = Number(item.price);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const title = String(item.title || '').trim() || 'Produto do Mercado Livre';
  const currency = String(item.currency_id || 'BRL');
  const best = {amount, currency, origins: ['API do Mercado Livre'], confidence: 1};
  return {ok: true, title, result: {found: true, needsConfirmation: false, best, candidates: [best]}};
}

/** Tenta ler o preço direto da loja. null = esta loja não tem esse caminho (usa o navegador). */
export async function readDirect(url: string, fetcher: Fetcher = fetch as any, timeoutMs = 12000): Promise<PriceReaderMessage | null> {
  if (mercadoLivreItemId(url)) return readMercadoLivre(url, fetcher, timeoutMs);
  return null;
}
