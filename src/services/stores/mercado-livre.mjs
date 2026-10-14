/**
 * Sofia OS · Price Tracker · Mercado Livre — módulo único.
 *
 *   1. normalizeMercadoLivreLink  → identidade estável a partir de qualquer link colado (sem rede)
 *   2. extractMercadoLivreHtml    → leitura ESTRITA do preço do anúncio + dados extras (sem rede)
 *   3. fetchMercadoLivreHtml      → coleta HTTP(S) segura do HTML como TEXTO (backend Node 18+)
 *   4. resolveMercadoLivreShortLink → resolve /sec/… seguindo redirecionamentos validados
 *   5. readMercadoLivre           → fluxo completo; nunca lança, devolve {ok, reading} ou {ok:false, code…}
 *   6. comparePrice               → variação contra a leitura ANTERIOR da mesma identidade
 *
 * Regras de segurança (não mudar sem motivo):
 *   - Sem eval/Function/DOM/WebView/Linking.openURL. O JS da loja nunca é executado.
 *   - O preço só sai do bloco __NORDIC_RENDERING_CTX__ e só se anúncio, vendedor e preço
 *     concordarem entre 3 fontes. Nada de JSON-LD, og:title, "primeiro preço" ou "menor preço".
 *   - Dados extras (imagens, parcelas, outras ofertas, specs…) são best-effort e NUNCA decidem o preço.
 *   - Rede: só HTTPS, só hosts do ML, redirecionamento manual validado a cada salto,
 *     limite de tempo, tamanho e saltos; sem cookies; login/captcha = falha, nunca contorno.
 */

// ───────────────────────────── erros ─────────────────────────────
export class MercadoLivreError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "MercadoLivreError";
    this.code = code;
    Object.assign(this, extra);
  }
}
const fail = (code, message, extra) => { throw new MercadoLivreError(code, message, extra); };

/** Como o app deve reagir a cada código. keepLastPrice sempre true em falha. */
export const ERROR_POLICY = Object.freeze({
  CANCELLED:             {retryable: false, userAction: false, msg: "Leitura cancelada; preço anterior preservado."},
  NETWORK:               {retryable: true,  userAction: false, msg: "Falha de rede; tentaremos de novo."},
  TIMEOUT:               {retryable: true,  userAction: false, msg: "A loja demorou para responder."},
  RATE_LIMITED:          {retryable: true,  userAction: false, msg: "A loja limitou as consultas; aguardando."},
  HTTP_ERROR:            {retryable: true,  userAction: false, msg: "A loja respondeu com erro."},
  BLOCKED:               {retryable: true,  userAction: false, msg: "A loja recusou a consulta automática."},
  VERIFICATION_REQUIRED: {retryable: false, userAction: true,  msg: "A loja pediu login/verificação; não será contornado."},
  STATE_NOT_FOUND:       {retryable: true,  userAction: false, msg: "A página veio sem os dados do produto."},
  APP_INTERSTITIAL:      {retryable: true,  userAction: false, msg: "O Mercado Livre mostrou a tela \"Abra o app\" em vez do produto."},
  INVALID_STATE:         {retryable: true,  userAction: false, msg: "Dados da página corrompidos."},
  UNAVAILABLE:           {retryable: true,  userAction: false, msg: "Sem estoque no momento."},
  PRICE_MISSING:         {retryable: true,  userAction: false, msg: "A página não mostrou preço."},
  PRICE_CONFLICT:        {retryable: true,  userAction: false, msg: "Preços divergentes na página; leitura descartada."},
  OFFER_MISMATCH:        {retryable: true,  userAction: false, msg: "A oferta selecionada não confere."},
  ITEM_MISMATCH:         {retryable: false, userAction: true,  msg: "A loja devolveu outro anúncio."},
  CATALOG_MISMATCH:      {retryable: false, userAction: true,  msg: "A loja devolveu outro produto."},
  SELLER_MISMATCH:       {retryable: false, userAction: true,  msg: "O vendedor mudou; confirme antes de continuar o histórico."},
  ITEM_REQUIRED:         {retryable: false, userAction: true,  msg: "Escolha um vendedor/anúncio específico."},
  UNSUPPORTED_ROUTE:     {retryable: false, userAction: true,  msg: "Esse tipo de link do ML ainda não é suportado."},
  UNSUPPORTED_HOST:      {retryable: false, userAction: true,  msg: "Não é um link do Mercado Livre."},
  INVALID_URL:           {retryable: false, userAction: true,  msg: "Link inválido."},
});

