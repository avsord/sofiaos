'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), ts = require('typescript'), fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/price-extractor.ts'), 'utf8');
const exported = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText, {exports: exported, Error, JSON, Map, Array, Number, String, Set, Math});
const {EXTRACT_PRICE_SOURCE, buildInjectedScript, parsePriceMessage, formatCurrency} = exported;

// O texto embutido no app não pode divergir do extrator de origem, já
// testado com 11 casos em docs/monitoramento/extract-price.test.js. Compara
// só o CORPO das funções (ignorando module.exports, que o app não precisa).
const strip = s => s.replace(/'use strict';?/g, '').replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/module\.exports[\s\S]*$/m, '').replace(/\s+/g, ' ').trim();

test('a leitura de preço embutida no app é o mesmo código de extract-price.js', () => {
  const original = fs.readFileSync(path.join(__dirname, '../../docs/monitoramento/extract-price.js'), 'utf8');
  const embedded = EXTRACT_PRICE_SOURCE.slice(0, EXTRACT_PRICE_SOURCE.indexOf('function productTitle'));
  assert.equal(strip(embedded), strip(original));
});

test('a leitura do título embutida no app é o mesmo código de find-store-links.js', () => {
  const original = fs.readFileSync(path.join(__dirname, '../../docs/monitoramento/find-store-links.js'), 'utf8');
  const originalTitleFn = original.slice(original.indexOf('function productTitle'), original.indexOf('function slugify'));
  const embeddedTitleFn = EXTRACT_PRICE_SOURCE.slice(EXTRACT_PRICE_SOURCE.indexOf('function productTitle'));
  assert.equal(strip(embeddedTitleFn), strip(originalTitleFn));
});

function docFromHtml(html) { return new JSDOM(html).window.document; }

test('roda dentro de um documento real e acha preço em JSON-LD', () => {
  const fn = new Function('document', EXTRACT_PRICE_SOURCE + '\nreturn extractPrice(document);');
  const doc = docFromHtml('<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"2499.90","priceCurrency":"BRL"}}</script>');
  const result = fn(doc);
  assert.equal(result.found, true);
  assert.equal(result.best.amount, 2499.9);
  assert.equal(result.best.currency, 'BRL');
});

test('productTitle dentro do script injetado lê o nome do produto', () => {
  const fn = new Function('document', EXTRACT_PRICE_SOURCE + '\nreturn productTitle(document);');
  const doc = docFromHtml('<script type="application/ld+json">{"@type":"Product","name":"Placa de vídeo RTX 4070"}</script>');
  assert.equal(fn(doc), 'Placa de vídeo RTX 4070');
});

test('buildInjectedScript gera um IIFE que sempre termina em true e sempre faz postMessage', () => {
  const script = buildInjectedScript();
  assert.ok(script.trim().endsWith('true;'), 'precisa terminar em true; para não travar a WebView no Android');
  assert.ok(script.includes('window.ReactNativeWebView.postMessage'));
  assert.ok(script.includes('catch (e)'), 'erro de leitura não pode travar a WebView sem avisar o app');
});

test('buildInjectedScript roda de ponta a ponta simulando a WebView', () => {
  const doc = docFromHtml('<title>Loja X</title><script type="application/ld+json">{"@type":"Product","name":"Monitor 27\\"","offers":{"price":1899,"priceCurrency":"BRL"}}</script>');
  let sent = null;
  const fakeWindow = {ReactNativeWebView: {postMessage: msg => { sent = msg; }}, document: doc};
  fakeWindow.window = fakeWindow;
  vm.createContext(fakeWindow);
  vm.runInContext(buildInjectedScript(), fakeWindow);
  assert.ok(sent);
  const parsed = parsePriceMessage(sent);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.title, 'Monitor 27"');
  assert.equal(parsed.result.best.amount, 1899);
});

test('parsePriceMessage nunca derruba o app com mensagem malformada', () => {
  assert.equal(parsePriceMessage('isso não é json').ok, false);
  assert.equal(parsePriceMessage('{}').ok, false);
  assert.equal(parsePriceMessage('{"ok":false,"error":"x"}').ok, false);
  assert.equal(parsePriceMessage('null').ok, false);
});

test('formatCurrency cai para um texto simples se a moeda for inválida', () => {
  assert.equal(formatCurrency(10, 'BRL').includes('10'), true);
  assert.equal(typeof formatCurrency(10, 'XXX_INVALIDA'), 'string');
});

