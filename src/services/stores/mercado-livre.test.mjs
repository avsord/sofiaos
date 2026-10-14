import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  normalizeMercadoLivreLink as normalize, extractMercadoLivreHtml as extract, readNordicContext,
  isMercadoLivreShortLink, resolveMercadoLivreShortLink, fetchMercadoLivreHtml, readMercadoLivre,
  comparePrice, createLimiter, ERROR_POLICY,
} from "./mercado-livre.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixture-oferta-sanitizada.json", import.meta.url), "utf8"));
const ld = JSON.parse(readFileSync(new URL("./fixture-jsonld-sanitizado.json", import.meta.url), "utf8"));
const URL_BASE = "https://www.mercadolivre.com.br/p/MLB42258825";
const URL_OK = URL_BASE + "?pdp_filters=item_id%3AMLB5296520523";
const URL_SHARED = URL_BASE + "?matt_tool=38524122&pdp_filters=item_id:MLB5296520523&ua=REMOVIDO#origin=share&sid=share&wid=MLB5296520523&action=copy";
const key = "mercadolivre:MLB5296520523";
const clone = () => structuredClone(fixture);
const components = obj => obj.appProps.pageProps.initialState.components;
function wrap(obj, tail = "") {
  return '<!DOCTYPE html><html><head><script id="__NORDIC_RENDERING_CTX__">_n.ctx.r=' +
    JSON.stringify(obj) + ";_n.ctx.r.assets=new Map([]);" + tail +
    '</script><script type="application/ld+json">' + JSON.stringify(ld) + "</script></head></html>";
}
const error = (code, fn) => assert.throws(fn, e => e?.code === code);
const rejects = (code, p) => assert.rejects(p, e => e?.code === code);

// ── mock de fetch: mapa url → resposta ──
function mockFetch(routes, log = []) {
  return async (url, init) => {
    log.push({url, init});
    const r = typeof routes === "function" ? routes(url, init) : routes[url];
    if (!r) throw new Error("rota não mockada: " + url);
    if (r.throw) throw r.throw;
    const h = new Headers(r.headers || {"content-type": "text/html; charset=utf-8"});
    return new Response(r.body ?? null, {status: r.status ?? 200, headers: h});
  };
}

// ════════════════ normalização ════════════════
test("link compartilhado preserva o anúncio e remove rastreamento", () => {
  const r = normalize(URL_SHARED);
  assert.equal(r.itemId, "MLB5296520523"); assert.equal(r.catalogProductId, "MLB42258825");
  assert.equal(r.normalizedUrl, URL_OK); assert.equal(r.identityKey, key); assert.equal(r.route, "catalog");
});
test("normalização é idempotente", () => assert.deepEqual(normalize(URL_OK), normalize(normalize(URL_OK).normalizedUrl)));
test("aceita texto de compartilhamento com um link", () => assert.equal(normalize("Olha este produto! " + URL_SHARED).identityKey, key));
test("aceita endereço sem protocolo", () => assert.equal(normalize(URL_OK.replace("https://", "")).normalizedUrl, URL_OK));
test("converte HTTP para HTTPS", () => assert.equal(normalize(URL_OK.replace("https:", "http:")).normalizedUrl, URL_OK));
test("wid no fragmento é lido antes de remover o fragmento", () => assert.equal(normalize(URL_BASE + "#origin=share&wid=MLB5296520523").normalizedUrl, URL_OK));
test("wid na consulta identifica anúncio", () => assert.equal(normalize(URL_BASE + "?wid=MLB5296520523").normalizedUrl, URL_OK));
test("catálogo com slug antes de /p/ é aceito", () => assert.equal(
  normalize("https://www.mercadolivre.com.br/fone-x/p/MLB42258825?pdp_filters=item_id:MLB5296520523").identityKey, key));
