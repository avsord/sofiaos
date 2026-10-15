'use strict';
// Encomendas (0.3.142): rastreio inspirado no Muambator. A pessoa cadastra o código e
// dá um nome; o servidor consulta a transportadora de tempos em tempos, guarda a linha
// do tempo e avisa pelo sino/celular quando o status muda. Correios usam o mesmo
// endpoint do app oficial (proxyapp); se a consulta falhar, o registro guarda o motivo
// e o app oferece abrir o rastreio oficial — nunca inventa status.
const CORREIOS = /^[A-Z]{2}\d{9}[A-Z]{2}$/i;
const CARRIERS = [
  { id: 'correios', label: 'Correios', test: c => CORREIOS.test(c) },
  { id: 'jadlog', label: 'Jadlog', test: c => /^\d{14}$/.test(c) },
  { id: 'cainiao', label: 'Cainiao / AliExpress', test: c => /^(LP|CNBR|SYRM|YT|CNB)\w{8,}$/i.test(c) },
  { id: 'shopee', label: 'Shopee (SPX)', test: c => /^BR\d{12,}[A-Z]?$/i.test(c) },
];
function normalizeCode(code) { return String(code || '').replace(/[\s.-]/g, '').toUpperCase(); }
function detectCarrier(code) { const c = normalizeCode(code); return (CARRIERS.find(x => x.test(c)) || { id: 'outro', label: 'Outra transportadora' }).id; }
function carrierLabel(id) { return (CARRIERS.find(x => x.id === id) || { label: 'Outra transportadora' }).label; }
function officialUrl(carrier, code) {
  const c = encodeURIComponent(normalizeCode(code));
  if (carrier === 'correios') return 'https://rastreamento.correios.com.br/app/index.php?objetos=' + c;
  if (carrier === 'jadlog') return 'https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=' + c;
  if (carrier === 'cainiao') return 'https://global.cainiao.com/newDetail.htm?mailNoList=' + c;
  if (carrier === 'shopee') return 'https://spx.com.br/track?' + c;
  return 'https://www.google.com/search?q=' + c;
}
const DELIVERED = /entregue ao destinat|objeto entregue|entrega efetuada|delivered/i;
/** Lê a resposta do proxyapp dos Correios para uma linha do tempo simples. */
function parseCorreios(payload, code) {
  const obj = (payload && Array.isArray(payload.objetos) ? payload.objetos : []).find(o => normalizeCode(o.codObjeto) === normalizeCode(code)) || (payload && payload.objetos || [])[0];
  if (!obj) throw new Error('Resposta dos Correios sem o objeto.');
  if (obj.mensagem && !(obj.eventos || []).length) return { status: String(obj.mensagem).slice(0, 160), events: [], found: false };
  const events = (obj.eventos || []).map(e => ({
    at: String(e.dtHrCriado || e.dataHora || '').slice(0, 25),
    status: String(e.descricao || e.status || '').trim().slice(0, 160),
    local: [e.unidade && e.unidade.nome, e.unidade && e.unidade.endereco && e.unidade.endereco.cidade, e.unidade && e.unidade.endereco && e.unidade.endereco.uf].filter(Boolean).join(' · ').slice(0, 120),
  })).filter(e => e.status);
  return { status: events[0] ? events[0].status : 'Sem eventos ainda', events, found: true };
}
class PackageTracker {
  constructor(workspace, options = {}) { this.w = workspace; this.fetch = options.fetchImpl || global.fetch; this.timer = null; this.timeoutMs = options.timeoutMs || 15000; }
  async fetchCorreios(code) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch('https://proxyapp.correios.com.br/v1/sro-rastro/' + encodeURIComponent(normalizeCode(code)), {
        headers: { 'User-Agent': 'Dart/2.8 (dart:io)', Accept: 'application/json', 'Accept-Language': 'pt-BR' }, signal: ctrl.signal });
      if (!res.ok) throw new Error('Correios responderam ' + res.status + '.');
      return parseCorreios(await res.json(), code);
    } finally { clearTimeout(t); }
  }
  async lookup(carrier, code) {
    if (carrier === 'correios') return this.fetchCorreios(code);
    return { status: 'Acompanhamento automático só para Correios por enquanto', events: [], found: false, unsupported: true };
  }
  /** Atualiza um registro; devolve {item, changed}. Nunca lança por falha da transportadora. */
  async refresh(item) {
    const d = { ...(item.data || {}) }, code = normalizeCode(d.code), carrier = d.carrier || detectCarrier(code);
    let result, error = '';
    try { result = await this.lookup(carrier, code); } catch (e) { error = String(e && e.message || e).slice(0, 160); }
    const now = new Date().toISOString();
    if (!result) {
      const saved = this.w.save({ ...item, data: { ...d, carrier, checked_at: now, error } }, item.id);
      return { item: saved, changed: false, error };
    }
    const previous = (() => { try { return JSON.parse(d.events || '[]'); } catch { return []; } })();
    const key = e => e.at + '|' + e.status;
    const changed = result.found && result.events.length && (!previous.length || key(result.events[0]) !== key(previous[0]));
    const delivered = result.events.some(e => DELIVERED.test(e.status));
    const saved = this.w.save({ ...item, state: delivered ? 'delivered' : item.state === 'archived' ? 'archived' : 'active',
      data: { ...d, carrier, status: result.status, last_event_at: result.events[0] ? result.events[0].at : d.last_event_at || '', events: JSON.stringify(result.events.slice(0, 60)), checked_at: now, error: result.found ? '' : result.status } }, item.id);
    if (changed) {
      const top = result.events[0];
      this.w.notify('package', (delivered ? '📦 Entregue: ' : '📦 ') + (item.title || code), top.status + (top.local ? ' · ' + top.local : ''), saved.id, delivered ? 'opportunity' : 'info', 'package:' + saved.id + ':' + key(top));
    }
    return { item: saved, changed: !!changed, error: '' };
  }
  async refreshOne(id) {
    const item = this.w.get(id);
    if (!item || item.kind !== 'package') throw Object.assign(new Error('Encomenda não encontrada.'), { status: 404 });
    return this.refresh(item);
  }
  async checkAll() {
    const items = this.w.list({ kind: 'package', limit: 500 }).filter(x => x.state === 'active');
    let changed = 0;
    for (const item of items) { try { if ((await this.refresh(item)).changed) changed++; } catch { /* segue para a próxima */ } }
    return changed;
  }
  start(intervalMs = 2 * 60 * 60000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkAll().catch(() => {}), intervalMs); this.timer.unref?.();
    setTimeout(() => this.checkAll().catch(() => {}), 45000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
module.exports = { PackageTracker, detectCarrier, carrierLabel, officialUrl, normalizeCode, parseCorreios, CARRIERS };
