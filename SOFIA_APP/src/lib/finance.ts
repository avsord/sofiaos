// Núcleo do app Finanças (inspirado no Mobills), sem React e testável.
// Regra: saldo real só conta o que está marcado como pago/recebido;
// o que está previsto aparece separado como "previsto", nunca misturado.
import type {Entity} from './types';

export type TxKind = 'expense' | 'income' | 'transfer' | 'card_payment';
export type Recurrence = 'none' | 'monthly' | 'weekly' | 'yearly';
export type Account = {id: string; name: string; type: string; initial: number; color: string; include: boolean; archived: boolean; entity: Entity};
export type Card = {id: string; name: string; limit: number; closing: number; due: number; color: string; accountId: string; archived: boolean; entity: Entity};
export type Tx = {
  id: string; kind: TxKind; desc: string; amount: number; date: string; category: string; accountId: string; toAccountId: string; cardId: string;
  invoice: string; paid: boolean; seriesId: string; installment: number; installments: number; recurrence: Recurrence; recurrenceEnd: string;
  virtual?: boolean; entity?: Entity;
};
export type Budget = {id: string; category: string; limit: number; entity: Entity};
export type Goal = {id: string; name: string; target: number; saved: number; deadline: string; color: string; done: boolean; entity: Entity};

export type Category = {name: string; icon: string; color: string};
export const EXPENSE_CATEGORIES: Category[] = [
  {name: 'Alimentação', icon: '🍽️', color: '#ff8a5b'}, {name: 'Mercado', icon: '🛒', color: '#2fc58b'}, {name: 'Transporte', icon: '🚗', color: '#4fa3ff'},
  {name: 'Moradia', icon: '🏠', color: '#a98bff'}, {name: 'Contas', icon: '💡', color: '#ffb547'}, {name: 'Saúde', icon: '💊', color: '#ff6b7a'},
  {name: 'Educação', icon: '📚', color: '#3fd0d4'}, {name: 'Lazer', icon: '🎬', color: '#ef7bd0'}, {name: 'Compras', icon: '🛍️', color: '#c6d84a'},
  {name: 'Assinaturas', icon: '📺', color: '#8f7cf7'}, {name: 'Viagem', icon: '✈️', color: '#38b6ff'}, {name: 'Pets', icon: '🐾', color: '#d99a5b'},
  {name: 'Presentes', icon: '🎁', color: '#ff7eb6'}, {name: 'Impostos', icon: '🧾', color: '#9a9aa8'}, {name: 'Trabalho', icon: '💼', color: '#6c8ebf'},
  {name: 'Outros', icon: '📦', color: '#8a84a0'},
];
export const INCOME_CATEGORIES: Category[] = [
  {name: 'Salário', icon: '💼', color: '#2fc58b'}, {name: 'Freelance', icon: '💻', color: '#4fa3ff'}, {name: 'Investimentos', icon: '📈', color: '#a98bff'},
  {name: 'Vendas', icon: '🏷️', color: '#ffb547'}, {name: 'Reembolso', icon: '↩️', color: '#3fd0d4'}, {name: 'Presente', icon: '🎁', color: '#ff7eb6'},
  {name: 'Outros', icon: '💰', color: '#8a84a0'},
];
export const INVOICE_CATEGORY: Category = {name: 'Fatura do cartão', icon: '💳', color: '#7258e8'};
export const TRANSFER_CATEGORY: Category = {name: 'Transferência', icon: '🔁', color: '#8a84a0'};
export const ACCOUNT_TYPES = [{value: 'corrente', label: 'Conta corrente'}, {value: 'poupanca', label: 'Poupança'}, {value: 'carteira', label: 'Carteira'}, {value: 'investimento', label: 'Investimento'}, {value: 'outro', label: 'Outro'}];
export const FIN_COLORS = ['#7258e8', '#2fc58b', '#4fa3ff', '#ff8a5b', '#ff6b7a', '#ffb547', '#ef7bd0', '#3fd0d4'];