test("anúncio /MLB-… preserva caminho sem inventar slug", () => {
  const u = "https://produto.mercadolivre.com.br/MLB-5296520523-titulo-conhecido";
  const r = normalize(u + "?matt_tool=123#position=3");
  assert.equal(r.normalizedUrl, u); assert.equal(r.route, "listing"); assert.equal(r.identityKey, key);
});
test("/up/ com wid vira identidade do anúncio", () => {
  const r = normalize("https://www.mercadolivre.com.br/fones-baseus/up/MLBU4015253503#polycard_client=x&wid=MLB4719125711&sid=recos");
  assert.equal(r.identityKey, "mercadolivre:MLB4719125711"); assert.equal(r.userProductId, "MLBU4015253503");
  assert.equal(r.normalizedUrl, "https://www.mercadolivre.com.br/up/MLBU4015253503?wid=MLB4719125711");
});
test("/up/ sem wid exige link completo", () => error("ITEM_REQUIRED", () => normalize("https://www.mercadolivre.com.br/up/MLBU4015253503")));
test("catálogo sem anúncio: recusado por padrão", () => error("ITEM_REQUIRED", () => normalize(URL_BASE)));
test("catálogo sem anúncio: aceito como pendente com allowCatalogOnly", () => {
  const r = normalize(URL_BASE + "?matt_tool=1", {allowCatalogOnly: true});
  assert.equal(r.itemId, null); assert.equal(r.identityKey, null); assert.equal(r.needsItemSelection, true);
  assert.equal(r.normalizedUrl, URL_BASE);
});
test("wid e pdp_filters conflitantes", () => error("ITEM_CONFLICT", () => normalize(URL_OK + "#wid=MLB6460681458")));
test("valores repetidos conflitantes", () => error("ITEM_CONFLICT", () => normalize(URL_OK + "&wid=MLB6460681458")));
test("domínio parecido malicioso", () => error("UNSUPPORTED_HOST", () => normalize(URL_OK.replace(".com.br/", ".com.br.evil.example/"))));
test("usuário/senha na URL", () => error("INVALID_URL", () => normalize(URL_OK.replace("https://", "https://x:y@"))));
test("porta personalizada", () => error("INVALID_URL", () => normalize(URL_OK.replace(".com.br/", ".com.br:8443/"))));
test("meli:// e intent:// recusados", () => {
  error("INVALID_URL", () => normalize("meli://item?id=MLB5296520523"));
  error("INVALID_URL", () => normalize("intent://item/MLB5296520523"));
});
test("mais de um link exige escolha", () => error("MULTIPLE_URLS", () => normalize(URL_OK + " " + URL_OK)));
test("filtros desconhecidos não são descartados", () => error("UNSUPPORTED_FILTERS", () => normalize(URL_BASE + "?pdp_filters=item_id:MLB5296520523%7Cshipping:free")));
test("variante explícita não é perdida", () => error("UNSUPPORTED_VARIATION", () => normalize(URL_OK + "&variation_id=123")));
test("busca/lista não é anúncio", () => error("UNSUPPORTED_ROUTE", () => normalize("https://lista.mercadolivre.com.br/fone")));
test("rota de busca no host principal", () => error("UNSUPPORTED_ROUTE", () => normalize("https://www.mercadolivre.com.br/ofertas")));
test("link curto é sinalizado como resolvível, nunca aberto", () => {
  assert.equal(isMercadoLivreShortLink("https://mercadolivre.com/sec/1AbC23x"), true);
  assert.equal(isMercadoLivreShortLink(URL_OK), false);
  assert.throws(() => normalize("https://mercadolivre.com/sec/1AbC23x"), e => e.code === "SHORT_LINK" && e.resolvable === true);
});
test("200 combinações de rastreamento → mesma identidade", () => {
  for (let i = 0; i < 200; i++) {
    const u = URL_BASE + "?ua=tracker" + i + "&matt_tool=" + i + "&wid=MLB5296520523&pdp_filters=item_id%3AMLB5296520523#origin=share&sid=" + i;
    assert.equal(normalize(u).normalizedUrl, URL_OK);
  }
});