// ──────────────────────────── identidade ────────────────────────────
const LINK_HOSTS = new Set(["mercadolivre.com.br", "www.mercadolivre.com.br", "produto.mercadolivre.com.br"]);
const SHORT_HOSTS = new Set(["mercadolivre.com", "www.mercadolivre.com", "mercadolivre.com.br", "www.mercadolivre.com.br"]);
// hosts que o coletor pode visitar (inclui encurtador, que só redireciona)
const FETCH_HOSTS = new Set([...LINK_HOSTS, ...SHORT_HOSTS]);
const SHORT_PATH = /^\/sec\/[A-Za-z0-9]{3,32}\/?$/;

const ITEM = /^MLB-?(\d{6,16})$/i;
function itemId(value) {
  const m = ITEM.exec(String(value ?? "").trim());
  if (!m) fail("INVALID_ITEM_ID", "Identificador de anúncio inválido.");
  return "MLB" + m[1];
}
const isItemId = v => ITEM.test(String(v ?? "").trim());
function onlyOne(values, code, message) {
  const unique = [...new Set(values)];
  if (unique.length !== 1) fail(code, message);
  return unique[0];
}

function parseInputUrl(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 8192)
    fail("INVALID_URL", "Informe um link do produto.");
  const text = input.trim().replace(/&amp;/gi, "&");
  const urls = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  if (urls.length > 1) fail("MULTIPLE_URLS", "Há mais de um link; selecione um produto.");
  let value = urls[0] || text;
  if (urls.length) value = value.replace(/[),.;!]+$/, "");
  else {
    if (/\s/.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value))
      fail("INVALID_URL", "Esquema ou texto de URL não suportado.");
    value = "https://" + value;
  }
  let u;
  try { u = new URL(value); } catch { fail("INVALID_URL", "URL inválida."); }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || u.port)
    fail("INVALID_URL", "Use HTTP(S), sem credenciais ou porta personalizada.");
  return u;
}

/** true se for link curto do ML (/sec/…) que precisa de resolveMercadoLivreShortLink. */
export function isMercadoLivreShortLink(input) {
  try {
    const u = parseInputUrl(input);
    return SHORT_HOSTS.has(u.hostname.toLowerCase()) && SHORT_PATH.test(u.pathname);
  } catch { return false; }
}

/**
 * Converte link/texto compartilhado em identidade. NÃO acessa a rede.
 * @param {string} input
 * @param {{allowCatalogOnly?: boolean}} [opts] allowCatalogOnly: aceita /p/MLB… sem anúncio
 *   (itemId=null, needsItemSelection=true) para o fluxo de "escolher o vencedor da página".
 */
export function normalizeMercadoLivreLink(input, {allowCatalogOnly = false} = {}) {
  const u = parseInputUrl(input);
  const host = u.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host) && SHORT_PATH.test(u.pathname))
    fail("SHORT_LINK", "Link curto: resolva com resolveMercadoLivreShortLink antes.", {resolvable: true});
  if (!LINK_HOSTS.has(host) && /(^|\.)mercadolivre\.com(\.br)?$/.test(host))
    fail("UNSUPPORTED_ROUTE", "Busca, loja ou outra área do ML não identifica um anúncio.");
  if (!LINK_HOSTS.has(host))
    fail("UNSUPPORTED_HOST", "Domínio não suportado; não será aberto automaticamente.");
  let path;
  try { path = decodeURIComponent(u.pathname); }
  catch { fail("INVALID_URL", "Caminho mal codificado."); }

  const catalog = /^(?:\/[^/]+)?\/p\/(MLB\d{6,16})(?:\/s)?\/?$/i.exec(path);
  const listing = /^\/(MLB-\d{6,16})(?:-[^/]*)?\/?$/i.exec(path);
  const userProduct = /^(?:\/[^/]+)?\/up\/(MLBU\d{6,16})\/?$/i.exec(path);
  if (!catalog && !listing && !userProduct)
    fail("UNSUPPORTED_ROUTE", "Busca, loja ou outra rota não identifica um anúncio.");

  const catalogProductId = catalog ? catalog[1].toUpperCase() : null;
  const userProductId = userProduct ? userProduct[1].toUpperCase() : null;
  const ids = listing ? [itemId(listing[1])] : [];
  const fragment = new URLSearchParams(u.hash.replace(/^#/, ""));
  for (const params of [u.searchParams, fragment]) {
    if (params.has("variation_id") || params.has("variation"))
      fail("UNSUPPORTED_VARIATION", "A variante exige tratamento explícito antes de normalizar.");
    for (const key of ["wid", "item_id"]) for (const v of params.getAll(key)) ids.push(itemId(v));
    for (const filters of params.getAll("pdp_filters")) {
      const f = /^item_id:(MLB-?\d{6,16})$/i.exec(filters);
      if (!f) fail("UNSUPPORTED_FILTERS", "Não remover filtros de oferta que não foram interpretados.");
      ids.push(itemId(f[1]));
    }
  }

  if (!ids.length) {
    if (catalog && allowCatalogOnly) {
      const n = new URL("https://www.mercadolivre.com.br/p/" + catalogProductId);
      return {provider: "mercadolivre", siteId: "MLB", itemId: null, catalogProductId,
        userProductId: null, identityKey: null, needsItemSelection: true,
        route: "catalog", normalizedUrl: n.toString()};
    }
    if (!userProduct)
      fail("ITEM_REQUIRED", "Catálogo sem anúncio escolhido; não selecionar vendedor sozinho.");
    fail("ITEM_REQUIRED", "Link /up/ sem o anúncio (wid); cole o link compartilhado completo.");
  }
  const id = onlyOne(ids, "ITEM_CONFLICT", "O link aponta para anúncios diferentes.");

  let n, route;
  if (catalog) {
    route = "catalog";
    n = new URL("https://www.mercadolivre.com.br/p/" + catalogProductId);
    n.searchParams.set("pdp_filters", "item_id:" + id);
  } else if (userProduct) {
    route = "user_product";
    n = new URL("https://www.mercadolivre.com.br/up/" + userProductId);
    n.searchParams.set("wid", id);
  } else {
    route = "listing";
    n = new URL("https://" + host + u.pathname);
  }
  return {
    provider: "mercadolivre", siteId: "MLB", itemId: id, catalogProductId, userProductId,
    identityKey: "mercadolivre:" + id, needsItemSelection: false, route,
    normalizedUrl: n.toString(),
  };
}

// ─────────────────────────── leitura do HTML ───────────────────────────
function firstJsonObject(text, start) {
  while (/\s/.test(text[start] || "") && start < text.length) start++;
  if (text[start] !== "{") fail("INVALID_STATE", "Objeto JSON inicial não encontrado.");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); }
      catch { fail("INVALID_STATE", "Estado não é JSON válido; não executar o script."); }
    }
  }
  fail("INVALID_STATE", "Estado JSON incompleto.");
}