export function categoryOf(name: string, kind: TxKind = 'expense'): Category {
  if (kind === 'card_payment') return INVOICE_CATEGORY;
  if (kind === 'transfer') return TRANSFER_CATEGORY;
  const list = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find(c => c.name === name) || {name: name || 'Outros', icon: kind === 'income' ? '💰' : '📦', color: '#8a84a0'};
}

const num = (v: any) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------- Datas ----------
export function monthOf(date: string): string { return date.slice(0, 7); }
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export function daysIn(month: string): number { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function dayIn(month: string, day: number): string { return month + '-' + String(Math.min(day, daysIn(month))).padStart(2, '0'); }
export function todayISO(now = new Date()): string { return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'); }
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', {month: 'long', timeZone: 'UTC'});
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
}
export function addDays(date: string, n: number): string { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ---------- Leitura das entidades ----------
export function toAccount(e: Entity): Account {
  return {id: e.id, name: e.title, type: String(e.data?.account_type || 'corrente'), initial: num(e.data?.initial_balance), color: String(e.data?.color || FIN_COLORS[0]),
    include: e.data?.include_total !== false, archived: e.state === 'archived', entity: e};
}
export function toCard(e: Entity): Card {
  return {id: e.id, name: e.title, limit: num(e.data?.limit), closing: num(e.data?.closing_day) || 1, due: num(e.data?.due_day) || 10, color: String(e.data?.color || FIN_COLORS[2]),
    accountId: String(e.data?.account_id || ''), archived: e.state === 'archived', entity: e};
}
export function toTx(e: Entity): Tx {
  const d = e.data || {};
  return {id: e.id, kind: (d.kind || 'expense') as TxKind, desc: e.title, amount: num(d.amount), date: String(d.date || ''), category: String(d.category || ''),
    accountId: String(d.account_id || ''), toAccountId: String(d.to_account_id || ''), cardId: String(d.card_id || ''), invoice: String(d.invoice_month || ''),
    paid: !!d.paid, seriesId: String(d.series_id || ''), installment: num(d.installment), installments: num(d.installments), recurrence: (d.recurrence || 'none') as Recurrence,
    recurrenceEnd: String(d.recurrence_end || ''), entity: e};
}
export function toBudget(e: Entity): Budget { return {id: e.id, category: String(e.data?.category || e.title), limit: num(e.data?.limit), entity: e}; }
export function toGoal(e: Entity): Goal {
  return {id: e.id, name: e.title, target: num(e.data?.target), saved: num(e.data?.saved), deadline: String(e.data?.deadline || ''), color: String(e.data?.color || FIN_COLORS[1]), done: e.state === 'completed', entity: e};
}

// ---------- Cartão de crédito ----------
/** Compra depois do dia de fechamento cai na fatura do mês seguinte. */
export function invoiceMonth(card: Pick<Card, 'closing'>, date: string): string {
  const day = Number(date.slice(8, 10)), month = monthOf(date);
  return day > card.closing ? addMonths(month, 1) : month;
}
/** Vencimento da fatura: se o dia de vencimento é antes do fechamento, vence no mês seguinte. */
export function invoiceDue(card: Pick<Card, 'closing' | 'due'>, month: string): string {
  return card.due <= card.closing ? dayIn(addMonths(month, 1), card.due) : dayIn(month, card.due);
}
export function invoiceClose(card: Pick<Card, 'closing'>, month: string): string { return dayIn(month, card.closing); }
export type Invoice = {card: Card; month: string; total: number; paid: number; due: string; close: string; items: Tx[]; status: 'aberta' | 'fechada' | 'paga' | 'vencida' | 'futura'};
export function cardInvoices(card: Card, txs: Tx[], today = todayISO()): Invoice[] {
  const months = new Map<string, Tx[]>();
  for (const t of txs) if (t.kind === 'expense' && t.cardId === card.id) {
    const m = t.invoice || invoiceMonth(card, t.date);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(t);
  }
  const current = invoiceMonth(card, today);
  if (!months.has(current)) months.set(current, []);
  return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, items]) => {
    const total = round2(items.reduce((s, t) => s + t.amount, 0));
    const paid = round2(txs.filter(t => t.kind === 'card_payment' && t.cardId === card.id && t.invoice === month && t.paid).reduce((s, t) => s + t.amount, 0));
    const due = invoiceDue(card, month), close = invoiceClose(card, month);
    const status: Invoice['status'] = total > 0 && paid >= total ? 'paga' : month > current ? 'futura' : month === current ? 'aberta' : today > due && paid < total ? 'vencida' : 'fechada';
    return {card, month, total, paid, due, close, items: items.sort((a, b) => b.date.localeCompare(a.date)), status};
  });
}
export function cardUsed(card: Card, txs: Tx[]): number {
  return round2(cardInvoices(card, txs).reduce((s, i) => s + Math.max(0, i.total - i.paid), 0));
}