// ════════════════ extração estrita ════════════════
test("fixture real reduzida → R$1412,83, TechPrime", () => {
  const r = extract(wrap(fixture), URL_SHARED, {expectedSellerId: "427963557"});
  assert.equal(r.amount, 1412.83); assert.equal(r.amountCents, 141283); assert.equal(r.currency, "BRL");
  assert.equal(r.seller.name, "TechPrime"); assert.equal(r.seller.id, "427963557");
  assert.equal(r.itemId, "MLB5296520523"); assert.equal(r.identityKey, key);
  assert.equal(r.normalizedUrl, URL_OK); assert.equal(r.itemSelectedBy, "link");
  assert.equal(r.observedAt, null); assert.equal(r.shippingAmount, null); assert.equal(r.layout, "pdp");
  assert.equal(r.cleanPermalink, "https://www.mercadolivre.com.br/fone-de-ouvido-shokz-openrun-pro-2-sem-fio-conducao-ossea-esporte-preto/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523");
});
test("ignora JSON-LD de outro SKU (1576)", () => {
  assert.equal(ld.hasVariant[0].offers.price, 1576);
  assert.equal(extract(wrap(fixture), URL_OK).amount, 1412.83);
});
test("não escolhe a primeira oferta (1498,98) nem a mais barata (1277)", () => {
  const r = extract(wrap(fixture), URL_OK);
  assert.equal(r.amount, 1412.83);
  assert.ok(r.extras.otherOffers.some(o => o.priceCents === 149898));
  assert.ok(r.extras.otherOffers.some(o => o.priceCents === 127700));
});
test("ignora 'a partir de', parcelas, relacionados e gtm", () => {
  const x = clone(); const c = components(x);
  c.recommendations = [{price: 0.01}]; c.installments = {price: 137.15};
  c.track.gtm_event = {itemPrice: 283.18, localItemPrice: 1412.83};
  assert.equal(extract(wrap(x), URL_OK).amount, 1412.83);
});
test("não executa JavaScript antes ou depois do JSON", () => {
  globalThis.__mlExecuted = false;
  const h = "<script>globalThis.__mlExecuted=true</script>" + wrap(fixture, "globalThis.__mlExecuted=true;");
  assert.equal(extract(h, URL_OK).amount, 1412.83);
  assert.equal(globalThis.__mlExecuted, false); delete globalThis.__mlExecuted;
});
test("extração não usa rede", () => {
  const o = globalThis.fetch; globalThis.fetch = () => { throw Error("REDE PROIBIDA"); };
  try { assert.equal(extract(wrap(fixture), URL_OK).amount, 1412.83); } finally { globalThis.fetch = o; }
});
test("chaves e aspas em texto não truncam o JSON", () => {
  const x = clone(); components(x).header.title = 'Fone {teste} "especial" \\ fim </ script';
  assert.equal(extract(wrap(x), URL_OK).title, components(x).header.title);
});
test("preço não está fixo no código", () => {
  const x = clone(), c = components(x);
  c.price.price.value = 1300.25; c.track.melidata_event.event_data.price = 1300.25;
  c.buy_box_offers.items[1].components[0].price.value = 1300.25;
  assert.equal(extract(wrap(x), URL_OK).amountCents, 130025);
});
test("preço principal divergente", () => { const x = clone(); components(x).price.price.value = 100; error("PRICE_CONFLICT", () => extract(wrap(x), URL_OK)); });
test("preço da oferta selecionada divergente", () => { const x = clone(); components(x).buy_box_offers.items[1].components[0].price.value = 1277; error("PRICE_CONFLICT", () => extract(wrap(x), URL_OK)); });
test("oferta selecionada de outro anúncio", () => { const x = clone(); components(x).buy_box_offers.items[1].item_id = "MLB6460681458"; error("OFFER_MISMATCH", () => extract(wrap(x), URL_OK)); });
test("duas ofertas selecionadas", () => { const x = clone(); components(x).buy_box_offers.items[0].selected = true; error("OFFER_MISMATCH", () => extract(wrap(x), URL_OK)); });
test("anúncio renderizado diferente do pedido", () => error("ITEM_MISMATCH", () => extract(wrap(fixture), URL_BASE + "?wid=MLB6460681458")));
test("vendedor mudou", () => error("SELLER_MISMATCH", () => extract(wrap(fixture), URL_OK, {expectedSellerId: "740521218"})));
test("expectedSellerId null = primeira leitura", () => assert.equal(extract(wrap(fixture), URL_OK, {expectedSellerId: null}).seller.id, "427963557"));
test("catálogo diferente", () => error("CATALOG_MISMATCH", () => extract(wrap(fixture), URL_OK.replace("MLB42258825", "MLB69202941"))));
test("link de catálogo mas página sem catálogo", () => {
  const x = clone(); delete components(x).track.melidata_event.event_data.catalog_product_id;
  error("CATALOG_MISMATCH", () => extract(wrap(x), URL_OK));
});
test("botão de compra de outro anúncio", () => { const x = clone(); components(x).main_actions.form.item_id = "MLB6460681458"; error("ITEM_MISMATCH", () => extract(wrap(x), URL_OK)); });
test("permalink de outro anúncio", () => { const x = clone(); components(x).share.permalink = URL_BASE + "?pdp_filters=item_id:MLB6460681458"; error("ITEM_MISMATCH", () => extract(wrap(x), URL_OK)); });
test("preço zero", () => { const x = clone(); components(x).price.price.value = 0; error("INVALID_PRICE", () => extract(wrap(x), URL_OK)); });
test("moeda ≠ BRL", () => { const x = clone(); components(x).price.price.currency_id = "USD"; error("CURRENCY_MISMATCH", () => extract(wrap(x), URL_OK)); });
test("preço oculto", () => { const x = clone(); components(x).price.state = "HIDDEN"; error("PRICE_MISSING", () => extract(wrap(x), URL_OK)); });
test("sem estoque", () => { const x = clone(); components(x).track.melidata_event.event_data.has_stock = false; error("UNAVAILABLE", () => extract(wrap(x), URL_OK)); });
test("página de login/erro", () => error("STATE_NOT_FOUND", () => extract("<html>Faça login</html>", URL_OK)));
test("JSON incompleto, sem eval", () => error("INVALID_STATE", () => readNordicContext('<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r={"a":2;</script>')));
test("bloco duplicado", () => error("STATE_NOT_FOUND", () => extract(wrap(fixture) + wrap(fixture), URL_OK)));
test("HTML acima do limite", () => error("INVALID_HTML", () => extract(" ".repeat(5_000_001), URL_OK)));