/** Isola o estado do bloco __NORDIC_RENDERING_CTX__ (só JSON.parse). */
export function readNordicContext(html) {
  if (typeof html !== "string" || !html || html.length > 5_000_000)
    fail("INVALID_HTML", "HTML ausente ou acima do limite de 5 milhões de caracteres.");
  const scripts = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
  const blocks = [];
  for (const m of html.matchAll(scripts))
    if (/\bid\s*=\s*(["'])__NORDIC_RENDERING_CTX__\1/i.test(m[1])) blocks.push(m[2]);
  if (blocks.length !== 1) fail("STATE_NOT_FOUND", "Estado principal ausente ou duplicado.");
  const assignment = /^\s*(?:window\.)?_n\.ctx\.r\s*=\s*/.exec(blocks[0]);
  if (!assignment) fail("INVALID_STATE", "Formato da atribuição do estado não reconhecido.");
  return firstJsonObject(blocks[0], assignment[0].length);
}

function cents(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    fail("INVALID_PRICE", "Preço inválido; histórico não deve ser alterado.");
  const rounded = Math.round(value * 100);
  if (!Number.isSafeInteger(rounded) || Math.abs(rounded - value * 100) > 0.00001)
    fail("INVALID_PRICE", "Preço não representável em centavos.");
  return rounded;
}
const softCents = v => (typeof v === "number" && Number.isFinite(v) && v > 0) ? Math.round(v * 100) : null;
function checkPrice(price, expectedCents, currency, label) {
  if (!price || price.currency_id !== currency)
    fail("CURRENCY_MISMATCH", "Moeda divergente em " + label + ".");
  if (cents(price.value) !== expectedCents) fail("PRICE_CONFLICT", "Preços divergentes em " + label + ".");
}
function numericId(value) {
  const s = String(value ?? "");
  if (!/^\d{1,18}$/.test(s)) fail("SELLER_MISSING", "Identidade do vendedor não comprovada.");
  return s;
}
const str = (v, max = 500) => (typeof v === "string" && v.trim()) ? v.trim().slice(0, max) : null;
const num = v => (typeof v === "number" && Number.isFinite(v)) ? v : null;
const safe = fn => { try { const v = fn(); return v === undefined ? null : v; } catch { return null; } };
const PIC_ID = /^\d+-[A-Z]{2,4}\d+_\d+$/;
const picUrl = id => `https://http2.mlstatic.com/D_NQ_NP_${id}-O.webp`;

/** Dados complementares: best-effort, nunca lançam, nunca decidem o preço gravado. */
function extractExtras(s, c, ev, actualId, amountCents) {
  const specs = safe(() => {
    const out = {};
    for (const comp of c.highlighted_specs_attrs?.components || []) {
      if (comp?.type !== "technical_specifications") continue;
      for (const g of comp.specs || []) for (const a of g.attributes || []) {
        const k = str(a?.id, 100), v = str(a?.text, 300);
        if (k && v) out[k] = v;
      }
    }
    return out;
  }) || {};

  const mainPrice = c.price?.price || {};
  const originalCents = softCents(mainPrice.original_value);

  const otherOffers = safe(() => {
    const list = [];
    for (const it of c.buy_box_offers?.items || []) {
      if (it?.selected === true || !isItemId(it?.item_id)) continue;
      const p = (it.components || []).find(x => x?.id === "price");
      const sellerText = (p?.subtitles || []).find(x => x?.id === "seller")?.text;
      list.push({itemId: itemId(it.item_id), priceCents: softCents(p?.price?.value),
        currency: p?.price?.currency_id || null, label: str(it.title?.text, 80),
        sellerName: str(String(sellerText || "").replace(/^Vendido por\s*/i, ""), 120), source: "buy_box_offers"});
    }
    for (const it of c.bbw_alternatives?.items || []) {
      if (!isItemId(it?.id)) continue;
      const id = itemId(it.id);
      if (id === actualId || list.some(o => o.itemId === id)) continue;
      const sel = it.seller?.seller?.seller || it.seller?.seller || {};
      list.push({itemId: id, priceCents: softCents(it.price?.price?.value),
        originalPriceCents: softCents(it.price?.price?.original_value),
        currency: it.price?.price?.currency_id || "BRL", label: str(it.product_tag?.text, 80),
        sellerName: str(sel.name, 120), sellerId: /^\d+$/.test(String(sel.id ?? "")) ? String(sel.id) : null,
        sellerReputation: str(sel.reputation_level, 40), source: "bbw_alternatives"});
    }
    return list.filter(o => o.priceCents);
  }) || [];

  const shippingPromises = safe(() => (c.shipping_section?.promises?.items || []).map(item =>
    (item.components || []).filter(x => x?.id === "title").map(comp => (comp.parts || []).map(p => {
      if (p?.type === "currency") {
        const v = num(p.price); if (v === null) return "";
        const t = "R$ " + v.toFixed(2).replace(".", ",");
        return p.previous ? `(de ${t})` : t;
      }
      return typeof p?.value === "string" ? p.value : "";
    }).join("").replace(/\s+/g, " ").trim()).join(" ")).filter(Boolean)) || [];

  const rec = safe(() => ev.credit_view_components.pricing.recommended_methods[0]);
  const reviews = c.header?.reviews;

  return {
    brand: specs["Marca"] || null,
    model: specs["Modelo"] || null,
    condition: str(ev.item_condition, 20),
    originalPriceCents: originalCents && originalCents > amountCents ? originalCents : null,
    discountPct: originalCents && originalCents > amountCents
      ? Math.round((1 - amountCents / originalCents) * 100) : null,
    installments: rec && num(rec.installments) ? {
      count: rec.installments, amountCents: softCents(rec.installment_amount),
      totalCents: softCents(rec.installments_total), noInterest: rec.is_free_installment === true,
    } : null,
    rating: reviews && num(reviews.rating) ? {value: reviews.rating, count: num(reviews.amount)} : null,
    soldQuantityMin: num(ev.sold_quantity),
    availableQuantity: num(ev.quantity),
    images: safe(() => (c.gallery?.pictures || []).map(p => p?.id).filter(id => PIC_ID.test(String(id)))
      .slice(0, 20).map(picUrl)) || [],
    sellerReputation: str(ev.reputation_level, 40),
    sellerPowerStatus: str(ev.power_seller_status, 20),
    officialStore: typeof c.seller_summary?.is_exclusive_official_store === "boolean"
      ? c.seller_summary.is_exclusive_official_store : null,
    freeShipping: typeof ev.free_shipping === "boolean" ? ev.free_shipping : null,
    shippingPromises,                    // texto depende do CEP/conta da coleta; só exibição
    lowestNewFromCents: safe(() => softCents(c.others_products.products[0].title.values.price.value)),
    otherOffers,                         // NÃO usar como preço deste anúncio
    variants: safe(() => (c.outside_variations?.pickers || []).flatMap(pk => (pk.products || [])
      .filter(p => isItemId(p?.id)).map(p => ({
        attribute: str(pk.id, 40), value: str(p.label?.text, 80), catalogProductId: itemId(p.id),
        selected: p.decoration_type === "SELECTED"})))) || [],
    category: {id: str(ev.category_id, 30), domainId: str(ev.domain_id, 60),
      path: safe(() => (c.breadcrumb?.categories || []).map(x => str(x?.label?.text, 80)).filter(Boolean)) || []},
    specs,
    description: str(c.description?.content, 5000),
  };
}

/**
 * Extrai a leitura do HTML JÁ OBTIDO. Não acessa rede.
 * @param {string} html
 * @param {string} inputUrl link (bruto ou normalizado) do anúncio esperado
 * @param {{expectedSellerId?: string|number, allowCatalogWinner?: boolean}} [opts]
 *   expectedSellerId: salvo na 1ª leitura; impede misturar histórico se o vendedor mudar.
 *   allowCatalogWinner: aceita link /p/ sem anúncio e adota a oferta selecionada pela loja
 *   (itemSelectedBy="store_buy_box"). Use só no cadastro, com confirmação do usuário.
 */

// Nomes (nunca valores) das chaves principais: diagnóstico sem expor conteúdo da página.
function shapeOf(context) {
  const keys = o => (o && typeof o === "object") ? Object.keys(o).slice(0, 25).join(",") : typeof o;
  const st = context?.appProps?.pageProps?.initialState;
  return "raiz:" + keys(context) + " | pageProps:" + keys(context?.appProps?.pageProps) + " | initialState:" + keys(st) + " | components:" + keys(st?.components);
}
/** Identidade sem o evento de rastreio: pelo menos DUAS fontes da pagina concordando,
 * ou UMA que confira com o anuncio pedido no link. Preco continua vindo so do
 * componente principal (e da buy box, se existir, conferida mais adiante). */
function synthesizeEvent(s, c, wanted) {
  const found = [];
  const add = v => { if (isItemId(v)) found.push(itemId(v)); };
  add(c.main_actions?.form?.item_id);
  add(c.bookmark?.item_id);
  const f = /^item_id:(MLB-?\d{6,16})$/i.exec(String(s.filters || ""));
  if (f) add(f[1]);
  try { if (c.share?.permalink) add(normalizeMercadoLivreLink(String(c.share.permalink)).itemId); } catch {}
  const selected = Array.isArray(c.buy_box_offers?.items) ? c.buy_box_offers.items.filter(x => x?.selected === true) : [];
  if (selected.length === 1) add(selected[0].item_id);
  const unique = [...new Set(found)];
  if (unique.length > 1) fail("ITEM_MISMATCH", "A página aponta para anúncios diferentes.");
  if (!unique.length) fail("STATE_NOT_FOUND", "Página sem identificação do anúncio (" + Object.keys(c).slice(0, 25).join(",") + ").");
  if (found.length < 2 && unique[0] !== wanted.itemId) fail("STATE_NOT_FOUND", "Identidade do anúncio não comprovada nesta página.");
  const main = c.price?.price || {}, seller = c.seller_summary?.seller || {};
  // Em página de catálogo, initialState.id é o produto de catálogo (diferente do anúncio).
  return {item_id: unique[0], catalog_product_id: isItemId(s.id) && itemId(s.id) !== unique[0] ? itemId(s.id) : null,
    price: main.value, currency_id: main.currency_id, seller_id: seller.id, has_stock: undefined, synthesized: true};
}

export function extractMercadoLivreHtml(html, inputUrl, {expectedSellerId, allowCatalogWinner = false} = {}) {
  const wanted = normalizeMercadoLivreLink(inputUrl, {allowCatalogOnly: allowCatalogWinner});
  const context = readNordicContext(html);
  const s = context?.appProps?.pageProps?.initialState;
  const c = s?.components;
  if (!c && context?.appProps?.pageProps?.openInApp !== undefined)
    fail("APP_INTERSTITIAL", "O Mercado Livre mostrou a tela \"Abra o app\" em vez da página do produto.");
  if (!c) fail("STATE_NOT_FOUND", "Estrutura da oferta não reconhecida (" + shapeOf(context) + ").");
  // O evento de rastreio (track) nem sempre vem (variações do layout). Sem ele, a
  // identidade sai de outras partes da MESMA página, que precisam concordar entre si.
  const ev = c.track?.melidata_event?.event_data || synthesizeEvent(s, c, wanted);

  const actualId = itemId(ev.item_id);
  if (wanted.itemId && actualId !== wanted.itemId) fail("ITEM_MISMATCH", "A página devolveu outro anúncio.");
  if (c?.main_actions?.form?.item_id != null || !ev.synthesized) {
    if (itemId(c?.main_actions?.form?.item_id) !== actualId)
      fail("ITEM_MISMATCH", "O botão de compra aponta para outro anúncio.");
  }
  if (c.bookmark?.item_id && itemId(c.bookmark.item_id) !== actualId)
    fail("ITEM_MISMATCH", "Identidade do anúncio inconsistente.");

  // catálogo: obrigatório e coerente quando a página é de catálogo (/p/)
  let catalogProductId = null;
  if (wanted.catalogProductId && ev.catalog_product_id == null)
    fail("CATALOG_MISMATCH", "Link de catálogo, mas a página não é de catálogo.");
  if (ev.catalog_product_id != null) {
    const trackCatalog = itemId(ev.catalog_product_id);
    const stateCatalog = isItemId(s.id) ? itemId(s.id) : null;
    if ((stateCatalog && stateCatalog !== trackCatalog) ||
        (wanted.catalogProductId && wanted.catalogProductId !== trackCatalog))
      fail("CATALOG_MISMATCH", "A página devolveu outro produto de catálogo.");
    catalogProductId = trackCatalog;
  }
  if (s.filters) {
    const f = /^item_id:(MLB-?\d{6,16})$/i.exec(String(s.filters));
    if (!f || itemId(f[1]) !== actualId) fail("ITEM_MISMATCH", "Filtro de anúncio diferente.");
  }
  if (ev.has_stock === false) fail("UNAVAILABLE", "Oferta sem estoque; não gravar nova leitura.");

  if (c.price?.state !== "VISIBLE") fail("PRICE_MISSING", "Preço principal não está disponível.");
  const main = c.price.price;
  if (main?.currency_id !== "BRL") fail("CURRENCY_MISMATCH", "Este adaptador exige preço em BRL.");
  const amountCents = cents(main.value);
  checkPrice({value: ev.price, currency_id: ev.currency_id}, amountCents, "BRL", "track da oferta");

  // buy box: obrigatória em catálogo; em anúncio simples, se existir, tem que conferir
  const offers = c.buy_box_offers?.items;
  if (catalogProductId && !Array.isArray(offers)) fail("OFFER_MISSING", "Lista de ofertas não reconhecida.");
  if (Array.isArray(offers)) {
    const selected = offers.filter(x => x?.selected === true);
    if (selected.length !== 1 || itemId(selected[0].item_id) !== actualId)
      fail("OFFER_MISMATCH", "Oferta selecionada ausente, ambígua ou de outro anúncio.");
    const sp = selected[0].components?.filter(x => x?.id === "price");
    if (!Array.isArray(sp) || sp.length !== 1 || sp[0].state !== "VISIBLE")
      fail("PRICE_MISSING", "Preço da oferta selecionada ausente ou ambíguo.");
    checkPrice(sp[0].price, amountCents, "BRL", "oferta selecionada");
  }

  const seller = c.seller_summary?.seller;
  const sellerId = numericId(seller?.id);
  if (numericId(ev.seller_id) !== sellerId) fail("SELLER_MISMATCH", "Dados de vendedor divergentes.");
  if (expectedSellerId !== undefined && expectedSellerId !== null &&
      numericId(expectedSellerId) !== sellerId)
    fail("SELLER_MISMATCH", "O vendedor mudou; não misturar histórico.");
  const sellerName = String(seller?.name || "").trim();
  const title = String(c.header?.title || "").trim();
  if (!sellerName || !title) fail("IDENTITY_MISSING", "Nome do produto ou vendedor ausente.");

  // permalink da própria página: se existir, precisa confirmar o anúncio
  let cleanPermalink = null;
  if (c.share?.permalink) {
    const share = normalizeMercadoLivreLink(String(c.share.permalink));
    if (share.itemId !== actualId || (catalogProductId && share.catalogProductId !== catalogProductId))
      fail("ITEM_MISMATCH", "Permalink compartilhado não corresponde à oferta.");
    const p = new URL(c.share.permalink);
    p.protocol = "https:"; p.search = ""; p.hash = "";
    if (share.route === "catalog") p.searchParams.set("pdp_filters", "item_id:" + actualId);
    cleanPermalink = p.toString();
  }
  // URL de acesso estável desta identidade (para as próximas coletas)
  const normalizedUrl = catalogProductId
    ? `https://www.mercadolivre.com.br/p/${catalogProductId}?pdp_filters=item_id%3A${actualId}`
    : (wanted.itemId ? wanted.normalizedUrl : cleanPermalink || wanted.normalizedUrl);

  return {
    provider: "mercadolivre", siteId: "MLB",
    itemId: actualId, catalogProductId, identityKey: "mercadolivre:" + actualId,
    itemSelectedBy: wanted.itemId ? "link" : "store_buy_box",
    normalizedUrl, cleanPermalink,
    title, seller: {id: sellerId, name: sellerName},
    amount: amountCents / 100, amountCents, currency: "BRL",
    inStock: typeof ev.has_stock === "boolean" ? ev.has_stock : null,
    layout: catalogProductId ? "pdp" : "item",
    source: "__NORDIC_RENDERING_CTX__",
    identitySource: ev.synthesized ? "page" : "track",
    observedAt: null,      // preenchido por readMercadoLivre na coleta ao vivo; arquivo importado = null
    shippingAmount: null,  // frete depende de CEP/conta; não somado ao preço
    extras: extractExtras(s, c, ev, actualId, amountCents),
  };
}

// ─────────────────────────────── rede ───────────────────────────────
const DEFAULT_HEADERS = Object.freeze({
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
  "accept-language": "pt-BR,pt;q=0.9",
});
const VERIFY_PATH = /\/(jms|login|registration|gz\/account-verification|account-verification|captcha|security|challenge)\b/i;

function assertFetchable(u) {
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    fail("UNSAFE_REDIRECT", "Destino fora de HTTPS padrão recusado.");
  if (!FETCH_HOSTS.has(u.hostname.toLowerCase()))
    fail("UNSAFE_REDIRECT", "Redirecionamento para domínio não permitido: " + u.hostname);
  if (VERIFY_PATH.test(u.pathname))
    fail("VERIFICATION_REQUIRED", "A loja pediu login/verificação; não será contornado.");
}

async function readCapped(res, maxBytes) {
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) fail("TOO_LARGE", "Resposta acima do limite.");
  if (!res.body?.getReader) {
    const t = await res.text();
    if (t.length > maxBytes) fail("TOO_LARGE", "Resposta acima do limite.");
    return t;
  }
  const reader = res.body.getReader();
  const chunks = []; let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch {} fail("TOO_LARGE", "Resposta acima do limite."); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total); let off = 0;
  for (const ch of chunks) { buf.set(ch, off); off += ch.byteLength; }
  return new TextDecoder("utf-8").decode(buf);
}

/**
 * Baixa o HTML como TEXTO (Node 18+/backend). Não executa nada, não envia cookies.
 * Redirecionamentos são seguidos manualmente e validados a cada salto.
 * @returns {Promise<{html: string, finalUrl: string, status: number, fetchedAt: string}>}
 */
export async function fetchMercadoLivreHtml(url, {
  fetchImpl = globalThis.fetch, timeoutMs = 15000, maxBytes = 6_000_000, maxRedirects = 4,
  headers = {}, signal,
} = {}) {
  if (typeof fetchImpl !== "function") fail("NETWORK", "fetch indisponível neste ambiente.");
  let current;
  try { current = new URL(url); } catch { fail("INVALID_URL", "URL inválida."); }
  assertFetchable(current);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.("abort", onAbort, {once: true});
  if (signal?.aborted) ctrl.abort();
  try {
    for (let hop = 0; ; hop++) {
      if (signal?.aborted) fail("CANCELLED", "Leitura cancelada.");
      let res;
      try {
        res = await fetchImpl(current.toString(), {
          method: "GET", redirect: "manual", credentials: "omit",
          headers: {...DEFAULT_HEADERS, ...headers}, signal: ctrl.signal,
        });
      } catch (e) {
        if (signal?.aborted) fail("CANCELLED", "Leitura cancelada.");
        if (ctrl.signal.aborted) fail("TIMEOUT", "Tempo limite excedido.");
        fail("NETWORK", "Falha de rede: " + (e?.message || e));
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) fail("HTTP_ERROR", "Redirecionamento sem destino.");
        if (hop >= maxRedirects) fail("TOO_MANY_REDIRECTS", "Redirecionamentos demais.");
        try { current = new URL(loc, current); } catch { fail("UNSAFE_REDIRECT", "Destino inválido."); }
        assertFetchable(current);
        try { await res.body?.cancel?.(); } catch {}
        continue;
      }
      if (res.status === 0 || res.type === "opaqueredirect")
        fail("NETWORK", "Ambiente não permite redirecionamento manual; use o coletor no backend.");
      if (res.status === 429) fail("RATE_LIMITED", "Muitas consultas (HTTP 429).");
      if (res.status === 401) fail("VERIFICATION_REQUIRED", "A loja exigiu autenticação.");
      if (res.status === 403) fail("BLOCKED", "A loja recusou a consulta (HTTP 403).");
      if (res.status < 200 || res.status >= 300) fail("HTTP_ERROR", "HTTP " + res.status, {status: res.status});
      const type = res.headers.get("content-type") || "";
      if (type && !/text\/html|application\/xhtml/i.test(type)) fail("HTTP_ERROR", "Conteúdo não é HTML: " + type);
      const html = await readCapped(res, maxBytes);
      return {html, finalUrl: current.toString(), status: res.status, fetchedAt: new Date().toISOString()};
    }
  } catch (e) {
    if (e instanceof MercadoLivreError) throw e;
    if (signal?.aborted) fail("CANCELLED", "Leitura cancelada.");
    if (ctrl.signal.aborted) fail("TIMEOUT", "Tempo limite excedido.");
    fail("NETWORK", "Falha de rede: " + (e?.message || e));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

/** Resolve link curto /sec/… até um link de anúncio normalizável, sem baixar o produto final. */
export async function resolveMercadoLivreShortLink(input, {fetchImpl = globalThis.fetch, timeoutMs = 10000, maxRedirects = 5, signal} = {}) {
  let current = parseInputUrl(input);
  if (!isMercadoLivreShortLink(current.toString())) return normalizeMercadoLivreLink(input);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.("abort", onAbort, {once: true});
  if (signal?.aborted) ctrl.abort();
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (signal?.aborted) fail("CANCELLED", "Leitura cancelada.");
      assertFetchable(current);
      let res;
      try {
        res = await fetchImpl(current.toString(), {method: "GET", redirect: "manual", credentials: "omit",
          headers: DEFAULT_HEADERS, signal: ctrl.signal});
      } catch (e) {
        if (signal?.aborted) fail("CANCELLED", "Leitura cancelada.");
        if (ctrl.signal.aborted) fail("TIMEOUT", "Tempo limite excedido.");
        fail("NETWORK", "Falha de rede: " + (e?.message || e));
      }
      try { await res.body?.cancel?.(); } catch {}
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) fail("SHORT_LINK_UNRESOLVED", "O link curto não levou a um anúncio.");
      try { current = new URL(loc, current); } catch { fail("UNSAFE_REDIRECT", "Destino inválido."); }
      assertFetchable(current);
      if (!isMercadoLivreShortLink(current.toString())) {
        return normalizeMercadoLivreLink(current.toString(), {allowCatalogOnly: true});
      }
    }
    fail("TOO_MANY_REDIRECTS", "Redirecionamentos demais.");
  } finally { clearTimeout(timer); signal?.removeEventListener?.("abort", onAbort); }
}