// ---------- Parcelas e recorrência ----------
export function installmentPlan(amount: number, n: number, firstDate: string): Array<{amount: number; date: string; installment: number}> {
  const cents = Math.round(amount * 100), base = Math.floor(cents / n), rest = cents - base * n;
  const day = Number(firstDate.slice(8, 10)), month = monthOf(firstDate);
  return Array.from({length: n}, (_, i) => ({amount: (base + (i === 0 ? rest : 0)) / 100, date: dayIn(addMonths(month, i), day), installment: i + 1}));
}
/** Lançamentos repetidos aparecem nos meses seguintes como "previstos" até a
 * pessoa confirmar; confirmar cria o lançamento real daquele mês. */
export function expandRecurring(txs: Tx[], month: string): Tx[] {
  const out: Tx[] = [];
  for (const t of txs) {
    if (t.recurrence === 'none' || !t.date || monthOf(t.date) >= month) continue;
    if (t.recurrenceEnd && month > t.recurrenceEnd) continue;
    const series = t.seriesId || t.id;
    const day = Number(t.date.slice(8, 10));
    const dates: string[] = [];
    if (t.recurrence === 'monthly') dates.push(dayIn(month, day));
    else if (t.recurrence === 'yearly') { if (t.date.slice(5, 7) === month.slice(5, 7)) dates.push(dayIn(month, day)); }
    else if (t.recurrence === 'weekly') { for (let d = t.date; monthOf(d) <= month; d = addDays(d, 7)) if (monthOf(d) === month) dates.push(d); }
    for (const date of dates) {
      const exists = txs.some(x => (x.seriesId === series || x.id === series) && x.id !== t.id && x.date === date);
      const newer = txs.some(x => (x.seriesId === series) && x.id !== t.id && x.recurrence !== 'none' && x.date > t.date && x.date <= date);
      if (!exists && !newer) out.push({...t, id: 'virtual:' + series + ':' + date, date, paid: false, virtual: true, seriesId: series, invoice: ''});
    }
  }
  return out;
}

// ---------- Saldos ----------
export function effect(t: Tx, accountId: string): number {
  if (!t.paid || t.virtual) return 0;
  if (t.kind === 'income' && t.accountId === accountId) return t.amount;
  if (t.kind === 'expense' && !t.cardId && t.accountId === accountId) return -t.amount;
  if (t.kind === 'card_payment' && t.accountId === accountId) return -t.amount;
  if (t.kind === 'transfer') return (t.toAccountId === accountId ? t.amount : 0) - (t.accountId === accountId ? t.amount : 0);
  return 0;
}
export function accountBalance(a: Account, txs: Tx[], upTo?: string): number {
  return round2(a.initial + txs.filter(t => !upTo || t.date <= upTo).reduce((s, t) => s + effect(t, a.id), 0));
}
export function totalBalance(accounts: Account[], txs: Tx[], upTo?: string): number {
  return round2(accounts.filter(a => a.include && !a.archived).reduce((s, a) => s + accountBalance(a, txs, upTo), 0));
}
/** Saldo previsto no fim do mês: real + o que ainda falta pagar/receber no mês. */
export function forecastBalance(accounts: Account[], txs: Tx[], month: string, cards: Card[], today = todayISO()): number {
  const end = dayIn(month, 31), included = new Set(accounts.filter(a => a.include && !a.archived).map(a => a.id));
  let v = totalBalance(accounts, txs, end);
  for (const t of monthTxs(txs, month)) {
    if (t.paid && !t.virtual) continue;
    if (t.kind === 'income' && included.has(t.accountId)) v += t.amount;
    if (t.kind === 'expense' && !t.cardId && included.has(t.accountId)) v -= t.amount;
  }
  for (const c of cards) for (const i of cardInvoices(c, txs, today)) if (i.due.slice(0, 7) === month && i.status !== 'paga') v -= Math.max(0, i.total - i.paid);
  return round2(v);
}