function runLinks(html, url, target, exclude, terms) {
  const d = new JSDOM(html, {url});
  let sent = null;
  const w = {ReactNativeWebView: {postMessage: x => { sent = x; }}, document: d.window.document, location: d.window.location, URL, setTimeout: (fn) => fn(), window: null, encodeURIComponent};
  w.window = w; w.scrollTo = () => {}; vm.createContext(w);
  vm.runInContext(exported.buildLinksScript(target, exclude, terms), w);
  return exported.parseLinksMessage(sent);
}

test('busca: aceita o link de produto de cada loja, inclusive subdomínio do Mercado Livre e slug da Pichau', () => {
  const ml = runLinks('<a href="https://produto.mercadolivre.com.br/MLB-3456789012-placa-de-video-rtx-4070-_JM">Placa de Vídeo RTX 4070 12GB</a><a href="https://www.mercadolivre.com.br/ofertas">Ofertas</a>', 'https://lista.mercadolivre.com.br/rtx-4070', 'mercadolivre.com.br', 'kabum.com.br', 'RTX 4070');
  assert.equal(ml.ok, true); assert.deepEqual(ml.links.map(l => l.url), ['https://produto.mercadolivre.com.br/MLB-3456789012-placa-de-video-rtx-4070-_JM']);
  const pi = runLinks('<a href="/placa-de-video-msi-geforce-rtx-4070-ventus-2x-12gb">Placa de Vídeo MSI RTX 4070 Ventus</a><a href="/hardware">Hardware</a><a href="/login">Entrar</a>', 'https://www.pichau.com.br/search?q=rtx', 'pichau.com.br', '', 'RTX 4070');
  assert.deepEqual(pi.links.map(l => l.url), ['https://www.pichau.com.br/placa-de-video-msi-geforce-rtx-4070-ventus-2x-12gb']);
  const az = runLinks('<div class="product"><a href="/Placa-RTX-4070/dp/B0ABCDE123/ref=sr_1_1?keywords=x"><img alt="Placa de Vídeo RTX 4070 Gigabyte"></a></div>', 'https://www.amazon.com.br/s?k=rtx', 'amazon.com.br', '', 'RTX 4070');
  assert.deepEqual(az.links.map(l => l.url), ['https://www.amazon.com.br/dp/B0ABCDE123'], 'link limpo, sem rastreio');
  assert.match(az.links[0].title, /Gigabyte/, 'título vem do alt da imagem quando o link não tem texto');
});

test('busca: decodifica links do buscador de reserva e ordena pela semelhança com o termo', () => {
  const ddg = runLinks('<a href="//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://www.kabum.com.br/produto/111/mouse-gamer') + '">Mouse Gamer Logitech</a>' +
    '<a href="//duckduckgo.com/l/?uddg=' + encodeURIComponent('https://www.kabum.com.br/produto/222/placa-rtx-4070') + '">Placa de Vídeo RTX 4070 Super</a>', 'https://html.duckduckgo.com/html/?q=x', 'kabum.com.br', '', 'Placa RTX 4070 Super');
  assert.equal(ddg.links[0].url, 'https://www.kabum.com.br/produto/222/placa-rtx-4070');
  assert.ok(ddg.links[0].score > ddg.links[1].score);
  assert.equal(exported.fallbackSearchUrl('kabum.com.br', 'RTX 4070'), 'https://html.duckduckgo.com/html/?q=site%3Akabum.com.br%20RTX%204070');
});

test('busca: nunca oferece a loja de origem e só aceita https', () => {
  const r = runLinks('<a href="/produto/9/rtx">RTX 4070 KaBuM</a><a href="https://www.pichau.com.br/p/a-b-c-d">origem</a>', 'https://www.kabum.com.br/busca/rtx', 'kabum.com.br', 'pichau.com.br', 'rtx');
  assert.deepEqual(r.links.map(l => l.url), ['https://www.kabum.com.br/produto/9/rtx']);
  assert.equal(exported.parseLinksMessage('{"ok":true,"links":[{"url":"javascript:alert(1)"}]}').links.length, 0);
});

test('busca: página vazia tenta de novo antes de desistir e avisa quando a loja pede verificação', () => {
  const r = runLinks('<title>Verificação de segurança</title><p>Confirme que você não é um robô</p>', 'https://www.kabum.com.br/busca/x', 'kabum.com.br', '', 'x');
  assert.equal(r.ok, true); assert.equal(r.links.length, 0); assert.equal(r.tries, 11); assert.equal(r.blocked, true);
});