// ──────────────────────────── fluxo completo ────────────────────────────
function describeFailure(e) {
  const code = e?.code || "UNKNOWN";
  const pol = ERROR_POLICY[code] || {retryable: false, userAction: false, msg: e?.message || "Erro desconhecido."};
  return {ok: false, code, message: pol.msg, detail: e?.message || null,
    retryable: pol.retryable, needsUserAction: pol.userAction, keepLastPrice: true};
}

/**
 * Fluxo completo: link → identidade → HTML → leitura validada. NUNCA lança.
 * Em falha: {ok:false, code, keepLastPrice:true} → não gravar ponto, não alertar.
 * @param {string} link link colado ou o normalizedUrl salvo
 * @param {{expectedSellerId?: string, allowCatalogWinner?: boolean, fetchImpl?: Function,
 *          timeoutMs?: number, maxBytes?: number}} [opts]
 */
export async function readMercadoLivre(link, opts = {}) {
  try {
    let identity;
    if (isMercadoLivreShortLink(link)) identity = await resolveMercadoLivreShortLink(link, opts);
    else identity = normalizeMercadoLivreLink(link, {allowCatalogOnly: !!opts.allowCatalogWinner});
    if (identity.needsItemSelection && !opts.allowCatalogWinner)
      fail("ITEM_REQUIRED", "Catálogo sem anúncio escolhido.");
    const {html, finalUrl, fetchedAt} = await fetchMercadoLivreHtml(identity.normalizedUrl, opts);
    if (!/__NORDIC_RENDERING_CTX__/.test(html)) {
      if (/captcha|recaptcha|verifica[çc][ãa]o de seguran|suspicious|tráfego incomum/i.test(html))
        fail("VERIFICATION_REQUIRED", "A loja pediu verificação.");
      fail("STATE_NOT_FOUND", "A página veio sem os dados do produto.");
    }
    const reading = extractMercadoLivreHtml(html, identity.normalizedUrl, {
      expectedSellerId: opts.expectedSellerId, allowCatalogWinner: !!opts.allowCatalogWinner,
    });
    return {ok: true, reading: {...reading, observedAt: fetchedAt, fetchedFrom: finalUrl}};
  } catch (e) {
    return describeFailure(e);
  }
}