test("catálogo sem anúncio + allowCatalogWinner adota a oferta selecionada pela loja", () => {
  error("ITEM_REQUIRED", () => extract(wrap(fixture), URL_BASE));
  const r = extract(wrap(fixture), URL_BASE, {allowCatalogWinner: true});
  assert.equal(r.itemId, "MLB5296520523"); assert.equal(r.itemSelectedBy, "store_buy_box");
  assert.equal(r.normalizedUrl, URL_OK); assert.equal(r.identityKey, key);
});
test("página de anúncio simples (sem catálogo e sem buy box) ainda valida 2 fontes", () => {
  const x = clone(); const s = x.appProps.pageProps.initialState; const c = s.components;
  s.id = "MLB5296520523"; delete s.filters; delete c.buy_box_offers;
  delete c.track.melidata_event.event_data.catalog_product_id;
  c.share.permalink = "https://produto.mercadolivre.com.br/MLB-5296520523-fone-shokz-_JM?matt_tool=1";
  const r = extract(wrap(x), "https://produto.mercadolivre.com.br/MLB-5296520523-fone-shokz-_JM");
  assert.equal(r.amountCents, 141283); assert.equal(r.layout, "item"); assert.equal(r.catalogProductId, null);
  assert.equal(r.normalizedUrl, "https://produto.mercadolivre.com.br/MLB-5296520523-fone-shokz-_JM");
  c.price.price.value = 999; error("PRICE_CONFLICT", () => extract(wrap(x), r.normalizedUrl));
});

