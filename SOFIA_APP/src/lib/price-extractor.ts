// Ponte entre o leitor de preço (docs/monitoramento/extract-price.js) e a
// WebView do app. A lógica de leitura em si NÃO é reescrita aqui: o texto
// abaixo é copiado byte a byte do extrator já testado com jsdom (11 testes
// em docs/monitoramento/extract-price.test.js), e um teste próprio
// (tests/price-extractor.test.cjs) garante que os dois arquivos não
// divergem. Mudar a leitura de preço é mudar o arquivo de origem, não aqui.
export const EXTRACT_PRICE_SOURCE = `
function parseAmount(raw, hint) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  let text = String(raw).trim();
  if (!text) return null;
  text = text.replace(/\\s|\\u00a0/g, '');
  text = text.replace(/[^\\d.,-]/g, '');
  if (!text || !/\\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(','), lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) text = text.replace(/\\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma > -1) {
    const decimals = text.length - lastComma - 1;
    text = decimals === 3 && hint === 'en' ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (lastDot > -1) {
    const decimals = text.length - lastDot - 1;
    if (decimals === 3) text = text.replace(/\\./g, '');
  }
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value < 1e8 ? value : null;
}
function pushCandidate(out, value, currency, origin, confidence) {
  const amount = parseAmount(value);
  if (amount === null) return;
  out.push({ amount, currency: currency ? String(currency).toUpperCase().slice(0, 3) : null, origin, confidence });
}
function walkJsonLd(node, out, depth) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { for (const item of node) walkJsonLd(item, out, depth + 1); return; }
  if (typeof node !== 'object') return;
  const graph = node['@graph'];
  if (graph) walkJsonLd(graph, out, depth + 1);
  const offers = node.offers;
  if (offers) {
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      if (!offer || typeof offer !== 'object') continue;
      const spec = offer.priceSpecification;
      if (spec && typeof spec === 'object') {
        const s = Array.isArray(spec) ? spec[0] : spec;
        if (s) pushCandidate(out, s.price, s.priceCurrency, 'json-ld:priceSpecification', 0.95);
      }
      pushCandidate(out, offer.price, offer.priceCurrency, 'json-ld:offer', 1);
      pushCandidate(out, offer.lowPrice, offer.priceCurrency, 'json-ld:lowPrice', 0.7);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'offers' || key === '@graph') continue;
    const child = node[key];
    if (child && typeof child === 'object') walkJsonLd(child, out, depth + 1);
  }
}
function readJsonLd(doc, out) {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const block of blocks) {
    let data;
    try { data = JSON.parse(block.textContent || ''); } catch (_) { continue; }
    walkJsonLd(data, out, 0);
  }
}
function readMicrodata(doc, out) {
  const nodes = doc.querySelectorAll('[itemprop="price"],[itemprop="lowPrice"]');
  for (const node of nodes) {
    const scope = node.closest('[itemtype]');
    const currencyNode = scope ? scope.querySelector('[itemprop="priceCurrency"]') : null;
    const currency = currencyNode ? (currencyNode.getAttribute('content') || currencyNode.textContent) : null;
    const value = node.getAttribute('content') || node.getAttribute('data-price') || node.textContent;
    const weak = node.getAttribute('itemprop') === 'lowPrice';
    pushCandidate(out, value, currency, 'microdata:' + node.getAttribute('itemprop'), weak ? 0.75 : 0.9);
  }
}
function readMeta(doc, out) {
  const pairs = [
    ['product:price:amount', 'product:price:currency', 0.85],
    ['og:price:amount', 'og:price:currency', 0.85],
    ['twitter:data1', null, 0.4],
  ];
  for (const [amountKey, currencyKey, confidence] of pairs) {
    const node = doc.querySelector('meta[property="' + amountKey + '"],meta[name="' + amountKey + '"]');
    if (!node) continue;
    let currency = null;
    if (currencyKey) {
      const c = doc.querySelector('meta[property="' + currencyKey + '"],meta[name="' + currencyKey + '"]');
      currency = c ? c.getAttribute('content') : null;
    }
    pushCandidate(out, node.getAttribute('content'), currency, 'meta:' + amountKey, confidence);
  }
}
function readVisibleText(doc, out) {
  const pattern = /(R\\$|US\\$|\\$|€)\\s*([\\d.,]{3,15})/g;
  const seen = new Set();
  const nodes = doc.querySelectorAll('main,[class*="price" i],[id*="price" i],[class*="preco" i],[id*="preco" i]');
  for (const node of nodes) {
    const text = (node.textContent || '').slice(0, 400);
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const amount = parseAmount(match[2]);
      if (amount === null || seen.has(amount)) continue;
      seen.add(amount);
      const currency = match[1] === 'R$' ? 'BRL' : match[1] === '€' ? 'EUR' : 'USD';
      out.push({ amount, currency, origin: 'texto-visivel', confidence: 0.25 });
      if (seen.size >= 6) return;
    }
  }
}
function extractPrice(doc) {
  const candidates = [];
  try { readJsonLd(doc, candidates); } catch (_) {}
  try { readMicrodata(doc, candidates); } catch (_) {}
  try { readMeta(doc, candidates); } catch (_) {}
  if (!candidates.length) { try { readVisibleText(doc, candidates); } catch (_) {} }
  const groups = new Map();
  for (const item of candidates) {
    const key = item.amount.toFixed(2) + '|' + (item.currency || '');
    const existing = groups.get(key);
    if (existing) {
      existing.origins.push(item.origin);
      existing.confidence = Math.min(1, Math.max(existing.confidence, item.confidence) + 0.05);
    } else {
      groups.set(key, { amount: item.amount, currency: item.currency, origins: [item.origin], confidence: item.confidence });
    }
  }
  const ranked = [...groups.values()].sort((a, b) => b.confidence - a.confidence || a.amount - b.amount);
  const best = ranked[0] || null;
  const disagreement = !!best && ranked.some(c => c.amount !== best.amount && c.confidence >= 0.6);
  return {
    found: !!best,
    needsConfirmation: !best || best.confidence < 0.8 || disagreement,
    best: best,
    candidates: ranked.slice(0, 6),
  };
}
function productTitle(doc) {
  try {
    const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const block of blocks) {
      let data; try { data = JSON.parse(block.textContent || ''); } catch (_) { continue; }
      const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const item of items) {
        if (item && typeof item === 'object' && item.name && (item['@type'] === 'Product' || !item['@type']))
          return String(item.name).trim().slice(0, 150);
      }
    }
  } catch (_) {}
  const og = doc.querySelector('meta[property="og:title"]');
  if (og && og.getAttribute('content')) return og.getAttribute('content').trim().slice(0, 150);
  return (doc.title || '').trim().slice(0, 150);
}
`.trim();