/**
 * Variação contra a leitura ANTERIOR da MESMA identidade (mesma loja/anúncio).
 * @param {number|null} previousCents
 * @param {number} currentCents
 */
export function comparePrice(previousCents, currentCents) {
  if (!Number.isSafeInteger(currentCents) || currentCents <= 0) return null;
  if (!Number.isSafeInteger(previousCents) || previousCents <= 0)
    return {direction: "first", changeCents: 0, changePct: 0};
  const changeCents = currentCents - previousCents;
  const changePct = Math.round((changeCents / previousCents) * 10000) / 100;
  return {direction: changeCents < 0 ? "down" : changeCents > 0 ? "up" : "same", changeCents, changePct};
}

/** Limitador simples por loja: concorrência e intervalo mínimo entre coletas. */
export function createLimiter({concurrency = 2, minIntervalMs = 2500} = {}) {
  let active = 0, last = 0; const queue = [];
  const next = () => {
    if (active >= concurrency || !queue.length) return;
    const wait = Math.max(0, last + minIntervalMs - Date.now());
    if (wait) { setTimeout(next, wait); return; }
    const {fn, resolve, reject} = queue.shift();
    active++; last = Date.now();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
    next();
  };
  return fn => new Promise((resolve, reject) => { queue.push({fn, resolve, reject}); next(); });
}
