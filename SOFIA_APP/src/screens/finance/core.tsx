import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {PALETTE} from '../../lib/palette';
import {contextMenu} from '../../components/ContextMenu';
import {useValuesHidden} from '../../lib/values-mask';
import {tap,useColumnPad,useDesktop} from '../../lib/desktop';
import {GoalProgressCard} from '../../components/GoalProgress';
import type {GoalNumbers} from '../../components/GoalProgress';
import {keepIfSame, useCachedGoal, writeGoalWidget} from '../../lib/goal-widget';
import {scheduleIdleTask} from '../../lib/idle-task';
import * as SecureStore from 'expo-secure-store';
import {ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Switch, Text, TextInput, View, Dimensions, PanResponder, Animated, Easing} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../../components/RevealScroll';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect, Line} from 'react-native-svg';
import {useTheme, light} from '../../lib/theme';
import {encryptedStorage} from '../../lib/encrypted-storage';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';
import type {ImportItem} from '../../lib/api';
import type {SofiaApi} from '../../lib/api';
import type {Entity} from '../../lib/types';
import {errorText} from '../../lib/chat-model';
import {useRenderCost} from '../../lib/render-cost';
import {MotionModal} from '../../components/MotionModal';
import {Sheet, markSheetHandoff} from '../../components/Sheet';
import {InternalBackGesture} from '../../components/InternalBackGesture';
import {DateTimeField} from '../../components/DateTimeField';
import {Icon, type IconName} from '../../components/Icon';
import {Button, IconButton} from '../../components/UI';
import {PriceChart} from '../../components/PriceChart';
import {Spinner, LoadingLines, ShimmerBlock, ShimmerGroup} from '../../components/Loading';
import {money} from '../../lib/monitoring';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ACCOUNT_TYPES, FIN_COLORS, categoryOf, toAccount, toCard, toTx, toBudget, toGoal, monthOf, addMonths, monthLabel, todayISO,
  invoiceMonth, cardInvoices, cardUsed, installmentPlan, accountBalance, totalBalance, forecastBalance, monthTxs, monthSummary, byCategory, budgetProgress,
  trend, balanceSeries, upcoming, manualDues, transactionsForAccount, goalProgress, parseMoney, formatMoneyInput, finishMoneyInput, addDays,
  dayIn, daysIn} from '../../lib/finance';
import type {Account, Card, Tx, TxKind, Budget, Goal, Invoice, Due, ReserveMove, SaldoSnap, SaldoChange} from '../../lib/finance';
import {saldoSnapshot, reserveSnapshot, saldoDiff, cardBillSettled, saldoLedger, txInvoiceMonth, invoiceForMonth} from '../../lib/finance';
import type {LedgerItem} from '../../lib/finance';
import {sinceReportStart, cycleRange, cycleRoom, fixedSummary, lastInstallmentMonth, monthDues, moneySplit, reserveOutlook, reserveBadge, reserveHistory, reserveMoveLabel, reserveOf, reserveFor, reserveSeries, toReserveMove, effectiveCycleDay, periodBudget, salaryForecast, currentPlan, nextPlan, simpleForecast, spendControl, categoryAlerts, lastWeekByCategory, duplicateGroups, moneyLeft, monthControl, balanceAsOf, isOneOffIncome, fixedDuplicateGroups, fixedUpcoming, isScheduled, exactTwinExtras} from '../../lib/finance';
import {syncFinanceDueNotifications} from '../../lib/finance-notifications';
import {appAlert} from '../../lib/app-alert';
import {useFormDraft, clearAllFormDrafts} from '../../lib/form-draft';
// 0.3.263: parte de Financas (ver src/screens/Finance.tsx).

export const GOOD = PALETTE.green, BAD = PALETTE.red, WARN = PALETTE.amber, GUARD = PALETTE.green1;
/** 0.3.255: devolucao a receber (reembolso, estorno...). Nao mexe no Saldo nem no previsto; ao tocar em "Recebi" vira uma
 * receita paga de hoje, que entra no Saldo e no Historico. */
