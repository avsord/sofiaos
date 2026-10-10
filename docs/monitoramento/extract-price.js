'use strict';
/** Leitura de preço na página já renderizada, dentro da WebView do próprio
 * aparelho. Retorna TODOS os candidatos encontrados com a origem de cada um,
 * para o app confirmar com o usuário na primeira vez e reusar depois.
 * Nunca escolhe sozinho quando as fontes discordam: quem decide é o usuário. */

function parseAmount(raw, hint) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  let text = String(raw).trim();
  if (!text) return null;
  text = text.replace(/\s|\u00a0/g, '');
  // Remove moeda e qualquer coisa que não seja dígito ou separador.
  text = text.replace(/[^\d.,-]/g, '');
  if (!text || !/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(','), lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // O separador decimal é o que aparece por último: 1.299,90 ou 1,299.90
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma > -1) {
    const decimals = text.length - lastComma - 1;
    // "1.299,90" -> decimal; "1,299" com 3 casas -> milhar (padrão en)
    text = decimals === 3 && hint === 'en' ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (lastDot > -1) {
    const decimals = text.length - lastDot - 1;
    if (decimals === 3) text = text.replace(/\./g, '');
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
      // Faixa ("a partir de") não é o preço do produto: sempre confirmar.
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

/** Último recurso: procura no texto visível. Baixa confiança de propósito —
 * serve para OFERECER um palpite ao usuário, nunca para registrar sozinho. */
function readVisibleText(doc, out) {
  const pattern = /(R\$|US\$|\$|€)\s*([\d.,]{3,15})/g;
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

  // Agrupa valores iguais: quando várias fontes concordam, a confiança sobe.
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
  // Qualquer OUTRA fonte estruturada apontando valor diferente é desacordo:
  // nesse caso quem escolhe é o usuário, não a heurística.
  const disagreement = !!best && ranked.some(c => c.amount !== best.amount && c.confidence >= 0.6);
  return {
    found: !!best,
    // Só é automático com leitura estruturada e sem valor concorrente.
    needsConfirmation: !best || best.confidence < 0.8 || disagreement,
    best: best,
    candidates: ranked.slice(0, 6),
  };
}

module.exports = { extractPrice, parseAmount };
