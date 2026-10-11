'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { findStoreLinks, productTitle, slugify } = require('./find-store-links');

const doc = html => new JSDOM(html).window.document;

test('acha links de produto do domínio certo, ignora o resto', () => {
  const d = doc(`<html><body>
    <a href="/login">Entrar</a>
    <a href="https://www.kabum.com.br/produto/123/placa-de-video-rtx">RTX 4060</a>
    <a href="https://www.pichau.com.br/produto/999/outra-placa">Outra placa (loja errada)</a>
    <a href="https://www.kabum.com.br/">Home (raiz, não é produto)</a>
    <a href="https://www.kabum.com.br/categoria/placas-de-video">Categoria (rasa)</a>
  </body></html>`);
  const links = findStoreLinks(d, 'kabum.com.br', 'https://busca.exemplo.com/', null);
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://www.kabum.com.br/produto/123/placa-de-video-rtx');
  assert.equal(links[0].title, 'RTX 4060');
});

test('nunca sugere a própria loja de origem como "outra loja"', () => {
  const d = doc(`<html><body>
    <a href="https://www.kabum.com.br/produto/1/a">A</a>
    <a href="https://www.kabum.com.br/produto/2/b">B</a>
  </body></html>`);
  const links = findStoreLinks(d, 'kabum.com.br', 'https://x.com/', 'kabum.com.br');
  assert.equal(links.length, 0);
});

test('resolve links relativos contra a URL da página de busca', () => {
  const d = doc('<html><body><a href="/produto/55/mouse-gamer">Mouse</a></body></html>');
  const links = findStoreLinks(d, 'pichau.com.br', 'https://www.pichau.com.br/busca?q=mouse', null);
  assert.equal(links[0].url, 'https://www.pichau.com.br/produto/55/mouse-gamer');
});

test('ignora www. na comparação de domínio', () => {
  const d = doc('<html><body><a href="https://kabum.com.br/produto/1/x">X</a></body></html>');
  const links = findStoreLinks(d, 'kabum.com.br', 'https://y.com/', null);
  assert.equal(links.length, 1);
});

test('deduplica a mesma URL repetida na página', () => {
  const d = doc(`<html><body>
    <a href="https://www.kabum.com.br/produto/1/mesmo">Mesmo A</a>
    <a href="https://www.kabum.com.br/produto/1/mesmo">Mesmo B</a>
  </body></html>`);
  const links = findStoreLinks(d, 'kabum.com.br', 'https://x.com/', null);
  assert.equal(links.length, 1);
});

test('título vem do nome dentro do Product no JSON-LD, não do <title> genérico da loja', () => {
  const d = doc(`<html><head><title>Kabum - A loja que mais entende de você</title>
    <script type="application/ld+json">{"@type":"Product","name":"Placa de Vídeo RTX 4060 8GB"}</script>
    </head><body></body></html>`);
  assert.equal(productTitle(d), 'Placa de Vídeo RTX 4060 8GB');
});

test('título cai para og:title quando não há JSON-LD de Product', () => {
  const d = doc('<html><head><meta property="og:title" content="Mouse Gamer XYZ"></head><body></body></html>');
  assert.equal(productTitle(d), 'Mouse Gamer XYZ');
});

test('slugify remove acento e espaço para montar URL de busca', () => {
  assert.equal(slugify('Placa de Vídeo RTX 4060'), 'placa-de-video-rtx-4060');
  assert.equal(slugify('Água Sanitária 5L'), 'agua-sanitaria-5l');
});