// ════════════════ extras ════════════════
test("extras: imagens, parcelas, nota, specs, variantes, ofertas, frete", () => {
  const e = extract(wrap(fixture), URL_OK).extras;
  assert.equal(e.images.length, 5);
  assert.equal(e.images[0], "https://http2.mlstatic.com/D_NQ_NP_820472-MLA99525270224_122025-O.webp");
  assert.deepEqual(e.installments, {count: 12, amountCents: 13715, totalCents: 164580, noInterest: false});
  assert.deepEqual(e.rating, {value: 4.9, count: 221});
  assert.equal(e.brand, "Shokz"); assert.equal(e.model, "OpenRun Pro 2"); assert.equal(e.specs["Classificação IP"], "IP67");
  assert.equal(e.condition, "new"); assert.equal(e.availableQuantity, 6); assert.equal(e.soldQuantityMin, 100);
  assert.equal(e.sellerReputation, "4_light_green"); assert.equal(e.officialStore, false); assert.equal(e.freeShipping, true);
  assert.equal(e.lowestNewFromCents, 127700);
  assert.equal(e.variants.length, 3); assert.equal(e.variants.find(v => v.selected).value, "Preto");
  assert.deepEqual(e.category.path, ["Celulares e Telefones", "Acessórios para Celulares", "Fones de Ouvido"]);
  const v = e.otherOffers.find(o => o.itemId === "MLB6460681458");
  assert.equal(v.sellerName, "VALIMARTIGOSESPORTIVOS"); assert.equal(v.label, "Parcelamento sem juros");
  const h = e.otherOffers.find(o => o.itemId === "MLB5343956368");
  assert.equal(h.sellerName, "HappyOutlet1"); assert.equal(h.originalPriceCents, 190900);
  assert.ok(!e.otherOffers.some(o => o.itemId === "MLB5296520523"));
  assert.equal(e.shippingPromises[0], "Chegará entre 10 e 13/nov");
  assert.match(e.shippingPromises[1], /grátis \(de R\$ 32,30\) R\$ 0,00 por ser sua primeira compra/);
});
test("extras quebrados não derrubam a leitura do preço", () => {
  const x = clone(); const c = components(x);
  c.gallery = "lixo"; c.highlighted_specs_attrs = {components: [{type: "technical_specifications", specs: 5}]};
  c.bbw_alternatives = {items: [{id: "nada"}]}; c.shipping_section = {promises: {items: "x"}};
  c.track.melidata_event.event_data.credit_view_components = null; c.header.reviews = "?";
  const r = extract(wrap(x), URL_OK);
  assert.equal(r.amountCents, 141283); assert.deepEqual(r.extras.images, []); assert.equal(r.extras.installments, null);
});
test("desconto só aparece se original > atual", () => {
  const x = clone(); components(x).price.price.original_value = 1909;
  const e = extract(wrap(x), URL_OK).extras;
  assert.equal(e.originalPriceCents, 190900); assert.equal(e.discountPct, 26);
  components(x).price.price.original_value = 100;
  assert.equal(extract(wrap(x), URL_OK).extras.discountPct, null);
});
test("id de imagem malicioso é descartado", () => {
  const x = clone(); components(x).gallery.pictures = [{id: "../../evil"}, {id: "820472-MLA99525270224_122025"}];
  assert.equal(extract(wrap(x), URL_OK).extras.images.length, 1);
});

// ════════════════ rede (mock) ════════════════
const PAGE = wrap(fixture);
test("fetch: baixa HTML, sem cookies, redirect manual, headers pt-BR", async () => {
  const log = [];
  const r = await fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {body: PAGE}}, log)});
  assert.equal(r.html, PAGE); assert.equal(r.finalUrl, URL_OK);
  assert.equal(log[0].init.redirect, "manual"); assert.equal(log[0].init.credentials, "omit");
  assert.match(log[0].init.headers["accept-language"], /pt-BR/);
  assert.ok(!Number.isNaN(Date.parse(r.fetchedAt)));
});
test("fetch: segue redirect interno validado", async () => {
  const other = "https://www.mercadolivre.com.br/fone/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523";
  const r = await fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({
    [URL_OK]: {status: 301, headers: {location: other}}, [other]: {body: PAGE}})});
  assert.equal(r.finalUrl, other);
});
test("fetch: redirect para domínio externo é recusado", () =>
  rejects("UNSAFE_REDIRECT", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 302, headers: {location: "https://evil.example/x"}}})})));
test("fetch: redirect para IP/porta é recusado", () =>
  rejects("UNSAFE_REDIRECT", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 302, headers: {location: "https://127.0.0.1:8080/"}}})})));
test("fetch: redirect para http é recusado", () =>
  rejects("UNSAFE_REDIRECT", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 302, headers: {location: "http://www.mercadolivre.com.br/x"}}})})));
test("fetch: redirect para login = verificação, não contorna", () =>
  rejects("VERIFICATION_REQUIRED", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 302, headers: {location: "https://www.mercadolivre.com.br/jms/mlb/lgz/login?go=x"}}})})));
test("fetch: loop de redirect é cortado", () =>
  rejects("TOO_MANY_REDIRECTS", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch(() => ({status: 302, headers: {location: URL_OK}}))})));
