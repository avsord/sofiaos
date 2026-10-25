'use strict';
// Conexoes de lojas do Price Tracker - UM contrato para todas.
//
// Cada loja expoe: status(), connectUrl() (quando a conexao e por login da pessoa),
// callback() e read(itemId) devolvendo SEMPRE o mesmo formato de leitura:
//   {provider, itemId, title, amountCents, currency, inStock, seller:{id,name},
//    observedAt, source:'api', catalogProductId?, permalink?}
//
// Mercado Livre: OAuth da propria pessoa (igual a Conta Google). O token dela le o
//   preco de QUALQUER anuncio pela API oficial (api.mercadolibre.com/items/{id}).
//   Sem navegador, sem verificacao, sem tela "Abra o app".
// AliExpress: a API oficial e por chave do aplicativo (Sofia), nao por login da pessoa.
//   Com ALIEXPRESS_APP_KEY/SECRET no servidor, aparece "Conectado pelo Sofia" para todos.
//
// Tokens ficam criptografados (AES-256-GCM) com SOFIA_CALENDAR_TOKEN_KEY, como os do Google.
const crypto = require('node:crypto');
const {AppError} = require('../core/util');

const ML_AUTH = 'https://auth.mercadolivre.com.br/authorization', ML_TOKEN = 'https://api.mercadolibre.com/oauth/token', ML_API = 'https://api.mercadolibre.com';
const ML_CALLBACK = '/stores/mercadolivre/oauth/callback';
const ALI_GATEWAY = 'https://api-sg.aliexpress.com/sync';
const now = () => new Date().toISOString();
const ITEM = /^MLB\d{6,16}$/;

class StoreConnections {
  constructor(store, config, options = {}) {
    this.db = store.db; this.config = config;
    this.fetch = options.fetchImpl || global.fetch; this.env = options.env || process.env;
    this.access = null; this.sellerNames = new Map();
    this.db.exec(`CREATE TABLE IF NOT EXISTS store_link(provider TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS store_oauth_state(state TEXT PRIMARY KEY, provider TEXT NOT NULL, created_at TEXT NOT NULL);`);
  }

  // ---------- comum ----------
  key() { return crypto.createHash('sha256').update(String(this.env.SOFIA_CALENDAR_TOKEN_KEY || '')).digest(); }
  seal(text) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', this.key(), iv); const d = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); }
  open(sealed) { const [iv, tag, d] = String(sealed).split('.').map(s => Buffer.from(s, 'base64')); const x = crypto.createDecipheriv('aes-256-gcm', this.key(), iv); x.setAuthTag(tag); return Buffer.concat([x.update(d), x.final()]).toString('utf8'); }
  link(provider) { const r = this.db.prepare('SELECT data FROM store_link WHERE provider=?').get(provider); return r ? JSON.parse(r.data) : null; }
  saveLink(provider, d) { this.db.prepare('INSERT INTO store_link VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET data=excluded.data').run(provider, JSON.stringify(d)); }
  redirectUri() { return String(this.config.publicBaseUrl || '').replace(/\/$/, '') + ML_CALLBACK; }
  mlConfigured() { return !!(this.env.ML_APP_ID && this.env.ML_APP_SECRET && this.env.SOFIA_CALENDAR_TOKEN_KEY); }
  aliConfigured() { return !!(this.env.ALIEXPRESS_APP_KEY && this.env.ALIEXPRESS_APP_SECRET); }

  /** Estado de cada loja, no mesmo formato: o app desenha a tela "Conexoes" a partir disto. */
  status() {
    const ml = this.link('mercadolivre') || {};
    return {
      stores: [
        {provider: 'mercadolivre', name: 'Mercado Livre', mode: 'login', configured: this.mlConfigured(),
          connected: !!ml.refresh, account: ml.nickname || '', connected_at: ml.connected_at || null, error: ml.last_error || '',
          redirect_uri: this.mlConfigured() ? this.redirectUri() : undefined},
        {provider: 'aliexpress', name: 'AliExpress', mode: 'server', configured: this.aliConfigured(),
          connected: this.aliConfigured(), account: this.aliConfigured() ? 'chave do Sofia' : '', connected_at: null, error: ''},
      ],
    };
  }