export type PriceCandidate = {amount: number; currency: string | null; origins: string[]; confidence: number};
export type PriceExtraction = {found: boolean; needsConfirmation: boolean; best: PriceCandidate | null; candidates: PriceCandidate[]};
export type PriceReaderMessage =
  | {ok: true; title: string; result: PriceExtraction}
  | {ok: false; error: string};

// Roda inteiramente dentro da WebView, sobre a página já renderizada. Nunca
// navega, nunca envia a página para fora do aparelho — só manda de volta o
// preço e o título que achou. `true;` no fim é exigido pelo motor da WebView
// no Android para não travar o injectedJavaScript.
export function buildInjectedScript(): string {
  return `
(function(){
  try {
    ${EXTRACT_PRICE_SOURCE}
    var result = extractPrice(document);
    var title = productTitle(document);
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:true,title:title,result:result}));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,error:String(e && e.message || e)}));
  }
})();
true;
`.trim();
}

export function parsePriceMessage(raw: string): PriceReaderMessage {
  try {
    const data = JSON.parse(raw);
    if (data && data.ok === true && data.result && typeof data.result === 'object') {
      return {ok: true, title: String(data.title || ''), result: data.result as PriceExtraction};
    }
    if (data && data.ok === false) return {ok: false, error: String(data.error || 'Leitura falhou.')};
  } catch (_) {}
  return {ok: false, error: 'A loja devolveu algo que a Sofia não entendeu.'};
}