test("fetch: 429, 403, 500, não-HTML", async () => {
  await rejects("RATE_LIMITED", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 429}})}));
  await rejects("BLOCKED", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 403}})}));
  await rejects("HTTP_ERROR", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {status: 500}})}));
  await rejects("HTTP_ERROR", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {body: "{}", headers: {"content-type": "application/json"}}})}));
});
test("fetch: corpo acima do limite (stream) é cortado", () =>
  rejects("TOO_LARGE", fetchMercadoLivreHtml(URL_OK, {maxBytes: 1000, fetchImpl: mockFetch({[URL_OK]: {body: "x".repeat(5000)}})})));
test("fetch: tempo limite", () =>
  rejects("TIMEOUT", fetchMercadoLivreHtml(URL_OK, {timeoutMs: 30, fetchImpl: (u, init) => new Promise((_, rej) =>
    init.signal.addEventListener("abort", () => rej(new Error("aborted"))))})));
test("fetch: erro de rede", () =>
  rejects("NETWORK", fetchMercadoLivreHtml(URL_OK, {fetchImpl: mockFetch({[URL_OK]: {throw: new Error("ECONNRESET")}})})));
test("fetch: destino inicial fora do ML é recusado antes da rede", async () => {
  let called = false;
  await rejects("UNSAFE_REDIRECT", fetchMercadoLivreHtml("https://evil.example/", {fetchImpl: () => { called = true; }}));
  assert.equal(called, false);
});

test("link curto: resolvido por redirects validados", async () => {
  const short = "https://mercadolivre.com/sec/1AbC23x";
  const id = await resolveMercadoLivreShortLink(short, {fetchImpl: mockFetch({[short]: {status: 302, headers: {location: URL_SHARED}}})});
  assert.equal(id.identityKey, key); assert.equal(id.normalizedUrl, URL_OK);
});
test("link curto que vai para fora é recusado", async () => {
  const short = "https://mercadolivre.com/sec/1AbC23x";
  await rejects("UNSAFE_REDIRECT", resolveMercadoLivreShortLink(short, {fetchImpl: mockFetch({[short]: {status: 302, headers: {location: "https://bit.ly/x"}}})}));
});

// ════════════════ fluxo completo ════════════════
test("readMercadoLivre: sucesso grava observedAt real da coleta", async () => {
  const r = await readMercadoLivre(URL_SHARED, {expectedSellerId: "427963557", fetchImpl: mockFetch({[URL_OK]: {body: PAGE}})});
  assert.equal(r.ok, true); assert.equal(r.reading.amountCents, 141283);
  assert.ok(!Number.isNaN(Date.parse(r.reading.observedAt))); assert.equal(r.reading.fetchedFrom, URL_OK);
});
test("readMercadoLivre: link curto + catálogo vencedor", async () => {
  const short = "https://mercadolivre.com/sec/9ZZ";
  const r = await readMercadoLivre(short, {allowCatalogWinner: true, fetchImpl: mockFetch({
    [short]: {status: 301, headers: {location: URL_BASE + "?matt_tool=1"}}, [URL_BASE]: {body: PAGE}})});
  assert.equal(r.ok, true); assert.equal(r.reading.itemSelectedBy, "store_buy_box"); assert.equal(r.reading.identityKey, key);
});
test("readMercadoLivre: nunca lança; falha preserva último preço", async () => {
  const cases = [
    [{[URL_OK]: {status: 429}}, "RATE_LIMITED", true],
    [{[URL_OK]: {body: "<html>Por favor complete o captcha</html>"}}, "VERIFICATION_REQUIRED", false],
    [{[URL_OK]: {body: "<html>ok</html>"}}, "STATE_NOT_FOUND", true],
  ];
  for (const [routes, code, retry] of cases) {
    const r = await readMercadoLivre(URL_OK, {fetchImpl: mockFetch(routes)});
    assert.equal(r.ok, false); assert.equal(r.code, code); assert.equal(r.retryable, retry); assert.equal(r.keepLastPrice, true);
  }
  const s = await readMercadoLivre(URL_OK, {expectedSellerId: "1", fetchImpl: mockFetch({[URL_OK]: {body: PAGE}})});
  assert.equal(s.code, "SELLER_MISMATCH"); assert.equal(s.needsUserAction, true);
  const bad = await readMercadoLivre("https://evil.example/p/MLB1", {fetchImpl: () => assert.fail("não deveria buscar")});
  assert.equal(bad.code, "UNSUPPORTED_HOST");
  const cat = await readMercadoLivre(URL_BASE, {fetchImpl: () => assert.fail("não deveria buscar")});
  assert.equal(cat.code, "ITEM_REQUIRED");
});
test("todo código de erro conhecido tem política", () => {
  for (const c of ["NETWORK", "TIMEOUT", "RATE_LIMITED", "SELLER_MISMATCH", "UNAVAILABLE", "PRICE_CONFLICT"]) assert.ok(ERROR_POLICY[c]);
});