// ---------- Mês ----------
export function monthTxs(txs: Tx[], month: string): Tx[] {
  return [...txs.filter(t => monthOf(t.date) === month), ...expandRecurring(txs, month)].sort((a, b) => b.date.localeCompare(a.date) || a.desc.localeCompare(b.desc));
}
export type MonthSummary = {income: number; incomePending: number; expense: number; expensePending: number; cardSpend: number; result: number};
/** Despesas do mês contam compras no cartão na data da compra (como no
 * Mobills); pagamento de fatura e transferência não entram, para não contar
 * o mesmo gasto duas vezes. */
export function monthSummary(txs: Tx[], month: string): MonthSummary {
  const list = monthTxs(txs, month);
  let income = 0, incomePending = 0, expense = 0, expensePending = 0, cardSpend = 0;
  for (const t of list) {
    if (t.kind === 'income') { if (t.paid && !t.virtual) income += t.amount; else incomePending += t.amount; }
    if (t.kind === 'expense') {
      if (t.cardId) { cardSpend += t.amount; expense += t.amount; }
      else if (t.paid && !t.virtual) expense += t.amount; else expensePending += t.amount;
    }
  }
  return {income: round2(income), incomePending: round2(incomePending), expense: round2(expense), expensePending: round2(expensePending), cardSpend: round2(cardSpend), result: round2(income - expense)};
}
export type CategorySlice = {category: Category; total: number; pct: number; count: number};
export function byCategory(txs: Tx[], month: string, kind: 'expense' | 'income' = 'expense', includePending = true): CategorySlice[] {
  const map = new Map<string, {total: number; count: number}>();
  for (const t of monthTxs(txs, month)) {
    if (t.kind !== kind) continue;
    if (!includePending && !t.cardId && (!t.paid || t.virtual)) continue;
    const k = t.category || 'Outros', cur = map.get(k) || {total: 0, count: 0};
    cur.total += t.amount; cur.count++; map.set(k, cur);
  }
  const sum = [...map.values()].reduce((s, v) => s + v.total, 0);
  return [...map.entries()].map(([name, v]) => ({category: categoryOf(name, kind), total: round2(v.total), pct: sum ? v.total / sum : 0, count: v.count})).sort((a, b) => b.total - a.total);
}
export type BudgetProgress = {budget: Budget; spent: number; pct: number; left: number; state: 'ok' | 'alerta' | 'estourado'};
export function budgetProgress(budgets: Budget[], txs: Tx[], month: string): BudgetProgress[] {
  const spent = new Map(byCategory(txs, month, 'expense').map(s => [s.category.name, s.total]));
  return budgets.map(b => {
    const s = spent.get(b.category) || 0, pct = b.limit ? s / b.limit : 0;
    return {budget: b, spent: s, pct, left: round2(b.limit - s), state: pct >= 1 ? 'estourado' : pct >= 0.8 ? 'alerta' : 'ok'} as BudgetProgress;
  }).sort((a, b) => b.pct - a.pct);
}
export function trend(txs: Tx[], month: string, count = 6): Array<{month: string; income: number; expense: number}> {
  return Array.from({length: count}, (_, i) => addMonths(month, i - count + 1)).map(m => { const s = monthSummary(txs, m); return {month: m, income: s.income + s.incomePending, expense: s.expense + s.expensePending}; });
}
export function balanceSeries(accounts: Account[], txs: Tx[], month: string): Array<{t: number; v: number}> {
  const out: Array<{t: number; v: number}> = [], days = daysIn(month), today = todayISO();
  for (let d = 1; d <= days; d++) {
    const date = dayIn(month, d);
    if (date > today) break;
    out.push({t: Date.parse(date + 'T12:00:00Z'), v: totalBalance(accounts, txs, date)});
  }
  return out;
}