export function formatCurrency(amount: number, currency: string | null): string {
  try {
    return amount.toLocaleString('pt-BR', {style: 'currency', currency: currency || 'BRL'});
  } catch (_) {
    return (currency || '') + ' ' + amount.toFixed(2);
  }
}

// Busca de links da MESMA loja numa página de resultados (find-store-links.js),
// copiada sem alteração; teste de equivalência em tests/price-extractor.test.cjs.
export const FIND_LINKS_SOURCE = `
const NOISE_PATH = /\\/(login|cadastro|carrinho|ajuda|sobre|institucional|central-de-ajuda|politica|termos|trabalhe-conosco|minha-conta|favoritos|rastreio)(\\/|$)/i;

function hostnameOf(href, baseUrl) {
  try { return new URL(href, baseUrl).hostname.replace(/^www\\./, ''); }
  catch (_) { return null; }
}

/** doc: documento da página de busca já carregada.
 *  targetHost: domínio da loja que estamos procurando (ex. "kabum.com.br").
 *  baseUrl: URL da própria página de busca, para resolver links relativos.
 *  excludeHost: domínio da loja original, nunca ofertada como "outra loja". */
function findStoreLinks(doc, targetHost, baseUrl, excludeHost) {
  const anchors = doc.querySelectorAll('a[href]');
  const seen = new Set(), out = [];
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    const host = hostnameOf(href, baseUrl);
    if (!host || host !== targetHost) continue;
    if (excludeHost && host === excludeHost) continue;
    let absolute;
    try { absolute = new URL(href, baseUrl).toString(); } catch (_) { continue; }
    if (NOISE_PATH.test(absolute)) continue;
    // Heurística, não garantia: página de produto costuma ter pelo menos
    // /algo/id/slug (3 barras). Categoria/busca costuma ser mais rasa.
    // Ajustar por loja se o padrão real divergir — validar com teste manual.
    const pathDepth = (new URL(absolute).pathname.match(/\\//g) || []).length;
    if (pathDepth < 3) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    const title = (a.textContent || '').trim().slice(0, 200) ||
      (a.querySelector('img[alt]') ? a.querySelector('img[alt]').getAttribute('alt') : '') || '';
    out.push({ url: absolute, title, host });
    if (out.length >= 12) break; // teto generoso; a tela mostra só os melhores
  }
  return out;
}
`.trim();

export type StoreLink = {url: string; title: string; host: string};
export type LinksReaderMessage = {ok: true; links: StoreLink[]} | {ok: false; error: string};

export function buildLinksScript(targetHost: string, excludeHost: string): string {
  const args = JSON.stringify([targetHost, excludeHost]);
  return `
(function(){
  try {
    ${FIND_LINKS_SOURCE}
    var a = ${args};
    var links = findStoreLinks(document, a[0], location.href, a[1]);
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:true,links:links}));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,error:String(e && e.message || e)}));
  }
})();
true;
`.trim();
}

export function parseLinksMessage(raw: string): LinksReaderMessage {
  try {
    const data = JSON.parse(raw);
    if (data && data.ok === true && Array.isArray(data.links)) {
      const links = data.links.filter((l: any) => l && typeof l.url === 'string' && /^https:\/\//.test(l.url)).slice(0, 12)
        .map((l: any) => ({url: String(l.url), title: String(l.title || '').slice(0, 200), host: String(l.host || '')}));
      return {ok: true, links};
    }
    if (data && data.ok === false) return {ok: false, error: String(data.error || 'Busca falhou.')};
  } catch (_) {}
  return {ok: false, error: 'A busca devolveu algo que a Sofia não entendeu.'};
}
