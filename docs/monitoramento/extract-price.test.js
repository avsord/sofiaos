'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { extractPrice, parseAmount } = require('./extract-price');

const doc = html => new JSDOM(html).window.document;

test('números em formato brasileiro e americano', () => {
  assert.equal(parseAmount('R$ 1.299,90'), 1299.90);
  assert.equal(parseAmount('1.299,90'), 1299.90);
  assert.equal(parseAmount('$1,299.90'), 1299.90);
  assert.equal(parseAmount('1299.90'), 1299.90);
  assert.equal(parseAmount('1299'), 1299);
  assert.equal(parseAmount('89,90'), 89.90);
  assert.equal(parseAmount('R$ 12.345.678,99'), 12345678.99);
  assert.equal(parseAmount(' 2.500 '), 2500, 'milhar sem decimais');
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('esgotado'), null);
  assert.equal(parseAmount('0'), null, 'preço zero não é preço');
  assert.equal(parseAmount(-5), null);
});

test('JSON-LD schema.org Product/Offer, o caso mais comum', () => {
  const r = extractPrice(doc(`<html><head>
    <script type="application/ld+json">{
      "@context":"https://schema.org","@type":"Product","name":"Mouse",
      "offers":{"@type":"Offer","price":"249.90","priceCurrency":"BRL","availability":"InStock"}
    }</script></head><body></body></html>`));
  assert.equal(r.found, true);
  assert.equal(r.best.amount, 249.90);
  assert.equal(r.best.currency, 'BRL');
  assert.equal(r.needsConfirmation, false, 'fonte estruturada e sem concorrente');
});

test('JSON-LD dentro de @graph, usado por muitas lojas em VTEX/Magento', () => {
  const r = extractPrice(doc(`<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"BreadcrumbList"},
      {"@type":"Product","offers":{"@type":"Offer","price":4799,"priceCurrency":"BRL"}}
    ]}</script></head><body></body></html>`));
  assert.equal(r.best.amount, 4799);
  assert.equal(r.best.currency, 'BRL');
});

test('AggregateOffer com lowPrice tem confiança menor', () => {
  const r = extractPrice(doc(`<html><head>
    <script type="application/ld+json">{"@type":"Product","offers":{
      "@type":"AggregateOffer","lowPrice":"1890.00","highPrice":"2300.00","priceCurrency":"BRL"}}
    </script></head><body></body></html>`));
  assert.equal(r.best.amount, 1890);
  assert.equal(r.needsConfirmation, true, 'faixa de preço precisa de confirmação');
});

test('microdata itemprop, formato antigo ainda em uso', () => {
  const r = extractPrice(doc(`<html><body>
    <div itemtype="https://schema.org/Product" itemscope>
      <span itemprop="priceCurrency" content="BRL"></span>
      <span itemprop="price" content="329.99">R$ 329,99</span>
    </div></body></html>`));
  assert.equal(r.best.amount, 329.99);
  assert.equal(r.best.currency, 'BRL');
});

test('meta og:price como fallback', () => {
  const r = extractPrice(doc(`<html><head>
    <meta property="product:price:amount" content="159.00">
    <meta property="product:price:currency" content="BRL">
    </head><body></body></html>`));
  assert.equal(r.best.amount, 159);
  assert.equal(r.best.currency, 'BRL');
});

test('fontes concordando elevam a confiança', () => {
  const r = extractPrice(doc(`<html><head>
    <script type="application/ld+json">{"@type":"Product","offers":{"price":"99.90","priceCurrency":"BRL"}}</script>
    <meta property="product:price:amount" content="99.90">
    <meta property="product:price:currency" content="BRL">
    </head><body></body></html>`));
  assert.equal(r.candidates.length, 1, 'mesmo valor agrupa');
  assert.equal(r.candidates[0].origins.length, 2);
  assert.equal(r.needsConfirmation, false);
});

test('fontes DISCORDANDO exigem confirmação do usuário', () => {
  const r = extractPrice(doc(`<html><head>
    <script type="application/ld+json">{"@type":"Product","offers":{"price":"99.90","priceCurrency":"BRL"}}</script>
    <meta property="product:price:amount" content="149.90">
    <meta property="product:price:currency" content="BRL">
    </head><body></body></html>`));
  assert.ok(r.candidates.length >= 2);
  assert.equal(r.needsConfirmation, true, 'nunca escolher sozinho entre valores diferentes');
});

test('sem nada estruturado cai no texto visível, com baixa confiança', () => {
  const r = extractPrice(doc(`<html><body>
    <main><div class="product-price">Por R$ 1.499,00 à vista</div></main>
    </body></html>`));
  assert.equal(r.found, true);
  assert.equal(r.best.amount, 1499);
  assert.equal(r.best.currency, 'BRL');
  assert.equal(r.needsConfirmation, true, 'palpite nunca é automático');
});

test('página sem preço nenhum não inventa valor', () => {
  const r = extractPrice(doc('<html><body><h1>Produto indisponível</h1></body></html>'));
  assert.equal(r.found, false);
  assert.equal(r.best, null);
  assert.equal(r.needsConfirmation, true);
});

test('JSON-LD quebrado não derruba a leitura das outras fontes', () => {
  const r = extractPrice(doc(`<html><head>
    <script type="application/ld+json">{isso não é json}</script>
    <meta property="product:price:amount" content="55.50">
    <meta property="product:price:currency" content="BRL">
    </head><body></body></html>`));
  assert.equal(r.best.amount, 55.50);
});