// ---------- Contas a pagar / receber ----------
export type Due = {id: string; title: string; amount: number; date: string; kind: 'pagar' | 'receber' | 'fatura'; late: boolean; tx?: Tx; invoice?: Invoice};
export function upcoming(txs: Tx[], cards: Card[], today = todayISO(), days = 7): Due[] {
  const until = addDays(today, days), months = [monthOf(today), monthOf(until)].filter((m, i, a) => a.indexOf(m) === i);
  const list: Due[] = [];
  const pending = [...txs, ...months.flatMap(m => expandRecurring(txs, m))].filter(t => !t.paid && !t.cardId && (t.kind === 'expense' || t.kind === 'income') && t.date <= until);
  const seen = new Set<string>();
  for (const t of pending) {
    if (seen.has(t.id)) continue; seen.add(t.id);
    if (t.virtual && t.date < monthOf(today) + '-01') continue;
    list.push({id: t.id, title: t.desc, amount: t.amount, date: t.date, kind: t.kind === 'income' ? 'receber' : 'pagar', late: t.date < today, tx: t});
  }
  for (const c of cards) if (!c.archived) for (const i of cardInvoices(c, txs, today)) {
    if (i.total <= i.paid || i.status === 'futura' || i.status === 'aberta' && i.due > until) continue;
    if (i.due <= until) list.push({id: 'fatura:' + c.id + ':' + i.month, title: 'Fatura ' + c.name, amount: round2(i.total - i.paid), date: i.due, kind: 'fatura', late: i.due < today, invoice: i});
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Objetivos ----------
export function goalProgress(g: Goal, today = todayISO()): {pct: number; left: number; perMonth: number | null} {
  const left = Math.max(0, round2(g.target - g.saved)), pct = g.target ? Math.min(1, g.saved / g.target) : 0;
  if (!g.deadline || left <= 0) return {pct, left, perMonth: null};
  const months = Math.max(1, (Number(g.deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(g.deadline.slice(5, 7)) - Number(today.slice(5, 7)));
  return {pct, left, perMonth: round2(left / months)};
}

// ---------- Entrada de valor ----------
/** "1.234,56", "1234.56", "R$ 89,90" → número. Nada válido → null. */
export function parseMoney(text: string): number | null {
  let t = String(text || '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc > -1) t = t.replace(/\./g, '').replace(',', '.');
  else if (ld > -1 && t.length - ld - 1 === 3 && (t.match(/\./g) || []).length >= 1) t = t.replace(/\./g, '');
  const v = Number(t);
  return Number.isFinite(v) ? round2(v) : null;
}

// ---------- Ligações com outros apps ----------
/** Lê valor e vencimento de um texto de cobrança (assunto + trecho do e-mail).
 * Só sugere: a pessoa confere antes de salvar. */
export function parseBill(text: string, today = todayISO()): {amount: number | null; due: string | null} {
  const t = String(text || '');
  const money = [...t.matchAll(/R\$\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/gi)].map(m => parseMoney(m[1])).filter((v): v is number => v !== null && v > 0);
  const near = /(vencimento|vence|vencendo|pagar até|pague até|data de pagamento)[^\d]{0,25}(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/i.exec(t)
    || /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(t);
  let due: string | null = null;
  if (near) {
    const g = near.length === 5 ? [near[2], near[3], near[4]] : [near[1], near[2], near[3]];
    const d = Number(g[0]), m = Number(g[1]); let y = g[2] ? Number(g[2].length === 2 ? '20' + g[2] : g[2]) : Number(today.slice(0, 4));
    if (!g[2] && (m < Number(today.slice(5, 7)) - 1)) y++;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) due = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  return {amount: money.length ? Math.max(...money) : null, due};
}