export type Refund = {id: string; title: string; amount: number; expected: string; accountId: string; state: string; receivedAt: string; expenseId: string; entity: Entity};
export type Data = {accounts: Account[]; cards: Card[]; txs: Tx[]; budgets: Budget[]; goals: Goal[]; moves: ReserveMove[]; statements: Statement[]; refunds?: Refund[]};
export function toRefund(e: Entity): Refund { return {id: e.id, title: e.title, amount: Number(e.data?.amount || 0), expected: String(e.data?.expected_date || ''), accountId: String(e.data?.account_id || ''), state: e.state, receivedAt: String(e.data?.received_at || ''), expenseId: String(e.data?.expense_id || ''), entity: e}; }
// 0.3.213: extrato do banco guardado a parte - serve para conferir (conciliacao) e acertar o saldo; nao e lancamento
export type StatementLine = {import_id: string; date: string; desc: string; original?: string; amount: number; kind: string};
export type Statement = {id: string; accountId: string; from: string; to: string; closing: number | null; lines: StatementLine[]; entity: Entity};
export function toStatement(e: Entity): Statement { let lines: StatementLine[] = []; try { const a = JSON.parse(String(e.data?.lines_json || '[]')); if (Array.isArray(a)) lines = a; } catch { lines = []; }
  const cb = e.data?.closing_balance; return {id: e.id, accountId: String(e.data?.account_id || ''), from: String(e.data?.from || ''), to: String(e.data?.to || ''), closing: cb === '' || cb === null || cb === undefined ? null : Number(cb), lines, entity: e}; }