// ════════════════ utilitários ════════════════
test("comparePrice compara com a leitura anterior da mesma identidade", () => {
  assert.deepEqual(comparePrice(null, 141283), {direction: "first", changeCents: 0, changePct: 0});
  assert.deepEqual(comparePrice(149898, 141283), {direction: "down", changeCents: -8615, changePct: -5.75});
  assert.deepEqual(comparePrice(141283, 141283), {direction: "same", changeCents: 0, changePct: 0});
  assert.equal(comparePrice(100, 0), null);
});
test("limiter respeita concorrência e intervalo", async () => {
  const limit = createLimiter({concurrency: 1, minIntervalMs: 40});
  const t = []; const t0 = Date.now();
  await Promise.all([1, 2, 3].map(i => limit(async () => { t.push(Date.now() - t0); return i; })));
  assert.ok(t[1] - t[0] >= 35 && t[2] - t[1] >= 35, JSON.stringify(t));
});

// ════════════════ HTML original (opcional) ════════════════
test("HTML ORIGINAL enviado pelo usuário", {skip: !process.env.ML_HTML_PATH}, () => {
  const original = readFileSync(process.env.ML_HTML_PATH, "utf8");
  const a = extract(original, URL_SHARED, {expectedSellerId: "427963557"});
  assert.equal(a.amountCents, 141283); assert.equal(a.seller.name, "TechPrime"); assert.equal(a.identityKey, key);
  assert.equal(a.extras.images.length, 5); assert.equal(a.extras.rating.count, 221);
  assert.equal(a.extras.otherOffers.length, 2); assert.equal(a.extras.lowestNewFromCents, 127700);
});

// ════════════════ 0.3.138: layouts sem o evento de rastreio ════════════════
test("sem track: identidade por 2+ fontes da mesma página; preço do componente principal", () => {
  const x = clone(); delete components(x).track;
  const r = extract(wrap(x), URL_OK);
  assert.equal(r.amountCents, 141283); assert.equal(r.itemId, "MLB5296520523");
  assert.equal(r.catalogProductId, "MLB42258825"); assert.equal(r.identitySource, "page");
  assert.equal(r.seller.id, "427963557");
});
test("sem track: fontes discordando = ITEM_MISMATCH; nenhuma fonte = motivo exato", () => {
  const x = clone(); delete components(x).track; components(x).bookmark = {item_id: "MLB6460681458"};
  error("ITEM_MISMATCH", () => extract(wrap(x), URL_OK));
  const y = clone(); const c = components(y); delete c.track; delete c.main_actions; delete c.bookmark; delete c.share; delete c.buy_box_offers;
  delete y.appProps.pageProps.initialState.filters;
  assert.throws(() => extract(wrap(y), URL_OK), e => e.code === "STATE_NOT_FOUND" && /sem identificação/.test(e.message));
});
test("sem track: buy box (se existir) ainda confere o preço", () => {
  const x = clone(); delete components(x).track; components(x).price.price.value = 999;
  error("PRICE_CONFLICT", () => extract(wrap(x), URL_OK));
});
test("estrutura desconhecida: erro diz os NOMES das chaves (nunca valores)", () => {
  assert.throws(() => extract('<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r={"appProps":{"pageProps":{"x":{"segredo":"VALOR"}}}}</script>', URL_OK),
    e => e.code === "STATE_NOT_FOUND" && /pageProps:x/.test(e.message) && !/VALOR/.test(e.message));
});
