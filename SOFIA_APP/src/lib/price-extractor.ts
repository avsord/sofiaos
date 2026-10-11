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
    var tries = 0;
    var run = function(){
      try {
        var result = extractPrice(document);
        if (!result.found && tries < 7) { tries++; setTimeout(run, 800); return; }
        window.ReactNativeWebView.postMessage(JSON.stringify({ok:true,title:productTitle(document),result:result}));
      } catch (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,error:String(e && e.message || e)})); }
    };
    run();
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

// Busca do mesmo produto em outra loja. A primeira versão só aceitava links
// com 3 barras e o domínio exato, e lia a página assim que ela carregava —
// por isso Mercado Livre (produto.mercadolivre.com.br/MLB-…), Pichau
// (/nome-do-produto) e lojas que montam a lista por JavaScript voltavam
// vazias. Agora: regra de link de produto por loja, subdomínios aceitos,
// links de buscadores decodificados, espera a lista aparecer e ordena pela
// semelhança com o nome procurado.
export const FIND_LINKS_SOURCE = `
function norm(t){return String(t||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();}
function tokens(t){return norm(t).split(/[^a-z0-9]+/).filter(function(w){return w.length>1;});}
var RULES={
  'kabum.com.br':/\\/produto\\/\\d+/,
  'mercadolivre.com.br':/MLB-?\\d{6,}/i,
  'pichau.com.br':/^\\/[a-z0-9]+(?:-[a-z0-9]+){3,}\\/?$/,
  'amazon.com.br':/\\/(?:dp|gp\\/product)\\/[A-Z0-9]{10}/,
  'magazineluiza.com.br':/\\/p\\/[a-z0-9]{6,}/i,
  'terabyteshop.com.br':/\\/produto\\/\\d+/,
  'casasbahia.com.br':/\\/p\\/\\d+/
};
var NOISE=/\\/(login|entrar|cadastro|carrinho|cart|checkout|ajuda|help|sobre|institucional|politica|termos|minha-conta|favoritos|rastreio|busca|search|categoria|departamento|ofertas|cupons|lojas|blog)(\\/|$)/i;
function realUrl(href){
  try{var u=new URL(href,location.href);
    if(/duckduckgo\\.com$/.test(u.hostname)&&u.searchParams.get('uddg'))u=new URL(u.searchParams.get('uddg'));
    if(/(^|\\.)google\\./.test(u.hostname)&&u.pathname==='/url'&&u.searchParams.get('q'))u=new URL(u.searchParams.get('q'));
    if(/(^|\\.)bing\\.com$/.test(u.hostname)&&u.searchParams.get('u'))return null;
    return u;}catch(e){return null;}
}
function hostMatch(h,t){h=String(h||'').replace(/^www\\./,'');return h===t||h.slice(-(t.length+1))==='.'+t;}
function cleanUrl(u,t){
  if(t==='amazon.com.br'){var m=u.pathname.match(/\\/(?:dp|gp\\/product)\\/([A-Z0-9]{10})/);if(m)return 'https://www.amazon.com.br/dp/'+m[1];}
  if(t==='mercadolivre.com.br'){var ml=u.href.match(/MLB-?(\\d{6,})/i);if(ml&&/click\\d*\\.|mclics/.test(u.href))return null;}
  u.hash='';u.search='';u.protocol='https:';return u.toString();
}
function labelOf(a){
  var t=(a.getAttribute('title')||a.getAttribute('aria-label')||a.textContent||'').replace(/\\s+/g,' ').trim();
  if(t.length<8){var img=a.querySelector('img[alt]');if(img&&img.getAttribute('alt'))t=img.getAttribute('alt');}
  if(t.length<8){var card=a.closest('article,li,[class*="card" i],[class*="product" i],[class*="item" i]');
    if(card){var h=card.querySelector('h2,h3,[class*="title" i],[class*="name" i],[class*="nome" i]');if(h)t=h.textContent.replace(/\\s+/g,' ').trim();}}
  return String(t).slice(0,200);
}
function findStoreLinks(doc,target,exclude,terms){
  var rule=RULES[target]||null,want=tokens(terms),out={},anchors=doc.querySelectorAll('a[href]');
  for(var i=0;i<anchors.length;i++){
    var a=anchors[i],u=realUrl(a.getAttribute('href'));
    if(!u||(u.protocol!=='https:'&&u.protocol!=='http:'))continue;
    if(!hostMatch(u.hostname,target)||(exclude&&hostMatch(u.hostname,exclude)))continue;
    if(NOISE.test(u.pathname))continue;
    if(rule){if(!rule.test(target==='mercadolivre.com.br'?u.href:u.pathname))continue;}
    else if((u.pathname.match(/\\//g)||[]).length<2)continue;
    var url=cleanUrl(u,target);if(!url)continue;
    var title=labelOf(a),have=tokens(title),hit=0;
    for(var k=0;k<want.length;k++)if(have.indexOf(want[k])>=0)hit++;
    var score=want.length?hit/want.length:0,prev=out[url];
    if(!prev||title.length>prev.title.length)out[url]={url:url,title:title,host:target,score:Math.max(score,prev?prev.score:0)};
  }
  var list=Object.keys(out).map(function(k){return out[k];}).filter(function(x){return x.title.length>=6;});
  list.sort(function(a,b){return b.score-a.score;});
  return list.slice(0,8);
}
`.trim();