export type Tab = 'home' | 'txs' | 'bills' | 'cards' | 'plan' | 'reports' | 'refunds';
export const KINDS = ['fin_account', 'fin_card', 'fin_tx', 'fin_budget', 'fin_goal', 'fin_reserve_move', 'fin_statement', 'fin_refund'] as const;
export const dateBR = (d: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
export const weekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC'});
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type Bundle = {items: Record<string, Entity[]>; carry?: Record<string, number>; window?: {from: string; to: string} | null};
/** Mês a mês: o servidor manda só os lançamentos da janela e o "saldo acumulado" de cada
 * conta até o início dela. Somado ao saldo inicial, todos os cálculos (saldo, previsto,
 * gráfico dia a dia) continuam exatos sem baixar o histórico inteiro. */
export function toData(all: Record<string, Entity[]>, carry: Record<string, number> = {}): Data {
  const g = (k: string) => all[k] || [];
  return {accounts: g('fin_account').map(toAccount).map(a => ({...a, carry: carry[a.id] || 0, initial: a.initial + (carry[a.id] || 0)})), cards: g('fin_card').map(toCard), txs: g('fin_tx').filter(e => e.state !== 'archived').map(toTx),
    budgets: g('fin_budget').filter(e => e.state !== 'archived').map(toBudget), goals: g('fin_goal').filter(e => e.state !== 'archived').map(toGoal), moves: g('fin_reserve_move').filter(e => e.state !== 'archived').map(toReserveMove), statements: g('fin_statement').filter(e => e.state !== 'archived').map(toStatement).sort((a, b) => b.to.localeCompare(a.to)), refunds: g('fin_refund').filter(e => e.state !== 'archived').map(toRefund)};
}
/** Janela de meses que cada aba precisa: Resumo/Lançamentos/Cartões/Planejamento = mês anterior
 * ao próximo (previsto, fatura, "a pagar"); Relatórios = 6 meses (tendência). */
export function financeWindow(month: string, tab: string): {from: string; to: string} {
  return tab === 'reports' ? {from: addMonths(month, -5), to: addMonths(month, 1)} : {from: addMonths(month, -1), to: addMonths(month, 1)};
}
/** Um pedido só ao servidor (com janela); servidor antigo (sem janela) devolve tudo, e o mais antigo ainda cai nos pedidos por tipo. */
export async function loadAll(api: SofiaApi, window: {from: string; to: string}): Promise<Bundle> {
  try { const r = await api.financeBundle(window); return {items: r.items, carry: r.carry || {}, window: r.window || null}; }
  catch (e) { if ((e as any)?.status !== 404) throw e; }
  const all: Record<string, Entity[]> = {};
  await Promise.all(KINDS.map(async kind => {
    const list: Entity[] = [];
    for (let offset = 0; ; offset += 100) { const r = await api.entities(kind, '', offset); list.push(...r.items); if (r.items.length < 100) break; }
    all[kind] = list;
  }));
  return {items: all, carry: {}, window: null};
}
// Última versão guardada no aparelho, CRIPTOGRAFADA (Keystore do Android):
// o Finanças abre na hora com ela e se atualiza por trás.
export const cacheScope = (api: SofiaApi) => 'sofia-finance-v1|' + api.owner.trim().toLowerCase();
export async function readCache(api: SofiaApi): Promise<Bundle | null> {
  try { const raw = await encryptedStorage.read(cacheScope(api)); const v = raw ? JSON.parse(raw) : null; return v && typeof v === 'object' && v.items ? v : null; } catch { return null; }
}
// 0.3.221: a cada atualizacao do mes atual, o app guarda (criptografado, no aparelho) um retrato do que forma o Saldo
// de cada conta e da reserva. Se o Saldo mudar entre uma vez e outra, fica registrado o que mudou - inclusive o que
// saiu do app sem a pessoa ver. O Extrato do saldo mostra essa lista.
export type SaldoStore = {snaps: Record<string, SaldoSnap>; log: Record<string, SaldoChange[]>};
export const saldoScope = (api: SofiaApi) => 'sofia-finance-saldo-v1|' + api.owner.trim().toLowerCase();
export async function readSaldoStore(api: SofiaApi): Promise<SaldoStore> {
  try { const raw = await encryptedStorage.read(saldoScope(api)); const v = raw ? JSON.parse(raw) : null; if (v && typeof v === 'object' && v.snaps && v.log) return v; } catch { /* comeca do zero */ }
  return {snaps: {}, log: {}};
}
export let saldoQueue: Promise<void> = Promise.resolve();
export function recordSaldo(api: SofiaApi, data: Data) {
  saldoQueue = saldoQueue.then(async () => {
    const store = await readSaldoStore(api), at = new Date().toISOString(), present = new Set(data.txs.map(t => t.id));
    const snaps: Record<string, SaldoSnap> = {};
    for (const a of data.accounts) if (!a.archived) snaps[a.id] = saldoSnapshot(a, data.txs);
    const r = reserveOf(data.goals);
    if (r) snaps.reserve = reserveSnapshot(data.moves || [], r.id);
    for (const [key, snap] of Object.entries(snaps)) {
      const prev = store.snaps[key];
      const change = prev ? saldoDiff(prev, snap, at, present) : null;
      if (change && change.lines.length) store.log[key] = [change, ...(store.log[key] || [])].slice(0, 40);
    }
    store.snaps = snaps;
    await encryptedStorage.write(saldoScope(api), JSON.stringify(store));
  }).catch(() => undefined);
}
export function writeCache(api: SofiaApi, bundle: Bundle) { void encryptedStorage.write(cacheScope(api), JSON.stringify(bundle)).catch(() => undefined); }
export function saveEntity(api: SofiaApi, kind: string, title: string, data: Record<string, any>, existing?: Entity, state?: string) {
  // 0.3.234: "__content" e a descricao breve do item (fica no conteudo do registro, fora dos campos)
  const {__content, ...rest} = data, content = typeof __content === 'string' ? __content : undefined;
  return existing ? api.saveEntity({...existing, title, ...(content !== undefined ? {content} : {}), ...(state ? {state} : {}), data: {...existing.data, ...rest}})
    : api.saveEntity({kind, title, content: content ?? '', area: 'Pessoal', state: state || 'active', privacy: 'private', tags: [], data: rest});
}

/** 0.3.221: toque que nao se perde. No Android, o primeiro toque logo depois de rolar a folha as vezes so parava a rolagem
 * e nao chegava ao botao (era preciso tocar duas vezes, ex.: marcar o cartao numa conta). Aqui o toque tambem e lido direto
 * no proprio botao: dedo desceu e subiu no mesmo lugar = escolheu. Se o toque normal ja chegou, nao repete. */
export function SurePressable({onPress, ...rest}: React.ComponentProps<typeof Pressable> & {onPress: () => void}) {
  const start = useRef<{x: number; y: number; t: number} | null>(null), fired = useRef(false);
  return <Pressable {...rest} onPress={() => { fired.current = true; onPress(); }}
    onTouchStart={e => { fired.current = false; start.current = {x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now()}; }}
    onTouchCancel={() => { start.current = null; }}
    onTouchEnd={e => { const s0 = start.current; start.current = null;
      if (!s0 || Math.abs(e.nativeEvent.pageX - s0.x) + Math.abs(e.nativeEvent.pageY - s0.y) > 12 || Date.now() - s0.t > 700) return;
      setTimeout(() => { if (!fired.current) { fired.current = true; onPress(); } }, 0); }} />;
}
/** 0.3.222: compra/conta no cartao mostra em qual fatura vai ser cobrada (ex.: feita em outubro depois do fechamento -> novembro). */
export function cardWhen(t: Tx, cards: Card[]): string {
  const card = cards.find(x => x.id === t.cardId);
  if (!card || !t.date) return '';
  return ' · cobrado na fatura de ' + monthLabel(txInvoiceMonth(card, t)).split(' ')[0].toLowerCase();
}
export function Chips<T extends string | number>({value, options, onChange, scroll = false}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void; scroll?: boolean}) {
  const c = useTheme();
  const inner = options.map(o => (
    <SurePressable key={String(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}} onPress={() => onChange(o.value)}
      style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: o.value === value ? c.surface : 'transparent'}}>
      <Text style={{fontSize: 13, fontWeight: '500', color: o.value === value ? c.text : c.muted}}>{o.label}</Text>
    </SurePressable>
  ));
  const box = {flexDirection: 'row' as const, backgroundColor: c.input, borderRadius: 99, padding: 3};
  return scroll ? <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}><View style={box}>{inner}</View></ScrollView> : <View style={box}>{inner}</View>;
}
export function Card_({children, style}: {children: React.ReactNode; style?: any}) {
  const c = useTheme();
  return <View style={[{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 18, gap: 14}, style]}>{children}</View>;
}
export function Title({text, action, onAction}: {text: string; action?: string; onAction?: () => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Text style={{flex: 1, fontSize: 18, fontWeight: '600', color: c.text}}>{text}</Text>{action ? <Pressable onPress={onAction}><Text style={{color: c.accent, fontWeight: '500', fontSize: 13}}>{action}</Text></Pressable> : null}</View>;
}
export function Bar({pct, color}: {pct: number; color: string}) {
  const c = useTheme();
  return <View style={{height: 8, borderRadius: 4, backgroundColor: c.input, overflow: 'hidden'}}><View style={{width: `${Math.min(100, Math.max(0, pct * 100))}%`, height: 8, borderRadius: 4, backgroundColor: color}} /></View>;
}
/** 0.3.262 (fase 4 — numeros): valor grande com "R$" e centavos menores, numeros de largura fixa (nao "dancam"
 * quando mudam) e uma entrada suave quando o valor muda. Valores escondidos (olho) aparecem como estao. */
export function BigMoney({text, color, size = 32}: {text: string; color: string; size?: number}) {
  const m = /^(-?\s*R\$\s?)([\d.]+)(,\d{2})?$/.exec(String(text).replace(/\u00a0/g, ' ').trim());
  const rise = useRef(new Animated.Value(0)).current, first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } rise.setValue(6); Animated.timing(rise, {toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web'}).start(); }, [text, rise]);
  const base = {color, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const]};
  if (!m) return <Animated.Text style={[base, {fontSize: size, transform: [{translateY: rise}]}]}>{text}</Animated.Text>;
  return <Animated.View style={{flexDirection: 'row', alignItems: 'baseline', transform: [{translateY: rise}]}}>
    <Text style={[base, {fontSize: Math.round(size * 0.55), opacity: 0.85, marginRight: 4}]}>{m[1].replace(/\s+$/, '')}</Text>
    <Text style={[base, {fontSize: size, letterSpacing: -0.5}]}>{m[2]}</Text>
    {m[3] ? <Text style={[base, {fontSize: Math.round(size * 0.55), opacity: 0.85}]}>{m[3]}</Text> : null}
  </Animated.View>;
}
/** 0.3.259: icone da categoria (conjunto da Sofia) no lugar do emoji. */
export function CatIcon({cat, size = 18, color}: {cat: {glyph?: string; color: string}; size?: number; color?: string}) {
  return <Icon name={(cat.glyph || 'circle') as IconName} size={size} color={color || cat.color} weight="duotone" />;
}
export function Dot({color, icon, glyph, size = 36}: {color: string; icon: string; glyph?: string; size?: number}) {
  return <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center'}}>{glyph ? <CatIcon cat={{glyph, color}} size={Math.round(size * 0.52)} /> : <Text style={{fontSize: size * 0.48}}>{icon}</Text>}</View>;
}
