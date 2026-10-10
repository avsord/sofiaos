'use strict';
/** Depois de ler o preço na loja original, varre uma página de resultados
 * de busca (carregada numa WebView separada, com a URL de busca interna de
 * cada loja) e devolve links candidatos pro MESMO produto. Nunca decide
 * sozinho qual é o produto certo — só reduz a lista para o usuário confirmar.
 * Funciona com qualquer motor de busca ou busca interna de loja: não depende
 * de classe CSS nenhuma, só do próprio link apontar pro domínio certo. */

const NOISE_PATH = /\/(login|cadastro|carrinho|ajuda|sobre|institucional|central-de-ajuda|politica|termos|trabalhe-conosco|minha-conta|favoritos|rastreio)(\/|$)/i;

function hostnameOf(href, baseUrl) {
  try { return new URL(href, baseUrl).hostname.replace(/^www\./, ''); }
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
    const pathDepth = (new URL(absolute).pathname.match(/\//g) || []).length;
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

/** Monta o título de busca a partir da página já lida pelo extract-price.
 * Prioriza JSON-LD "name" (mais limpo), cai para og:title, depois <title>. */
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

function slugify(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = { findStoreLinks, productTitle, slugify, hostnameOf };