export type StoreLink = {url: string; title: string; host: string; score?: number};
export type LinksReaderMessage = {ok: true; links: StoreLink[]; anchors?: number; blocked?: boolean; tries?: number} | {ok: false; error: string};

/** Roda dentro da página de busca. Se ainda não há link de produto, rola a
 * página e tenta de novo (até ~9 s): muitas lojas montam a lista depois. */
export function buildLinksScript(targetHost: string, excludeHost: string, terms = ''): string {
  const args = JSON.stringify([targetHost, excludeHost, terms]);
  return `
(function(){
  var a = ${args}, tries = 0;
  function post(m){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  ${FIND_LINKS_SOURCE}
  function run(){
    try {
      var links = findStoreLinks(document, a[0], a[1], a[2]);
      if (!links.length && tries < 11) { tries++; try { window.scrollTo(0, document.body.scrollHeight * Math.min(1, tries / 4)); } catch (e) {} setTimeout(run, 800); return; }
      var text = (document.title + ' ' + ((document.body && document.body.innerText) || '').slice(0, 600)).toLowerCase();
      post({ok:true, links:links, anchors:document.querySelectorAll('a[href]').length, tries:tries, blocked:/captcha|robot|rob[oô]|access denied|acesso negado|verifica[cç][aã]o de seguran[cç]a/.test(text)});
    } catch (e) { post({ok:false, error:String(e && e.message || e)}); }
  }
  run();
})();
true;
`.trim();
}

export function parseLinksMessage(raw: string): LinksReaderMessage {
  try {
    const data = JSON.parse(raw);
    if (data && data.ok === true && Array.isArray(data.links)) {
      const links = data.links.filter((l: any) => l && typeof l.url === 'string' && /^https:\/\//.test(l.url)).slice(0, 12)
        .map((l: any) => ({url: String(l.url), title: String(l.title || '').slice(0, 200), host: String(l.host || ''), score: Number(l.score) || 0}));
      return {ok: true, links, anchors: Number(data.anchors) || 0, blocked: !!data.blocked, tries: Number(data.tries) || 0};
    }
    if (data && data.ok === false) return {ok: false, error: String(data.error || 'Busca falhou.')};
  } catch (_) {}
  return {ok: false, error: 'A busca devolveu algo que a Sofia não entendeu.'};
}

/** Busca alternativa quando a loja não devolve nada: buscador em HTML
 * simples, restrito ao domínio da loja. */
export function fallbackSearchUrl(host: string, terms: string): string {
  return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent('site:' + host + ' ' + terms);
}