  // ---------- Mercado Livre: OAuth ----------
  connectUrl(provider, options = {}) {
    if (provider !== 'mercadolivre') throw new AppError('STORE_NO_LOGIN', 'Esta loja nao usa login da pessoa.', 400);
    if (!this.mlConfigured()) throw new AppError('ML_NOT_CONFIGURED', 'A conexao com o Mercado Livre ainda nao foi configurada no servidor (ML_APP_ID / ML_APP_SECRET).', 503);
    const state = (options.app ? 'a.' : '') + crypto.randomBytes(24).toString('base64url');
    this.db.prepare('DELETE FROM store_oauth_state WHERE created_at<?').run(new Date(Date.now() - 15 * 60000).toISOString());
    this.db.prepare('INSERT INTO store_oauth_state VALUES(?,?,?)').run(state, provider, now());
    const q = new URLSearchParams({response_type: 'code', client_id: this.env.ML_APP_ID, redirect_uri: this.redirectUri(), state});
    return {url: ML_AUTH + '?' + q.toString()};
  }
  async callback(params) {
    const state = String(params.get('state') || ''), code = String(params.get('code') || '');
    if (params.get('error')) return {ok: false, message: 'A autorizacao foi cancelada no Mercado Livre. Nada foi conectado.'};
    const row = state && this.db.prepare('SELECT * FROM store_oauth_state WHERE state=?').get(state);
    if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60000) return {ok: false, message: 'Este link de autorizacao expirou. Volte ao app e toque em Conectar de novo.'};
    this.db.prepare('DELETE FROM store_oauth_state WHERE state=?').run(state);
    const t = await this.mlTokenRequest({grant_type: 'authorization_code', code, redirect_uri: this.redirectUri()});
    if (!t.refresh_token) return {ok: false, message: 'O Mercado Livre nao devolveu a permissao permanente. Tente conectar de novo.'};
    let nickname = '';
    try { const me = await this.mlGet('/users/me', t.access_token); nickname = String(me.nickname || ''); } catch { /* sem apelido */ }
    this.saveLink('mercadolivre', {refresh: this.seal(t.refresh_token), user_id: t.user_id || null, nickname, connected_at: now(), last_error: ''});
    this.access = {token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 21600) * 1000 - 60000};
    return {ok: true, message: 'Mercado Livre conectado' + (nickname ? ' (' + nickname + ')' : '') + '. Pode voltar para a Sofia.'};
  }
  async callbackResponse(params) {
    const fromApp = String(params.get('state') || '').startsWith('a.');
    let r; try { r = await this.callback(params); } catch (e) { r = {ok: false, message: 'Nao consegui concluir: ' + String(e.message || e).slice(0, 160)}; }
    if (fromApp) return {redirect: 'sofiaapp://stores?provider=mercadolivre&ok=' + (r.ok ? '1' : '0') + '&message=' + encodeURIComponent(r.message)};
    return {html: this.page(r)};
  }
  page(r) {
    const color = r.ok ? '#2fc58b' : '#ff6b7a';
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sofia OS · Mercado Livre</title><body style="font-family:system-ui;background:#17151e;color:#f5f0ff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px"><div style="max-width:420px;text-align:center"><h1 style="color:${color};font-size:22px">${r.ok ? 'Conectado' : 'Nao conectado'}</h1><p style="line-height:1.5">${String(r.message).replace(/[<>&]/g, ch => ({'<': '&lt;', '>': '&gt;', '&': '&amp;'}[ch]))}</p></div></body></html>`;
  }
  async disconnect(provider) {
    if (provider !== 'mercadolivre') throw new AppError('STORE_NO_LOGIN', 'Esta loja nao usa login da pessoa.', 400);
    this.db.prepare('DELETE FROM store_link WHERE provider=?').run(provider); this.access = null;
    return {ok: true};
  }
  async mlTokenRequest(extra) {
    const body = new URLSearchParams({client_id: this.env.ML_APP_ID, client_secret: this.env.ML_APP_SECRET, ...extra});
    const res = await this.fetch(ML_TOKEN, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json'}, body: body.toString()});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === 'invalid_grant') { const l = this.link('mercadolivre'); if (l) this.saveLink('mercadolivre', {...l, refresh: '', last_error: 'O Mercado Livre revogou o acesso. Conecte de novo.'}); }
      throw new AppError('ML_TOKEN', 'O Mercado Livre recusou a autorizacao (' + (data.error || res.status) + ').', 502);
    }
    return data;
  }
  async mlToken() {
    if (this.access && this.access.exp > Date.now()) return this.access.token;
    const l = this.link('mercadolivre'); if (!l || !l.refresh) throw new AppError('ML_NOT_CONNECTED', 'Mercado Livre nao conectado.', 409);
    const t = await this.mlTokenRequest({grant_type: 'refresh_token', refresh_token: this.open(l.refresh)});
    // O ML troca o refresh_token a cada renovacao: guardar o novo, senao a proxima falha.
    if (t.refresh_token) this.saveLink('mercadolivre', {...l, refresh: this.seal(t.refresh_token), last_error: ''});
    this.access = {token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 21600) * 1000 - 60000};
    return this.access.token;
  }
  async mlGet(path, token) {
    const res = await this.fetch(ML_API + path, {headers: {Authorization: 'Bearer ' + (token || await this.mlToken()), accept: 'application/json'}});
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { this.access = null; throw new AppError('ML_TOKEN', 'O Mercado Livre recusou o acesso; tente de novo.', 502); }
    if (res.status === 404) throw new AppError('ML_NOT_FOUND', 'Anuncio nao encontrado no Mercado Livre.', 404);
    if (res.status === 429) throw new AppError('RATE_LIMITED', 'O Mercado Livre limitou as consultas; aguardando.', 429);
    if (!res.ok) {
      // 0.3.234: mostra o motivo que o Mercado Livre manda junto (codigo + mensagem), sem token nem dados pessoais
      const why = [data.code || data.error, data.message].filter(Boolean).map(x => String(x).replace(/[^\w .,:;()\-/'"À-ú]/g, '').slice(0, 140)).join(' — ');
      // 0.3.235: 403 = o Mercado Livre fecha /items de anuncios de OUTROS vendedores (mesmo com token); o catalogo segue aberto
      throw new AppError(res.status === 403 ? 'ML_FORBIDDEN' : 'ML_API', 'O Mercado Livre respondeu com erro (' + res.status + ')' + (why ? ': ' + why : '') + '.', 502);
    }
    return data;
  }

  // ---------- Mercado Livre: leitura pela API ----------
  mlConnected() { const l = this.link('mercadolivre'); return !!(l && l.refresh); }
  async readMercadoLivre(itemId, {catalogId = null} = {}) {
    const id = String(itemId || '').toUpperCase().replace(/^MLB-/, 'MLB');
    if (!ITEM.test(id)) throw new AppError('INVALID_ITEM_ID', 'Identificador de anuncio invalido.', 400);
    try { return await this.readItemDirect(id); }
    catch (e) {
      if (!(e && e.code === 'ML_FORBIDDEN')) throw e;
      const cat = String(catalogId || '').toUpperCase();
      if (!ITEM.test(cat)) throw e; // sem catalogo: quem chama cai no caminho da pagina
      return this.readViaCatalog(id, cat);
    }
  }
  /** 0.3.235: preco do MESMO anuncio pela lista do catalogo (/products/{cat}/items), que o ML deixa ler. */
  async readViaCatalog(id, cat) {
    const list = await this.mlGet('/products/' + cat + '/items');
    const rows = Array.isArray(list && list.results) ? list.results : [];
    const r = rows.find(x => String(x && (x.item_id || x.id) || '').toUpperCase() === id);
    if (!r) throw new AppError('ITEM_NOT_IN_CATALOG', 'Esse anuncio nao aparece mais no catalogo do Mercado Livre (pausado, sem estoque ou saiu do catalogo); preco anterior preservado.', 409);
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) throw new AppError('PRICE_MISSING', 'O anuncio esta sem preco no catalogo.', 502);
    if (r.currency_id && r.currency_id !== 'BRL') throw new AppError('CURRENCY_MISMATCH', 'Preco em moeda diferente de BRL.', 502);
    const sellerId = String(r.seller_id || '');
    if (!/^\d{1,18}$/.test(sellerId)) throw new AppError('SELLER_MISSING', 'O catalogo nao informou o vendedor.', 502);
    let title = '';
    try { const pr = await this.mlGet('/products/' + cat); title = String(pr && pr.name || '').trim(); } catch { title = ''; }
    let sellerName = this.sellerNames.get(sellerId);
    if (!sellerName) { try { const u = await this.mlGet('/users/' + sellerId + '?attributes=id,nickname'); sellerName = String(u.nickname || ''); if (sellerName) this.sellerNames.set(sellerId, sellerName); } catch { sellerName = ''; } }
    return {
      provider: 'mercadolivre', siteId: 'MLB', itemId: id, catalogProductId: cat, identityKey: 'mercadolivre:' + id,
      itemSelectedBy: 'link', normalizedUrl: 'https://www.mercadolivre.com.br/p/' + cat + '?pdp_filters=item_id%3A' + id, cleanPermalink: null,
      title: title || id, seller: {id: sellerId, name: sellerName || 'Vendedor ' + sellerId},
      amount: Math.round(price * 100) / 100, amountCents: Math.round(price * 100), currency: 'BRL', inStock: true,
      layout: 'api', source: 'api.mercadolibre.com/products', identitySource: 'api', observedAt: now(), shippingAmount: null,
      extras: {condition: r.condition || null, soldQuantityMin: null, availableQuantity: Number.isFinite(Number(r.available_quantity)) ? Number(r.available_quantity) : null},
    };
  }
  async readItemDirect(id) {
    const it = await this.mlGet('/items/' + id + '?attributes=id,title,price,currency_id,available_quantity,status,seller_id,catalog_product_id,permalink,sold_quantity,condition');
    if (String(it.id || '').toUpperCase() !== id) throw new AppError('ITEM_MISMATCH', 'A API devolveu outro anuncio.', 502);
    const price = Number(it.price);
    if (!Number.isFinite(price) || price <= 0) throw new AppError('PRICE_MISSING', 'O anuncio esta sem preco na API.', 502);
    if (it.currency_id !== 'BRL') throw new AppError('CURRENCY_MISMATCH', 'Preco em moeda diferente de BRL.', 502);
    const sellerId = String(it.seller_id || '');
    if (!/^\d{1,18}$/.test(sellerId)) throw new AppError('SELLER_MISSING', 'A API nao informou o vendedor.', 502);
    const inStock = it.status === 'active' && Number(it.available_quantity) > 0;
    if (!inStock) throw new AppError('UNAVAILABLE', 'Anuncio pausado ou sem estoque; preco anterior preservado.', 409);
    let sellerName = this.sellerNames.get(sellerId);
    if (!sellerName) { try { const u = await this.mlGet('/users/' + sellerId + '?attributes=id,nickname'); sellerName = String(u.nickname || ''); if (sellerName) this.sellerNames.set(sellerId, sellerName); } catch { sellerName = ''; } }
    return {
      provider: 'mercadolivre', siteId: 'MLB', itemId: id, catalogProductId: it.catalog_product_id || null, identityKey: 'mercadolivre:' + id,
      itemSelectedBy: 'link', normalizedUrl: it.catalog_product_id ? 'https://www.mercadolivre.com.br/p/' + it.catalog_product_id + '?pdp_filters=item_id%3A' + id : String(it.permalink || ''),
      cleanPermalink: String(it.permalink || '') || null,
      title: String(it.title || '').trim() || id, seller: {id: sellerId, name: sellerName || 'Vendedor ' + sellerId},
      amount: Math.round(price * 100) / 100, amountCents: Math.round(price * 100), currency: 'BRL', inStock: true,
      layout: 'api', source: 'api.mercadolibre.com', identitySource: 'api', observedAt: now(), shippingAmount: null,
      extras: {condition: it.condition || null, soldQuantityMin: Number.isFinite(Number(it.sold_quantity)) ? Number(it.sold_quantity) : null, availableQuantity: Number(it.available_quantity)},
    };
  }

  // ---------- AliExpress: API por chave do aplicativo ----------
  aliSign(params) {
    const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
    return crypto.createHmac('sha256', this.env.ALIEXPRESS_APP_SECRET).update(sorted).digest('hex').toUpperCase();
  }
  async readAliExpress(productId) {
    const id = String(productId || '').replace(/\D/g, '');
    if (!/^\d{6,20}$/.test(id)) throw new AppError('INVALID_ITEM_ID', 'Identificador de produto invalido.', 400);
    if (!this.aliConfigured()) throw new AppError('ALI_NOT_CONFIGURED', 'A chave do AliExpress ainda nao foi configurada no servidor.', 503);
    const params = {app_key: this.env.ALIEXPRESS_APP_KEY, method: 'aliexpress.affiliate.productdetail.get', sign_method: 'sha256', timestamp: String(Date.now()), v: '2.0', format: 'json',
      product_ids: id, target_currency: 'BRL', target_language: 'PT', country: 'BR', ...(this.env.ALIEXPRESS_TRACKING_ID ? {tracking_id: this.env.ALIEXPRESS_TRACKING_ID} : {})};
    params.sign = this.aliSign(params);
    const res = await this.fetch(ALI_GATEWAY + '?' + new URLSearchParams(params).toString(), {headers: {accept: 'application/json'}});
    const data = await res.json().catch(() => ({}));
    if (data.error_response) throw new AppError('ALI_API', 'O AliExpress recusou a consulta (' + (data.error_response.msg || data.error_response.code) + ').', 502);
    const body = data.aliexpress_affiliate_productdetail_get_response?.resp_result?.result;
    const p = body?.products?.product?.[0];
    if (!p) throw new AppError('ALI_NOT_FOUND', 'Produto nao encontrado na API do AliExpress.', 404);
    const price = Number(p.target_sale_price ?? p.sale_price);
    if (!Number.isFinite(price) || price <= 0) throw new AppError('PRICE_MISSING', 'O produto esta sem preco na API.', 502);
    const currency = String(p.target_sale_price_currency || p.sale_price_currency || 'BRL');
    return {
      provider: 'aliexpress', itemId: id, identityKey: 'aliexpress:' + id, itemSelectedBy: 'link',
      normalizedUrl: 'https://pt.aliexpress.com/item/' + id + '.html', cleanPermalink: String(p.product_detail_url || '') || null,
      title: String(p.product_title || '').trim() || id, seller: {id: String(p.shop_id || '0'), name: String(p.shop_name || 'AliExpress')},
      amount: Math.round(price * 100) / 100, amountCents: Math.round(price * 100), currency, inStock: true,
      layout: 'api', source: 'api-sg.aliexpress.com', identitySource: 'api', observedAt: now(), shippingAmount: null,
      extras: {originalPriceCents: Number.isFinite(Number(p.target_original_price)) ? Math.round(Number(p.target_original_price) * 100) : null, image: p.product_main_image_url || null},
    };
  }
}
module.exports = {StoreConnections, ML_CALLBACK};
