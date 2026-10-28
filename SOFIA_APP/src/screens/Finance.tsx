import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useValuesHidden} from '../lib/values-mask';
import {tap,useColumnPad,useDesktop} from '../lib/desktop';
import {GoalProgressCard} from '../components/GoalProgress';
import type {GoalNumbers} from '../components/GoalProgress';
import {keepIfSame, useCachedGoal, writeGoalWidget} from '../lib/goal-widget';
import {scheduleIdleTask} from '../lib/idle-task';
import * as SecureStore from 'expo-secure-store';
import {ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, Switch, Text, TextInput, View, Dimensions, PanResponder, Animated} from 'react-native';
// 0.3.255: ScrollView que rola sozinho ate o calendario aberto caber na tela (ver RevealScroll)
import {RevealScrollView as ScrollView} from '../components/RevealScroll';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect, Line} from 'react-native-svg';
import {useTheme, light} from '../lib/theme';
import {encryptedStorage} from '../lib/encrypted-storage';
import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';
import type {ImportItem} from '../lib/api';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {errorText} from '../lib/chat-model';
import {useRenderCost} from '../lib/render-cost';
import {MotionModal} from '../components/MotionModal';
import {Sheet, markSheetHandoff} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {DateTimeField} from '../components/DateTimeField';
import {Icon} from '../components/Icon';
import {Button, IconButton} from '../components/UI';
import {PriceChart} from '../components/PriceChart';
import {Spinner, LoadingLines, ShimmerBlock, ShimmerGroup} from '../components/Loading';
import {money} from '../lib/monitoring';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ACCOUNT_TYPES, FIN_COLORS, categoryOf, toAccount, toCard, toTx, toBudget, toGoal, monthOf, addMonths, monthLabel, todayISO,
  invoiceMonth, cardInvoices, cardUsed, installmentPlan, accountBalance, totalBalance, forecastBalance, monthTxs, monthSummary, byCategory, budgetProgress,
  trend, balanceSeries, upcoming, manualDues, transactionsForAccount, goalProgress, parseMoney, formatMoneyInput, finishMoneyInput, addDays,
  dayIn, daysIn} from '../lib/finance';
import type {Account, Card, Tx, TxKind, Budget, Goal, Invoice, Due, ReserveMove, SaldoSnap, SaldoChange} from '../lib/finance';
import {saldoSnapshot, reserveSnapshot, saldoDiff, cardBillSettled, saldoLedger, txInvoiceMonth, invoiceForMonth} from '../lib/finance';
import type {LedgerItem} from '../lib/finance';
import {cycleControl, sinceReportStart, cycleRange, cycleRoom, fixedSummary, lastInstallmentMonth, monthDues, moneySplit, reserveOutlook, reserveBadge, reserveHistory, reserveMoveLabel, reserveOf, reserveFor, reserveSeries, toReserveMove, effectiveCycleDay, periodBudget, salaryForecast, currentPlan, nextPlan, simpleForecast, spendControl, categoryAlerts, lastWeekByCategory, duplicateGroups, moneyLeft, monthControl, balanceAsOf, isOneOffIncome, fixedDuplicateGroups, fixedUpcoming, isScheduled, exactTwinExtras} from '../lib/finance';
import {syncFinanceDueNotifications} from '../lib/finance-notifications';
import {appAlert} from '../lib/app-alert';
import {useFormDraft, clearAllFormDrafts} from '../lib/form-draft';

const GOOD = '#2fc58b', BAD = '#ff6b7a', WARN = '#ffb547', GUARD = '#1f9d63';
/** 0.3.255: devolucao a receber (reembolso, estorno...). Nao mexe no Saldo nem no previsto; ao tocar em "Recebi" vira uma
 * receita paga de hoje, que entra no Saldo e no Historico. */
type Refund = {id: string; title: string; amount: number; expected: string; accountId: string; state: string; receivedAt: string; entity: Entity};
type Data = {accounts: Account[]; cards: Card[]; txs: Tx[]; budgets: Budget[]; goals: Goal[]; moves: ReserveMove[]; statements: Statement[]; refunds?: Refund[]};
function toRefund(e: Entity): Refund { return {id: e.id, title: e.title, amount: Number(e.data?.amount || 0), expected: String(e.data?.expected_date || ''), accountId: String(e.data?.account_id || ''), state: e.state, receivedAt: String(e.data?.received_at || ''), entity: e}; }
// 0.3.213: extrato do banco guardado a parte - serve para conferir (conciliacao) e acertar o saldo; nao e lancamento
type StatementLine = {import_id: string; date: string; desc: string; original?: string; amount: number; kind: string};
type Statement = {id: string; accountId: string; from: string; to: string; closing: number | null; lines: StatementLine[]; entity: Entity};
function toStatement(e: Entity): Statement { let lines: StatementLine[] = []; try { const a = JSON.parse(String(e.data?.lines_json || '[]')); if (Array.isArray(a)) lines = a; } catch { lines = []; }
  const cb = e.data?.closing_balance; return {id: e.id, accountId: String(e.data?.account_id || ''), from: String(e.data?.from || ''), to: String(e.data?.to || ''), closing: cb === '' || cb === null || cb === undefined ? null : Number(cb), lines, entity: e}; }
type Tab = 'home' | 'txs' | 'bills' | 'cards' | 'plan' | 'reports' | 'refunds';
const KINDS = ['fin_account', 'fin_card', 'fin_tx', 'fin_budget', 'fin_goal', 'fin_reserve_move', 'fin_statement', 'fin_refund'] as const;
const dateBR = (d: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const weekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC'});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

type Bundle = {items: Record<string, Entity[]>; carry?: Record<string, number>; window?: {from: string; to: string} | null};
/** Mês a mês: o servidor manda só os lançamentos da janela e o "saldo acumulado" de cada
 * conta até o início dela. Somado ao saldo inicial, todos os cálculos (saldo, previsto,
 * gráfico dia a dia) continuam exatos sem baixar o histórico inteiro. */
function toData(all: Record<string, Entity[]>, carry: Record<string, number> = {}): Data {
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
async function loadAll(api: SofiaApi, window: {from: string; to: string}): Promise<Bundle> {
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
const cacheScope = (api: SofiaApi) => 'sofia-finance-v1|' + api.owner.trim().toLowerCase();
async function readCache(api: SofiaApi): Promise<Bundle | null> {
  try { const raw = await encryptedStorage.read(cacheScope(api)); const v = raw ? JSON.parse(raw) : null; return v && typeof v === 'object' && v.items ? v : null; } catch { return null; }
}
// 0.3.221: a cada atualizacao do mes atual, o app guarda (criptografado, no aparelho) um retrato do que forma o Saldo
// de cada conta e da reserva. Se o Saldo mudar entre uma vez e outra, fica registrado o que mudou - inclusive o que
// saiu do app sem a pessoa ver. O Extrato do saldo mostra essa lista.
type SaldoStore = {snaps: Record<string, SaldoSnap>; log: Record<string, SaldoChange[]>};
const saldoScope = (api: SofiaApi) => 'sofia-finance-saldo-v1|' + api.owner.trim().toLowerCase();
async function readSaldoStore(api: SofiaApi): Promise<SaldoStore> {
  try { const raw = await encryptedStorage.read(saldoScope(api)); const v = raw ? JSON.parse(raw) : null; if (v && typeof v === 'object' && v.snaps && v.log) return v; } catch { /* comeca do zero */ }
  return {snaps: {}, log: {}};
}
let saldoQueue: Promise<void> = Promise.resolve();
function recordSaldo(api: SofiaApi, data: Data) {
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
function writeCache(api: SofiaApi, bundle: Bundle) { void encryptedStorage.write(cacheScope(api), JSON.stringify(bundle)).catch(() => undefined); }
function saveEntity(api: SofiaApi, kind: string, title: string, data: Record<string, any>, existing?: Entity, state?: string) {
  // 0.3.234: "__content" e a descricao breve do item (fica no conteudo do registro, fora dos campos)
  const {__content, ...rest} = data, content = typeof __content === 'string' ? __content : undefined;
  return existing ? api.saveEntity({...existing, title, ...(content !== undefined ? {content} : {}), ...(state ? {state} : {}), data: {...existing.data, ...rest}})
    : api.saveEntity({kind, title, content: content ?? '', area: 'Pessoal', state: state || 'active', privacy: 'private', tags: [], data: rest});
}

/** 0.3.221: toque que nao se perde. No Android, o primeiro toque logo depois de rolar a folha as vezes so parava a rolagem
 * e nao chegava ao botao (era preciso tocar duas vezes, ex.: marcar o cartao numa conta). Aqui o toque tambem e lido direto
 * no proprio botao: dedo desceu e subiu no mesmo lugar = escolheu. Se o toque normal ja chegou, nao repete. */
function SurePressable({onPress, ...rest}: React.ComponentProps<typeof Pressable> & {onPress: () => void}) {
  const start = useRef<{x: number; y: number; t: number} | null>(null), fired = useRef(false);
  return <Pressable {...rest} onPress={() => { fired.current = true; onPress(); }}
    onTouchStart={e => { fired.current = false; start.current = {x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now()}; }}
    onTouchCancel={() => { start.current = null; }}
    onTouchEnd={e => { const s0 = start.current; start.current = null;
      if (!s0 || Math.abs(e.nativeEvent.pageX - s0.x) + Math.abs(e.nativeEvent.pageY - s0.y) > 12 || Date.now() - s0.t > 700) return;
      setTimeout(() => { if (!fired.current) { fired.current = true; onPress(); } }, 0); }} />;
}
/** 0.3.222: compra/conta no cartao mostra em qual fatura vai ser cobrada (ex.: feita em outubro depois do fechamento -> novembro). */
function cardWhen(t: Tx, cards: Card[]): string {
  const card = cards.find(x => x.id === t.cardId);
  if (!card || !t.date) return '';
  return ' · cobrado na fatura de ' + monthLabel(txInvoiceMonth(card, t)).split(' ')[0].toLowerCase();
}
function Chips<T extends string | number>({value, options, onChange, scroll = false}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void; scroll?: boolean}) {
  const c = useTheme();
  const inner = options.map(o => (
    <SurePressable key={String(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}} onPress={() => onChange(o.value)}
      style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: o.value === value ? c.surface : 'transparent'}}>
      <Text style={{fontSize: 13, fontWeight: '600', color: o.value === value ? c.text : c.muted}}>{o.label}</Text>
    </SurePressable>
  ));
  const box = {flexDirection: 'row' as const, backgroundColor: c.input, borderRadius: 99, padding: 3};
  return scroll ? <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}><View style={box}>{inner}</View></ScrollView> : <View style={box}>{inner}</View>;
}
function Card_({children, style}: {children: React.ReactNode; style?: any}) {
  const c = useTheme();
  return <View style={[{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 18, gap: 14}, style]}>{children}</View>;
}
function Title({text, action, onAction}: {text: string; action?: string; onAction?: () => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Text style={{flex: 1, fontSize: 17, fontWeight: '700', color: c.text}}>{text}</Text>{action ? <Pressable onPress={onAction}><Text style={{color: c.accent, fontWeight: '600', fontSize: 13}}>{action}</Text></Pressable> : null}</View>;
}
function Bar({pct, color}: {pct: number; color: string}) {
  const c = useTheme();
  return <View style={{height: 8, borderRadius: 4, backgroundColor: c.input, overflow: 'hidden'}}><View style={{width: `${Math.min(100, Math.max(0, pct * 100))}%`, height: 8, borderRadius: 4, backgroundColor: color}} /></View>;
}
function Dot({color, icon, size = 36}: {color: string; icon: string; size?: number}) {
  return <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center'}}><Text style={{fontSize: size * 0.48}}>{icon}</Text></View>;
}

// ============================ TELA ============================
export function Finance({api, active, onBack, onAppsTap}: {onAppsTap?: (handler: (() => boolean) | null) => void; api: SofiaApi; active: boolean; onBack: () => void}) {
  const pad = useColumnPad(); // 0.3.253: barras de cima alinhadas a coluna
  const desktop = useDesktop(); // 0.3.252 (computador)
  useRenderCost('apps:finance');
  const c = useTheme(), insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('home'), [month, setMonth] = useState(monthOf(todayISO()));
  const [editing, setEditing] = useState<Partial<Tx> | null>(null), [manage, setManage] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState(''), [accountPicker, setAccountPicker] = useState(false);
  const [billScope, setBillScope] = useState<'month' | 'series'>('series'), [billFlow, setBillFlow] = useState<'expense' | 'income'>('expense');
  const [billEditor, setBillEditor] = useState<Tx | 'new' | null>(null), [notificationWarning, setNotificationWarning] = useState(''), [billCard, setBillCard] = useState('');
  const [pendingSide, setPendingSide] = useState<'pagar' | 'receber'>('pagar');
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);
  const navigateFinance = useCallback((next: Tab) => {
    if (next === tab) return;
    setTabHistory(h => [...h, tab].slice(-16)); setTab(next);
  },[tab]);
  // 0.3.226: editar/apagar muda a tela na hora (item, totais de Receitas/Despesas, Historico); o servidor segue por tras
  const patchTx = useCallback((id: string, ch: Partial<Tx>) => setData(prev => prev ? {...prev, txs: prev.txs.map(x => x.id === id ? {...x, ...ch} : x)} : prev), []);
  const removeTx = useCallback((id: string) => setData(prev => prev ? {...prev, txs: prev.txs.filter(x => x.id !== id)} : prev), []);
  const putTx = useCallback((t: Tx, replaceId: string | null) => setData(prev => prev ? {...prev, txs: replaceId ? prev.txs.map(x => x.id === replaceId ? t : x) : [...prev.txs, t]} : prev), []);
  useEffect(() => { void preloadFolds(); }, []);
  const markPaid = useCallback((t: Tx) => setData(prev => {
    if (!prev) return prev;
    if (t.virtual) return {...prev, txs: [...prev.txs, {...t, id: 'local:' + t.id, virtual: false, paid: true, recurrence: 'none'} as Tx]};
    return {...prev, txs: prev.txs.map(x => x.id === t.id ? {...x, paid: true, paidAt: todayISO()} : x)};
  }), []);
  const local = useMemo(() => ({markPaid}), [markPaid]);
  const goHome = useCallback(() => { setManage(false); setEditing(null); setBillEditor(null); setAccountPicker(false); setTabHistory([]); setTab('home'); }, []);
  const backFinance = useCallback(() => {
    if (billEditor) {setBillEditor(null);return;}
    if (accountPicker) {setAccountPicker(false);return;}
    if (editing) {setEditing(null);return;}
    if (manage) {setManage(false);return;}
    // 0.3.192: de qualquer aba volta direto para o Resumo; do Resumo, sai de Finanças
    // 0.3.225: volta ao Resumo e ao TOPO da pagina
    if (tab !== 'home') {setTab('home');setTabHistory([]);scrollY.current = 0;setTimeout(() => mainScroll.current?.scrollTo({y: 0, animated: false}), 0);return;}
    onBack();
  },[billEditor,accountPicker,editing,manage,tab,onBack]);
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {backFinance();return true;});
    return () => sub.remove();
  },[active,backFinance]);
  const window = financeWindow(month, tab), windowKey = window.from + '..' + window.to, loaded = useRef<string>('');
  const twinsTried = useRef(new Set<string>());
  // 0.3.224: tocar em Apps na barra dentro de Financas - fora do Resumo (ou com algo aberto por cima) volta ao Resumo;
  // no Resumo rolado para baixo, sobe ao topo; no Resumo ja no topo, sai para a grade de apps
  const mainScroll = useRef<ScrollView>(null), scrollY = useRef(0);
  const appsTap = useRef<() => boolean>(() => false);
  appsTap.current = () => {
    if (tab !== 'home' || editing || billEditor || manage || accountPicker || newMenu) { goHome(); setNewMenu(false); scrollY.current = 0; mainScroll.current?.scrollTo({y: 0, animated: false}); return true; }
    if (scrollY.current > 4) { mainScroll.current?.scrollTo({y: 0, animated: true}); scrollY.current = 0; return true; }
    return false;
  };
  useEffect(() => { if (!onAppsTap) return; onAppsTap(active ? () => appsTap.current() : null); return () => onAppsTap(null); }, [active, onAppsTap]);
  // 0.3.223: qual periodo ja chegou atualizado do servidor (o Controle de gastos so mostra numero e cor com ele)
  const [liveKey, setLiveKey] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    try { const bundle = await loadAll(api, window), fresh = toData(bundle.items, bundle.carry); setData(fresh); setError(''); loaded.current = windowKey; setLiveKey(windowKey);
      // 0.3.223: a copia no aparelho e so a do periodo padrao do mes atual (antes guardava a de outro mes e a tela abria com numeros dela)
      if (window.from === addMonths(monthOf(todayISO()), -1) && window.to === addMonths(monthOf(todayISO()), 1)) writeCache(api, bundle);
      // so a janela padrao do mes atual (o acumulado dos meses anteriores e sempre o mesmo corte) entra no registro do Saldo
      if (window.from === addMonths(monthOf(todayISO()), -1) && window.to === addMonths(monthOf(todayISO()), 1)) recordSaldo(api, fresh); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [api, windowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 0.3.232: copias identicas de uma conta/receita programada (sobra do rascunho que voltava) somem sozinhas ao abrir
  useEffect(() => { if (!data) return; const extras = exactTwinExtras(data.txs).filter(t => !twinsTried.current.has(t.id)); if (!extras.length) return;
    extras.forEach(t => twinsTried.current.add(t.id));
    void (async () => { for (const t of extras) { try { await api.deleteEntity(t.entity!.id); } catch { /* segue */ } } await reload(); })(); }, [data]);
  // 0.3.221: Financas continua montada depois de aberta (voltar aos Apps nao desmonta a tela). Ao sair, volta ao Resumo
  // do mes atual, como abria antes, e a proxima abertura atualiza por tras mostrando o que ja esta na tela.
  const wasActive = useRef(active);
  useEffect(() => { if (wasActive.current && !active) { goHome(); setMonth(monthOf(todayISO())); setNewMenu(false); loaded.current = ''; } wasActive.current = active; }, [active, goHome]);
  // Abre na hora com a última versão guardada (mês atual); a atualização chega por trás.
  // Mudou o mês ou foi para Relatórios: busca a janela nova, mantendo o que está na tela até chegar.
  useEffect(() => {
    if (!active) return;
    let live = true;
    if (!loaded.current) void readCache(api).then(b => { if (live && b && !loaded.current) setData(d => d || toData(b.items, b.carry)); });
    if (loaded.current !== windowKey) void reload();
    return () => { live = false; };
  }, [active, reload, api, windowKey]);

  const d = data;
  const primary = useMemo(() => {
    const activeAccounts = d?.accounts.filter(a => !a.archived) || [];
    return activeAccounts.find(a => /^conta principal$/i.test(a.name.trim())) || activeAccounts[0];
  },[d]);
  const account = d?.accounts.find(a => a.id === selectedAccount && !a.archived) || primary;
  const accountId = account?.id || '';
  const isPrimary = !primary || accountId === primary.id;
  const scoped = useMemo(() => {
    if (!d || !account) return d;
    return {...d, accounts: [{...account, include: true}], cards: d.cards.filter(card => card.accountId === account.id && !card.archived),
      txs: transactionsForAccount(d.txs,d.cards,account.id)};
  },[d,accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newMenu, setNewMenu] = useState(false), [aporteKey, setAporteKey] = useState(0);
  const newTx = (kind: TxKind = 'expense') => setEditing({kind, date: todayISO(), accountId, paid: true});
  useEffect(() => {
    if (!active || !d) return;
    let valid = true;
    void syncFinanceDueNotifications(d.txs, api.owner, new Date(), planReminder(d, todayISO())).then(w => {if(valid)setNotificationWarning(w);});
    return () => {valid=false;};
  },[active,api,d]);

  return (
    <FinanceLocal.Provider value={local}>
    <InternalBackGesture enabled={active && !editing && !manage && !billEditor && !accountPicker} onBack={backFinance}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        {/* 0.3.253: no computador o cabecalho, a linha conta/mes e as abas se alinham a coluna de leitura */}
        <View style={pad(0)}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 2}}>
          <IconButton name="back" label="Voltar à tela anterior" onPress={backFinance} />
          <View style={{flex: 1, paddingHorizontal: 4}}>
            <Text style={{fontSize: 24, fontWeight: '800', color: c.text}}>Finanças</Text>
          </View>
          <IconButton name="settings" label="Contas e cartões" onPress={() => setManage(true)} />
        </View>
        {/* 0.3.152: conta e mes na mesma linha, compactos (antes eram dois blocos grandes) */}
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 8}}>
          {d?.accounts.length ? <Pressable accessibilityRole="button" accessibilityLabel={'Conta: ' + (account?.name || 'selecionar') + '. Trocar'} onPress={() => setAccountPicker(true)}
            style={{flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8}}>
            <View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: account?.color || c.accent}} />
            <Text numberOfLines={1} style={{flexShrink: 1, fontWeight: '700', color: c.text, fontSize: 13}}>{account?.name || 'Selecionar conta'}</Text>
            <Text style={{color: c.muted, fontSize: 11}}>▾</Text>
          </Pressable> : <View style={{flex: 1}} />}
          <View style={{flex: 1}} />
          {desktop && d?.accounts.length ? <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" onPress={() => setNewMenu(true)} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: c.accent, marginRight: 10}}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 13}}>＋ Novo lançamento</Text></Pressable> : null}
          <IconButton name="back" label="Mês anterior" size={32} onPress={() => setMonth(m => addMonths(m, -1))} />
          <Pressable accessibilityLabel="Voltar ao mês atual" onPress={() => setMonth(monthOf(todayISO()))}><Text style={{fontSize: 14, fontWeight: '700', color: c.text, minWidth: 104, textAlign: 'center'}}>{monthLabel(month)}</Text></Pressable>
          <Pressable accessibilityLabel="Próximo mês" onPress={() => setMonth(m => addMonths(m, 1))} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '180deg'}]}}><Icon name="back" size={18} color={c.text} /></Pressable>
        </View>
        <View style={{paddingHorizontal: 20, paddingBottom: 14}}>
          <Chips scroll value={tab} onChange={navigateFinance} options={[{value: 'home' as Tab, label: 'Resumo'}, {value: 'bills' as Tab, label: 'Contas'}, {value: 'cards' as Tab, label: 'Cartões'}, {value: 'refunds' as Tab, label: 'Devoluções'}, {value: 'reports' as Tab, label: 'Relatórios'}]} />
        </View>
        </View>

        {!d ? <View style={{flex: 1, padding: 16, gap: 14}}>{error ? <View style={{padding: 20, gap: 12}}><Text style={{color: c.danger}}>{error}</Text><Button title="Tentar de novo" secondary onPress={() => void reload()} /></View> : <View style={{gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Spinner size={16} stroke={1.8} /><Text style={{color: c.muted, fontSize: 13}}>Carregando suas finanças</Text></View><LoadingLines rows={5} /></View>}</View> : !d.accounts.length ? (
          <Onboarding api={api} onDone={reload} onFinished={goHome} />
        ) : (
          <ScrollView ref={mainScroll} onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={64} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal: 20, paddingTop: 2, paddingBottom: 84, gap: 16}} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
            {tab === 'home' ? <HomeTab onPatchTx={patchTx} onRemoveTx={removeTx} failed={!!error} fresh={liveKey === windowKey} d={scoped || d} month={month} api={api} reload={reload} onTx={setEditing} onTab={navigateFinance} accountId={accountId} isPrimary={isPrimary} onBill={t => { setBillScope('series'); setBillEditor(t || 'new'); }} aporteKey={aporteKey} />
              : tab === 'bills' ? <PendingTab d={scoped || d} api={api} month={month} accountId={accountId} isPrimary={isPrimary} onAporte={() => { navigateFinance('home'); setAporteKey(k => k + 1); }} warning={notificationWarning} onBill={(t, scope) => { setBillScope(scope || 'series'); setBillFlow('expense'); setBillEditor(t); }} onNew={flow => { setBillScope('series'); setBillFlow(flow); setBillEditor('new'); }} onMonth={setMonth} side={pendingSide} onSide={setPendingSide} reload={reload} />
              : tab === 'cards' ? <CardsTab d={scoped || d} month={month} api={api} reload={reload} onTx={setEditing} onManage={() => setManage(true)} onNewBill={cid => { setBillScope('series'); setBillFlow('expense'); setBillCard(cid); setBillEditor('new'); }} onEditBill={t => { setBillScope('series'); setBillCard(''); setBillEditor(t); }} />
              : tab === 'refunds' ? <RefundsTab d={d} api={api} reload={reload} accountId={accountId} />
              : <ReportsTab d={scoped || d} month={month} reserve={reserveFor((scoped || d).goals, accountId, isPrimary)} api={api} reload={reload} />}
          </ScrollView>
        )}

        {d && d.accounts.length ? <>
          {/* 0.3.152: um unico botao + (antes eram dois botoes grandes sobre o extrato) */}
          {/* 0.3.252: botao flutuante e coisa de celular; no computador o + fica no topo, ao lado do mes */}
          {!desktop ? <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" onPress={() => setNewMenu(true)}
            style={{position: 'absolute', right: 18, bottom: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', elevation: 6}}>
            <Text style={{color: c.onAccent, fontSize: 28, fontWeight: '400', marginTop: -2}}>＋</Text>
          </Pressable> : null}
          <Sheet visible={newMenu} onClose={() => setNewMenu(false)} label="Fechar novo lançamento">
            <View style={{gap: 4, paddingBottom: 12}}>
              <Text style={{fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 6}}>Novo lançamento</Text>
              {([['expense', '↓ Despesa', BAD], ['income', '↑ Receita', GOOD], ['transfer', '⇄ Transferência entre contas', c.accent]] as const).map(([k, label, color]) =>
                <Pressable key={k} accessibilityRole="button" onPress={() => { setNewMenu(false); afterSheet(() => newTx(k as TxKind)); }} style={{paddingVertical: 15, borderBottomWidth: 1, borderColor: c.line}}><Text style={{color, fontSize: 16, fontWeight: '700'}}>{label}</Text></Pressable>)}
              <Pressable accessibilityRole="button" onPress={() => { setNewMenu(false); navigateFinance('home'); afterSheet(() => setAporteKey(k => k + 1)); }} style={{paddingVertical: 15, borderBottomWidth: 1, borderColor: c.line}}><Text style={{color: GUARD, fontSize: 16, fontWeight: '700'}}>🔒 Aporte (guardar dinheiro)</Text></Pressable>
              {/* 0.3.213: um "+" com as cinco entradas do modulo */}
              {([['expense', '⏰ Conta a pagar', c.text], ['income', '⏰ Conta a receber', c.text]] as const).map(([flow, label, color]) =>
                <Pressable key={flow} accessibilityRole="button" onPress={() => { setNewMenu(false); setBillScope('series'); setBillFlow(flow); afterSheet(() => setBillEditor('new')); }} style={{paddingVertical: 15, borderBottomWidth: flow === 'expense' ? 1 : 0, borderColor: c.line}}><Text style={{color, fontSize: 16, fontWeight: '700'}}>{label}</Text></Pressable>)}
            </View>
          </Sheet>
        </> : null}

        {editing && d ? <TxEditor api={api} d={d} tx={editing} defaultAccountId={accountId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} onOptimistic={patchTx} onOptimisticRemove={removeTx} /> : null}
        {billEditor && d ? <BillEditor api={api} scope={billScope} initialFlow={billFlow} hasReserve={!!reserveOf(d.goals)} finance={d} initialCard={billCard} tx={billEditor === 'new' ? null : billEditor} accountId={accountId} onClose={() => { setBillEditor(null); setBillCard(''); }} onSaved={saved => {setBillEditor(null); setBillCard('');
          // 0.3.207: depois de salvar, vai para o mes e para o lado (A pagar / A receber) da conta e confirma onde ficou
          if(saved){setMonth(monthOf(saved.date));setPendingSide(saved.kind==='income'?'receber':'pagar');navigateFinance('bills');
            }
          void reload();}}
          onOptimistic={(t, replaceId) => { setData(prev => prev ? {...prev, txs: replaceId ? prev.txs.map(x => x.id === replaceId ? t : x) : [...prev.txs, t]} : prev);
            setBillEditor(null); setBillCard(''); setMonth(monthOf(t.date)); setPendingSide(t.kind === 'income' ? 'receber' : 'pagar'); navigateFinance('bills'); }} /> : null}
        {manage && d ? <ManageSheet api={api} d={d} onClose={() => setManage(false)} onFinished={goHome} reload={reload} /> : null}
        <Sheet visible={accountPicker} onClose={() => setAccountPicker(false)} label="Fechar seletor de contas">
          <View style={{gap:14,paddingBottom:12}}>
            <Text style={{fontSize:19,fontWeight:'800',color:c.text}}>Qual conta quer acompanhar?</Text>
            <Text style={{fontSize:12,color:c.muted}}>Cada conta mostra apenas o próprio saldo, entradas, saídas, faturas e pendências.</Text>
            {d?.accounts.filter(a=>!a.archived).map(a=><Pressable key={a.id} accessibilityRole="button" accessibilityState={{selected:a.id===accountId}} onPress={()=>{setSelectedAccount(a.id);setTab('home');setTabHistory([]);setAccountPicker(false);}}
              style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:13,borderBottomWidth:1,borderColor:c.line}}>
              <View style={{width:12,height:12,borderRadius:6,backgroundColor:a.color}} />
              <View style={{flex:1}}><Text style={{color:c.text,fontSize:15,fontWeight:'700'}}>{a.name}</Text><Text style={{color:c.muted,fontSize:11}}>{a.id===primary?.id?'Principal':'Secundária'}</Text></View>
              <Text style={{color:c.text,fontWeight:'700'}}>{money(accountBalance(a,d.txs))}</Text>
            </Pressable>)}
            <Button title="Gerenciar ou adicionar conta" secondary onPress={()=>{setAccountPicker(false);setManage(true);}} />
          </View>
        </Sheet>
      </View>
    </InternalBackGesture>
    </FinanceLocal.Provider>
  );
}

// ============================ PRIMEIRO USO ============================
/** 0.3.161: passo a passo da primeira configuracao. Tudo opcional menos a conta; "Pular" em
 * qualquer passo vai direto para o app. Reaberto depois em Contas e cartoes, ja preenchido. */
function Onboarding({api, onDone, existing, onClose, onFinished}: {api: SofiaApi; onDone: () => Promise<void>; existing?: {account: Account | null; reserve: Goal | null; fixed?: Tx[]; salary?: Tx | null} | null; onClose?: () => void; onFinished?: () => void}) {
  const c = useTheme(), acc = existing?.account || null, reserve = existing?.reserve || null;
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(acc?.name || 'Conta principal'), [balance, setBalance] = useState(acc ? finishMoneyInput(String(acc.initial - (acc.carry || 0)).replace('.', ',')) : '');
  const [cycleDay, setCycleDay] = useState(acc?.cycleDay ? String(acc.cycleDay) : '');
  const salaryTx = existing?.salary || null;
  const [salary, setSalary] = useState(salaryTx ? finishMoneyInput(String(salaryTx.amount).replace('.', ',')) : '');
  // 0.3.171: ao refazer, as contas fixas que ja existem entram na lista; nada e alterado ate confirmar no fim.
  type WizardBill = {id?: string; title: string; amount: string; day: string; parcels: string; at: string};
  const [bills, setBills] = useState<WizardBill[]>(() => (existing?.fixed || []).filter(t => t.entity).map(t => ({id: t.entity!.id, title: t.desc, amount: finishMoneyInput(String(t.amount).replace('.', ',')),
    day: String(Number(t.date.slice(8, 10)) || ''), parcels: t.entity!.data?.installments ? String(t.entity!.data.installments) : '', at: t.entity!.data?.installment ? String(t.entity!.data.installment) : ''})));
  const [billTitle, setBillTitle] = useState(''), [billAmount, setBillAmount] = useState(''), [billDay, setBillDay] = useState(''), [billParcels, setBillParcels] = useState(''), [billAt, setBillAt] = useState('');
  const [billEditing, setBillEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(reserve ? finishMoneyInput(String(reserve.saved).replace('.', ',')) : '');
  const [plan, setPlan] = useState(reserve?.entity?.data?.monthly_plan ? finishMoneyInput(String(reserve.entity.data.monthly_plan).replace('.', ',')) : '');
  const [planDay, setPlanDay] = useState(String(reserve?.entity?.data?.plan_day || ''));
  const [goalValue, setGoalValue] = useState(reserve?.target ? finishMoneyInput(String(reserve.target).replace('.', ',')) : '');
  const [goalMonth, setGoalMonth] = useState(String(reserve?.entity?.data?.deadline || '').slice(0, 10));
  // 0.3.168: a configuracao tambem sobrevive a sair do app no meio do preenchimento.
  const wizardForm = {step: String(step), name, balance, cycleDay, salary, bills: JSON.stringify(bills), saved, plan, planDay, goalValue, goalMonth,
    billTitle, billAmount, billDay, billParcels, billAt};
  const {draft: wizardDraft, ready: wizardReady, clear: clearWizardDraft} = useFormDraft('financas:setup:' + (acc?.id || 'novo'), wizardForm);
  const wizardRestored = useRef(false);
  useEffect(() => {
    if (!wizardReady || wizardRestored.current || !wizardDraft) return;
    wizardRestored.current = true;
    const d = wizardDraft as Record<string, string>;
    if (d.name !== undefined) setName(d.name);
    if (d.balance !== undefined) setBalance(d.balance);
    if (d.cycleDay !== undefined) setCycleDay(d.cycleDay);
    if (d.salary !== undefined) setSalary(d.salary);
    if (d.saved !== undefined) setSaved(d.saved);
    if (d.plan !== undefined) setPlan(d.plan);
    if (d.planDay !== undefined) setPlanDay(d.planDay);
    if (d.goalValue !== undefined) setGoalValue(d.goalValue);
    if (d.goalMonth !== undefined) setGoalMonth(d.goalMonth);
    if (d.bills) { try { const list = JSON.parse(d.bills); if (Array.isArray(list)) setBills(list); } catch { /* rascunho invalido */ } }
    if (d.billTitle !== undefined) setBillTitle(d.billTitle);
    if (d.billAmount !== undefined) setBillAmount(d.billAmount);
    if (d.billDay !== undefined) setBillDay(d.billDay);
    if (d.billParcels !== undefined) setBillParcels(d.billParcels);
    if (d.billAt !== undefined) setBillAt(d.billAt);
    if (d.step) setStep(Math.max(0, Math.min(6, Number(d.step) || 0)));
  }, [wizardReady, wizardDraft]);
  const money0 = (v: string) => parseMoney(v) ?? 0;
  const fixedTotal = bills.reduce((t, b) => t + money0(b.amount), 0);
  const ceiling = Math.max(0, money0(balance) - fixedTotal - money0(plan));

  function confirmFinish() {
    if (!existing) { void finish(); return; }
    appAlert('Substituir a configuração atual?', 'Conta, dia do recebimento, contas fixas, guardado, aporte e meta passam a ser os desta configuração. Contas fixas que você removeu daqui são arquivadas. Lançamentos e histórico não são apagados.',
      [{text: 'Voltar', style: 'cancel'}, {text: 'Substituir', onPress: () => void finish()}]);
  }
  async function finish() {
    setBusy(true); setError('');
    try {
      // 0.3.186: ao refazer, o saldo inicial da conta so muda se a pessoa mexeu no campo
      // 0.3.221: compara e grava o saldo inicial guardado na conta. Antes entrava o acumulado dos meses anteriores junto,
      // e ele passava a contar duas vezes (o Saldo subia sozinho).
      const storedInitial = acc ? Math.round((acc.initial - (acc.carry || 0)) * 100) / 100 : 0;
      const initialTouched = !acc || money0(balance) !== storedInitial;
      const account = await saveEntity(api, 'fin_account', name.trim() || 'Conta principal',
        {account_type: acc?.type || 'corrente', initial_balance: String(initialTouched ? money0(balance) : storedInitial), ...(initialTouched ? {balance_set_at: todayISO()} : {}), color: acc?.color || FIN_COLORS[0], include_total: true, cycle_day: Math.min(31, Math.max(0, Number(cycleDay) || 0))}, acc?.entity);
      // 0.3.196: salario fixo do mes (valor cheio), a receber todo mes no dia informado
      if (money0(salary) > 0) {
        const today = todayISO(), payDay = Math.min(31, Math.max(1, Number(cycleDay) || Number(salaryTx?.date.slice(8, 10)) || 5));
        const thisMonth = monthOf(today), first = dayIn(thisMonth, Math.min(payDay, daysIn(thisMonth))) >= today ? thisMonth : addMonths(thisMonth, 1);
        if (salaryTx?.entity) {
          const base = String(salaryTx.entity.data?.date || salaryTx.date).slice(0, 7);
          await api.saveEntity({...salaryTx.entity, data: {...salaryTx.entity.data, amount: money0(salary), date: dayIn(base, Math.min(payDay, daysIn(base)))}});
        } else {
          await api.saveEntity({kind: 'fin_tx', title: 'Salário', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [],
            data: {kind: 'income', amount: money0(salary), date: dayIn(first, Math.min(payDay, daysIn(first))), account_id: account.id, paid: false, category: 'Salário', recurrence: 'monthly', import_id: 'sofia-pendencia:' + Date.now() + ':salario', remind_days: 0}});
        }
      }
      const kept = new Set(bills.map(b => b.id).filter(Boolean));
      const jobs: Promise<unknown>[] = [];
      for (const old of existing?.fixed || []) if (old.entity && !kept.has(old.entity.id)) jobs.push(api.saveEntity({...old.entity, state: 'archived'}));
      for (const [n, b] of bills.entries()) {
        const day = Math.min(28, Math.max(1, Number(b.day) || 1)), month = monthOf(todayISO());
        const previous = b.id ? (existing?.fixed || []).find(t => t.entity?.id === b.id) : undefined;
        if (previous && previous.entity) {
          const parcels = Number(b.parcels) > 1 ? Math.min(360, Math.round(Number(b.parcels))) : '';
          const at = parcels ? Math.min(Number(parcels), Math.max(1, Math.round(Number(b.at)) || 1)) : '';
          const pdate = dayIn(monthOf(previous.date), day);
          jobs.push(api.saveEntity({...previous.entity, title: b.title.trim(), data: {...previous.entity.data, amount: money0(b.amount), date: pdate,
            installments: parcels, installment: at, recurrence_end: parcels ? addMonths(monthOf(pdate), Number(parcels) - Number(at || 1)) : ''}}));
          continue;
        }
        jobs.push(api.saveEntity({kind: 'fin_tx', title: b.title.trim(), content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [],
          data: {kind: 'expense', amount: money0(b.amount), date: dayIn(month, day), account_id: account.id, paid: false, category: 'Contas', recurrence: 'monthly',
            installments: Number(b.parcels) > 1 ? Math.min(360, Math.round(Number(b.parcels))) : '',
            installment: Number(b.parcels) > 1 ? Math.min(Math.round(Number(b.parcels)), Math.max(1, Math.round(Number(b.at)) || 1)) : '',
            recurrence_end: Number(b.parcels) > 1 ? addMonths(month, Math.round(Number(b.parcels)) - Math.max(1, Math.round(Number(b.at)) || 1)) : '',
            import_id: 'sofia-pendencia:' + Date.now() + ':' + n + ':' + day, remind_days: 0}}));
      }
      if (money0(saved) > 0 || money0(plan) > 0 || money0(goalValue) > 0) {
        const data: Record<string, unknown> = {role: 'reserve', saved: money0(saved), monthly_plan: money0(plan), color: GOOD, account_id: account.id,
          plan_day: Math.min(28, Math.max(1, Number(planDay) || Number(cycleDay) || 5)), remind_time: '09:00', remind_before_days: 0, remind_repeat_days: 0,
          target: money0(goalValue) || '', deadline: /^\d{4}-\d{2}-\d{2}$/.test(goalMonth) ? goalMonth : ''};
        jobs.push(api.saveEntity(reserve ? {...reserve.entity, data: {...reserve.entity.data, ...data}} : {kind: 'fin_goal', title: 'Dinheiro guardado', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data}));
      }
      await Promise.all(jobs);
      await clearWizardDraft();
      if (existing) { if (onFinished) onFinished(); else onClose?.(); void onDone(); }
      else { await onDone(); if (onFinished) onFinished(); else onClose?.(); }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  const steps = [
    {title: 'Sua conta', hint: 'Onde seu dinheiro fica hoje. Dá para adicionar outras depois.', body: <>
      <Field label="Nome da conta" value={name} onChange={setName} />
      <Field label="Saldo inicial da conta (R$)" value={balance} onChange={setBalance} placeholder="0,00" numeric />
      <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>É o que está no banco agora, antes de qualquer lançamento na Sofia. Ele entra no Saldo. Em branco ou 0, a conta começa zerada.</Text>
    </>},
    {title: 'Quando e quanto você recebe', hint: 'O dia em que entra seu dinheiro e o valor do mês. A previsão e o controle de gastos contam de um recebimento ao outro.', body: <>
      <Field label="Dia em que você recebe" value={cycleDay} onChange={setCycleDay} placeholder="Ex.: 25" numeric />
      <Field label="Quanto você recebe por mês (R$)" value={salary} onChange={setSalary} placeholder="0,00" numeric />
      <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Recebe em duas vezes ou tem vale? Some tudo e coloque o valor cheio do mês: no fim dá no mesmo e a conta fica simples. Um freela ou um valor a mais você lança quando entrar, e ele soma na previsão.</Text>
    </>},
    {title: 'Contas fixas', hint: 'Aluguel, academia, imposto, assinaturas. Elas se repetem todo mês e a Sofia avisa no vencimento.', body: <>
      {bills.map((b, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={'Editar ' + b.title}
        onPress={() => { setBillEditing(i); setBillTitle(b.title); setBillAmount(b.amount); setBillDay(b.day); setBillParcels(b.parcels); setBillAt(b.at); }}
        style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: billEditing === i ? c.accent : c.line}}>
        <View style={{flex: 1}}><Text style={{color: billEditing === i ? c.accent : c.text, fontWeight: '600'}}>{b.title}</Text><Text style={{color: c.muted, fontSize: 11}}>dia {b.day || 1}{Number(b.parcels) > 1 ? ' · parcela ' + (Math.max(1, Number(b.at) || 1)) + ' de ' + Math.round(Number(b.parcels)) : ''}{billEditing === i ? ' · editando' : ''}</Text></View>
        <Text style={{color: c.text, fontWeight: '700'}}>{money(money0(b.amount))}</Text>
        <IconButton name="trash" label={'Remover ' + b.title} onPress={() => { setBills(list => list.filter((_, n) => n !== i)); if (billEditing === i) { setBillEditing(null); setBillTitle(''); setBillAmount(''); setBillDay(''); setBillParcels(''); setBillAt(''); } }} />
      </Pressable>)}
      {bills.length ? <Text style={{color: c.muted, fontSize: 11}}>{tap('Toque em uma conta para corrigir os dados dela.')}</Text> : null}
      <Field label="Conta" value={billTitle} onChange={setBillTitle} placeholder="Ex.: Aluguel" />
      <View style={{flexDirection: 'row', gap: 10}}>
        <View style={{flex: 1}}><Field label="Valor (R$)" value={billAmount} onChange={setBillAmount} placeholder="0,00" numeric /></View>
        <View style={{flex: 1}}><Field label="Dia" value={billDay} onChange={setBillDay} placeholder="5" numeric /></View>
      </View>
      <View style={{flexDirection: 'row', gap: 10}}>
        <View style={{flex: 1}}><Field label="Parcelas (opcional)" value={billParcels} onChange={setBillParcels} placeholder="Ex.: 10" numeric /></View>
        {Number(billParcels) > 1 ? <View style={{flex: 1}}><Field label="Esta é a parcela nº" value={billAt} onChange={setBillAt} placeholder="1" numeric /></View> : null}
      </View>
      <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Conta com prazo (ex.: 10x)? Informe o total e em qual parcela você está. Ela acaba sozinha no fim e a Sofia avisa.</Text>
      <Button title={billEditing === null ? 'Adicionar conta fixa' : 'Salvar alteração'} secondary disabled={!billTitle.trim() || !money0(billAmount)}
        onPress={() => {
          const item = {title: billTitle.trim(), amount: billAmount, day: billDay, parcels: billParcels, at: billAt};
          setBills(list => billEditing === null ? [...list, item] : list.map((b, n) => n === billEditing ? item : b));
          setBillEditing(null); setBillTitle(''); setBillAmount(''); setBillDay(''); setBillParcels(''); setBillAt('');
        }} />
      {billEditing !== null ? <Pressable accessibilityRole="button" onPress={() => { setBillEditing(null); setBillTitle(''); setBillAmount(''); setBillDay(''); setBillParcels(''); setBillAt(''); }}><Text style={{color: c.muted, fontSize: 13, textAlign: 'center'}}>Cancelar a edição</Text></Pressable> : null}
      {bills.length ? <Text style={{color: c.muted, fontSize: 12}}>Total por mês: {money(fixedTotal)}</Text> : null}
    </>},
    {title: 'Dinheiro guardado', hint: 'Quanto você já tem guardado, esteja onde estiver. Esse valor fica separado do Saldo.', body:
      <Field label="Já guardado (R$)" value={saved} onChange={setSaved} placeholder="0,00" numeric />},
    {title: 'Aporte', hint: 'Quanto pretende guardar por mês e o dia do aviso. A Sofia avisa, você confirma.', body: <>
      <Field label="Aportes de (R$ por mês)" value={plan} onChange={setPlan} placeholder="0,00" numeric />
      <Field label="Avisar todo dia" value={planDay} onChange={setPlanDay} placeholder={cycleDay || '5'} numeric />
    </>},
    {title: 'Meta', hint: 'Quanto quer juntar e até quando. A Sofia mostra se o aporte dá conta do prazo.', body: <>
      <Field label="Quero juntar (R$)" value={goalValue} onChange={setGoalValue} placeholder="Ex.: 39.000,00" numeric />
      <DateTimeField label="Até" value={goalMonth} onChange={setGoalMonth} dateOnly emptyLabel="Escolher data" />
    </>},
    {title: 'Tudo pronto', hint: 'Você pode mudar qualquer coisa depois.', body: <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 8}}>
      <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Conta</Text><Text style={{color: c.text, fontWeight: '700'}}>{name || 'Conta principal'} · {money(money0(balance))}</Text></View>
      {cycleDay ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Recebe</Text><Text style={{color: c.text, fontWeight: '700'}}>{money0(salary) > 0 ? money(money0(salary)) + ' · ' : ''}todo dia {cycleDay}</Text></View> : null}
      {bills.length ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Contas fixas</Text><Text style={{color: c.text, fontWeight: '700'}}>{bills.length} · {money(fixedTotal)}</Text></View> : null}
      {money0(saved) > 0 ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Guardado</Text><Text style={{color: c.text, fontWeight: '700'}}>{money(money0(saved))}</Text></View> : null}
      {money0(plan) > 0 ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Aporte</Text><Text style={{color: c.text, fontWeight: '700'}}>{money(money0(plan))} por mês</Text></View> : null}
      {money0(goalValue) > 0 ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Meta</Text><Text style={{color: c.text, fontWeight: '700'}}>{money(money0(goalValue))}{goalMonth ? ' até ' + goalMonth.split('-').reverse().join('/') : ''}</Text></View> : null}
      <View style={{height: 1, backgroundColor: c.line}} />
      <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.text, fontWeight: '700', fontSize: 12}}>Saldo deste ciclo</Text><Text style={{color: GOOD, fontWeight: '800'}}>{money(ceiling)}</Text></View>
      <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>É o que sobra depois das contas fixas e do aporte. Essa é a conta que a tela inicial acompanha.</Text>
    </View>},
  ];
  const last = step === steps.length - 1, current = steps[step];
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 22, gap: 16}}>
      <View style={{flexDirection: 'row', gap: 6}}>
        {steps.map((_, i) => <View key={i} style={{flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.line}} />)}
      </View>
      <View style={{gap: 6}}>
        <Text style={{fontSize: 12, color: c.muted}}>Passo {step + 1} de {steps.length}</Text>
        <Text style={{fontSize: 21, fontWeight: '800', color: c.text}}>{current.title}</Text>
        <Text style={{fontSize: 13, color: c.muted, lineHeight: 20}}>{current.hint}</Text>
      </View>
      {current.body}
      {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
      {last && existing ? <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{tap('Nada foi alterado ainda. Só ao tocar em “Substituir configuração” estes dados passam a valer; se sair agora, tudo continua como estava.')}</Text> : null}
      <Button title={last ? (existing ? 'Substituir configuração' : 'Começar a usar') : 'Continuar'} loading={busy} disabled={step === 0 && !name.trim()}
        onPress={() => last ? confirmFinish() : setStep(s => s + 1)} />
      <View style={{flexDirection: 'row', justifyContent: 'center', gap: 18}}>
        {step > 0 ? <Pressable accessibilityRole="button" onPress={() => setStep(s => s - 1)}><Text style={{color: c.accent, fontSize: 13, fontWeight: '700'}}>Voltar</Text></Pressable> : null}
        {!last ? <Pressable accessibilityRole="button" onPress={() => setStep(steps.length - 1)}><Text style={{color: c.muted, fontSize: 13}}>{step === 0 ? 'Pular: só a conta. O resto a Sofia cadastra pelos seus prints' : 'Pular o resto'}</Text></Pressable> : null}
        {existing && onClose ? <Pressable accessibilityRole="button" onPress={onClose}><Text style={{color: c.muted, fontSize: 13}}>Cancelar</Text></Pressable> : null}
      </View>
    </ScrollView>
  );
}
function Field({label, value, onChange, placeholder, numeric = false, big = false}: {label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; big?: boolean}) {
  const c = useTheme(), isMoneyField = numeric && label.includes('(R$)');
  return (
    <View style={{gap: 6}}>
      <Text style={{fontSize: 12, color: c.muted}}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={v => onChange(isMoneyField ? formatMoneyInput(v, value) : v)} onBlur={() => { if (isMoneyField) onChange(finishMoneyInput(value)); }} placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={numeric ? 'decimal-pad' : 'default'}
        style={{fontSize: big ? 30 : 15, fontWeight: big ? '800' : '400', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
    </View>
  );
}

// ============================ 0.3.146: GUARDADO x DIA A DIA ============================
// ============================ 0.3.159: HISTORICO DA RESERVA ============================
function ReserveHistorySheet({api, reserve, moves, show, onClose, reload, startEdit = null}: {startEdit?: ReserveMove | null; api: SofiaApi; reserve: Goal; moves: ReserveMove[]; show: (v: number) => string; onClose: () => void; reload: () => Promise<void>}) {
  const c = useTheme(), months = useMemo(() => reserveHistory(moves, reserve.id), [moves, reserve.id]);
  // 0.3.162: corrigir ou apagar um movimento errado. O guardado e a conta do mes se ajustam sozinhos,
  // porque sao calculados a partir destes registros.
  const [edit, setEdit] = useState<ReserveMove | null>(null), [amount, setAmount] = useState(''), [date, setDate] = useState(''), [note, setNote] = useState(''), [planned, setPlanned] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function open(m: ReserveMove) { setEdit(m); setAmount(finishMoneyInput(String(m.amount).replace('.', ','))); setDate(m.date); setNote(m.note); setPlanned(m.planned); setError(''); }
  // 0.3.225: aberto pelo "Editar" do aporte do mes -> ja abre no editor desse aporte
  useEffect(() => { if (startEdit) open(startEdit); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!edit) return;
    const v = parseMoney(amount);
    if (!v || v <= 0) { setError('Informe o valor.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Escolha a data.'); return; }
    setBusy(true); setError('');
    try { await api.saveEntity({...edit.entity, data: {...edit.entity.data, amount: v, date, note: note.trim(), planned: edit.direction === 'out' ? planned : false}}); setEdit(null); await reload(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function remove() {
    if (!edit) return;
    const label = reserveMoveLabel(edit).toLowerCase();
    appAlert('Apagar este ' + (edit.direction === 'in' ? 'aporte' : 'movimento') + '?', 'O ' + label + ' de ' + show(edit.amount) + ' sai do histórico e o dinheiro guardado volta ao valor de antes.',
      [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => { setBusy(true); void api.deleteEntity(edit.entity.id).then(async () => { setEdit(null); await reload(); }).catch(e => setError(errorText(e))).finally(() => setBusy(false)); }}]);
  }
  const input = (label: string, value: string, onChange: (v: string) => void, money = false) => <View style={{gap: 6}}>
    <Text style={{color: c.muted, fontSize: 12}}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={v => onChange(money ? formatMoneyInput(v, value) : v)} onBlur={() => { if (money) onChange(finishMoneyInput(value)); }}
      keyboardType={money ? 'decimal-pad' : 'default'} placeholderTextColor={c.muted}
      style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.surface}} />
  </View>;
  if (edit) return <Sheet visible onClose={() => setEdit(null)} label="Fechar edição do movimento">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>{reserveMoveLabel(edit)}</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Ao salvar, o dinheiro guardado e o aporte do mês são recalculados com o novo valor.</Text>
      {error ? <Text style={{color: BAD}}>{error}</Text> : null}
      {input('Valor', amount, setAmount, true)}
      <DateTimeField label="Data" value={date} onChange={v => setDate(v || date)} dateOnly allowClear={false} />
      {input('Observação (opcional)', note, setNote)}
      {edit.direction === 'out' ? <View style={{gap: 8}}>
        <Text style={{color: c.muted, fontSize: 12}}>Essa retirada</Text>
        {([[false, 'Recompor este mês'], [true, 'Retirada planejada']] as const).map(([v, label]) =>
          <Pressable key={label} accessibilityRole="button" accessibilityState={{selected: planned === v}} onPress={() => setPlanned(v)}
            style={{padding: 12, borderRadius: 14, borderWidth: 1, borderColor: planned === v ? c.accent : c.line, backgroundColor: planned === v ? c.accentSoft : 'transparent'}}>
            <Text style={{color: planned === v ? c.accent : c.text, fontWeight: '700', fontSize: 14}}>{label}</Text>
          </Pressable>)}
      </View> : null}
      <Button title="Salvar" loading={busy} onPress={() => void save()} />
      <Pressable accessibilityRole="button" onPress={remove} disabled={busy}><Text style={{color: BAD, fontWeight: '700', textAlign: 'center'}}>Apagar movimento</Text></Pressable>
    </ScrollView>
  </Sheet>;
  return <Sheet visible onClose={onClose} label="Fechar histórico da reserva">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 16, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Histórico da reserva</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{tap('Toque em um movimento para corrigir o valor, a data ou apagá-lo.')}</Text>
      {months.length ? months.map(m => <View key={m.month} style={{gap: 8}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}>
          <Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 15}}>{monthLabel(m.month)}</Text>
          <Text style={{color: m.net >= 0 ? GOOD : BAD, fontWeight: '800', fontSize: 14}}>{m.net >= 0 ? '+' : '−'}{show(Math.abs(m.net))}</Text>
        </View>
        <Text style={{color: c.muted, fontSize: 12}}>Entrou {show(m.in)} · Saiu {show(m.out)}</Text>
        <View style={{backgroundColor: c.input, borderRadius: 16, paddingHorizontal: 14}}>
          {m.items.map((it, i) => <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={'Editar ' + reserveMoveLabel(it) + ' de ' + show(it.amount)} onPress={() => open(it)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
            <View style={{flex: 1, gap: 2}}>
              <Text style={{color: c.text, fontSize: 14, fontWeight: '600'}}>{reserveMoveLabel(it)}</Text>
              <Text style={{color: c.muted, fontSize: 11}}>{it.date.slice(8, 10) + '/' + it.date.slice(5, 7)}{it.note ? ' · ' + it.note : ''}</Text>
            </View>
            <Text style={{color: it.direction === 'in' ? GOOD : BAD, fontWeight: '800', fontSize: 15}}>{it.direction === 'in' ? '+' : '−'}{show(it.amount)}</Text>
            <Text style={{color: c.muted, fontSize: 13}}>›</Text>
          </Pressable>)}
        </View>
      </View>) : <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Ainda não há movimentos. Cada aporte e cada retirada aparece aqui, por mês, com o que entrou e o que saiu.</Text>}
      {Number(reserve.saved) > 0 ? <Text style={{color: c.muted, fontSize: 12}}>Valor inicial informado: {show(Number(reserve.saved))}</Text> : null}
    </ScrollView>
  </Sheet>;
}

function ReserveSheet({api, kind, reserve, split, onClose, onDone, accountId = ''}: {accountId?: string; api: SofiaApi; kind: 'setup' | 'in' | 'out' | 'plan' | 'goal' | 'adjust'; reserve: Goal | null; split: ReturnType<typeof moneySplit> | null; onClose: () => void; onDone: () => Promise<void>}) {
  const c = useTheme();
  // 0.3.188: aportar abre ja com o valor que falta no mes (ex.: R$ 4.000,00); da para trocar na hora
  const [savedNow, setSavedNow] = useState(kind === 'adjust' && split ? finishMoneyInput(String(split.saved).replace('.', ',')) : '');
  const [name, setName] = useState(reserve?.name || 'Dinheiro guardado'), [amount, setAmount] = useState(kind === 'in' && split && split.missing > 0 ? finishMoneyInput(String(split.missing).replace('.', ',')) : ''), [note, setNote] = useState(''),
    [plan, setPlan] = useState(reserve?.entity?.data?.monthly_plan ? finishMoneyInput(String(reserve.entity.data.monthly_plan).replace('.', ',')) : ''),
    [goalValue, setGoalValue] = useState(reserve?.target ? finishMoneyInput(String(reserve.target).replace('.', ',')) : ''),
    [goalMonth, setGoalMonth] = useState(String(reserve?.entity?.data?.deadline || '').slice(0, 10)),
    [day, setDay] = useState(String(reserve?.entity?.data?.plan_day || 5)),
    [remindBefore, setRemindBefore] = useState(String(reserve?.entity?.data?.remind_before_days ?? 0)),
    [remindTime, setRemindTime] = useState(String(reserve?.entity?.data?.remind_time || '09:00')),
    [repeatDays, setRepeatDays] = useState(String(reserve?.entity?.data?.remind_repeat_days ?? 0)),
    [plannedOut, setPlannedOut] = useState(false);
  const goalFields = {target: parseMoney(goalValue) ?? '', deadline: /^\d{4}-\d{2}-\d{2}$/.test(goalMonth) ? goalMonth : ''};
  const planFields = {monthly_plan: parseMoney(plan) ?? 0, plan_day: Math.min(28, Math.max(1, Number(day) || 5)),
    remind_before_days: Math.max(0, Number(remindBefore) || 0), remind_time: remindTime, remind_repeat_days: Math.max(0, Number(repeatDays) || 0)};
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // 0.3.168: o que foi digitado aqui tambem sobrevive a sair do app no meio.
  const reserveForm = {amount, note, plan, day, remindBefore, remindTime, repeatDays, goalValue, goalMonth, name, plannedOut};
  const {draft: reserveDraft, ready: reserveReady, clear: clearReserveDraft} = useFormDraft('reserve:' + kind + ':' + (reserve?.id || 'novo'), reserveForm);
  const reserveRestored = useRef(false);
  useEffect(() => {
    if (!reserveReady || reserveRestored.current || !reserveDraft) return;
    reserveRestored.current = true;
    const d = reserveDraft as Record<string, string | boolean>;
    if (d.amount !== undefined) setAmount(String(d.amount));
    if (d.note !== undefined) setNote(String(d.note));
    if (d.plan !== undefined) setPlan(String(d.plan));
    if (d.day !== undefined) setDay(String(d.day));
    if (d.remindBefore !== undefined) setRemindBefore(String(d.remindBefore));
    if (d.remindTime !== undefined) setRemindTime(String(d.remindTime));
    if (d.repeatDays !== undefined) setRepeatDays(String(d.repeatDays));
    if (d.goalValue !== undefined) setGoalValue(String(d.goalValue));
    if (d.goalMonth !== undefined) setGoalMonth(String(d.goalMonth));
    if (d.name !== undefined) setName(String(d.name));
    if (typeof d.plannedOut === 'boolean') setPlannedOut(d.plannedOut);
  }, [reserveReady, reserveDraft]);
  const title = kind === 'setup' ? 'Separar o dinheiro guardado' : kind === 'in' ? 'Aportar' : kind === 'plan' ? 'Valor dos aportes' : kind === 'goal' ? 'Meta' : kind === 'adjust' ? 'Ajustar valor guardado' : 'Retirar da reserva';
  async function save() {
    setBusy(true); setError('');
    try {
      if (kind === 'setup') {
        const saved = parseMoney(amount) ?? 0, monthly = parseMoney(plan) ?? 0;
        if (saved < 0 || monthly < 0) throw Error('Use valores positivos.');
        await api.saveEntity({kind: 'fin_goal', title: name.trim() || 'Dinheiro guardado', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {role: 'reserve', saved, ...planFields, ...goalFields, monthly_plan: monthly, color: GOOD, account_id: accountId || ''}});
      } else if ((kind === 'plan' || kind === 'goal' || kind === 'adjust') && reserve) {
        let savedBase: Record<string, any> = {};
        if (kind === 'adjust' && split) {
          const want = parseMoney(savedNow);
          if (want === null || !Number.isFinite(want) || want < 0) throw Error('Informe o valor guardado hoje.');
          // guardado = base da meta + movimentos; a base nova faz o total ficar exatamente no valor informado
          const net = Math.round((split.saved - (Number(reserve.saved) || 0)) * 100) / 100;
          if (Math.abs(want - split.saved) >= 0.005) savedBase = {saved: Math.round((want - net) * 100) / 100};
        }
        await api.saveEntity({...reserve.entity, data: {...reserve.entity.data, ...planFields, ...goalFields, ...savedBase}});
      } else if (reserve) {
        const v = parseMoney(amount);
        if (!v || v <= 0) throw Error('Informe o valor.');
        await api.saveEntity({kind: 'fin_reserve_move', title: kind === 'in' ? 'Guardado na reserva' : 'Retirada da reserva', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {goal_id: reserve.id, direction: kind, amount: v, date: todayISO(), note: note.trim(), planned: kind === 'out' ? plannedOut : false}});
      }
      await clearReserveDraft();
      await onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function confirmOut() { appAlert('Retirar da reserva?', 'Esse valor deixa de ser dinheiro guardado e passa para o dia a dia. É uma retirada consciente, registrada no histórico.', [{text: 'Cancelar'}, {text: 'Retirar', style: 'destructive', onPress: () => void save()}]); }
  const input = (label: string, value: string, onChange: (v: string) => void, placeholder = '') => {
    const monetary = /^(Valor|Já guardado|Aporte)/.test(label);
    return <View style={{gap: 6}}>
      <Text style={{color: c.muted, fontSize: 12}}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value}
        onChangeText={v => onChange(monetary ? formatMoneyInput(v, value) : v)}
        onBlur={() => { if (monetary) onChange(finishMoneyInput(value)); }}
        placeholder={placeholder} placeholderTextColor={c.muted} keyboardType={monetary ? 'decimal-pad' : 'default'}
        style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.surface}} />
    </View>;
  };
  const goalEditor = <View style={{gap: 10}}>
    <Text style={{color: c.muted, fontSize: 12}}>Meta (opcional)</Text>
    {input('Quero juntar', goalValue, setGoalValue, 'Ex.: 39.000')}
    <DateTimeField label="Até" value={goalMonth} onChange={setGoalMonth} dateOnly emptyLabel="Escolher data" />
  </View>;
  const planEditor = <View style={{gap: 10}}>
    {input('Todo dia (1 a 28)', day, setDay, '5')}
    <DateTimeField label="Avisar às" value={remindTime} onChange={v => setRemindTime(v || remindTime)} timeOnly allowClear={false} />
    <Text style={{color: c.muted, fontSize: 12}}>Avisar também</Text>
    <Chips value={remindBefore} onChange={setRemindBefore} options={[{value: '0', label: 'No dia'}, {value: '1', label: '1 dia antes'}, {value: '2', label: '2 dias antes'}, {value: '5', label: '5 dias antes'}]} />
    <Chips value={repeatDays} onChange={setRepeatDays} options={[{value: '0', label: 'Não repetir'}, {value: '3', label: 'A cada 3 dias até aportar'}, {value: '7', label: 'A cada 7 dias até aportar'}]} />
  </View>;
  return <Sheet visible onClose={onClose} label={'Fechar ' + title}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>{title}</Text>
      {error ? <Text style={{color: BAD}}>{error}</Text> : null}
      {kind === 'setup' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Informe quanto você tem guardado, esteja onde estiver. Esse valor fica separado: não entra no Saldo, que continua sendo o que você tem para usar. Depois é só registrar cada aporte em “Guardar dinheiro”.</Text>
        {input('Nome', name, setName, 'Dinheiro guardado')}
        {input('Já guardado hoje', amount, setAmount, 'Ex.: 15.000')}
        {input('Aportes de (por mês, opcional)', plan, setPlan, 'Ex.: 4.000')}
        {parseMoney(plan) ? planEditor : null}
        {goalEditor}
      </> : kind === 'adjust' ? <>
        {/* 0.3.228: botao proprio no menu, como o Ajustar saldo - nao mexe no Saldo nem conta como aporte */}
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Corrige o total guardado para o valor de hoje. Não mexe no Saldo e não conta como aporte.</Text>
        {input('Valor guardado hoje', savedNow, setSavedNow, 'Ex.: 19.000')}
      </> : kind === 'goal' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Quanto você quer juntar e até quando. A Sofia mostra se o aporte atual chega lá e quanto por mês fecharia no prazo.</Text>
        {goalEditor}
        {reserve?.target ? <Pressable accessibilityRole="button" onPress={() => { setGoalValue(''); setGoalMonth(''); }}><Text style={{color: BAD, fontSize: 13, fontWeight: '700'}}>Tirar a meta</Text></Pressable> : null}
      </> : kind === 'plan' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>É quanto você pretende guardar por mês, e quando. O saldo só muda quando você registra o aporte em “Guardar dinheiro”. O que faltar não passa para o mês seguinte.</Text>
        {input('Aportes de (por mês)', plan, setPlan, 'Ex.: 4.000')}
        {planEditor}
        {goalEditor}
        {reserve ? <Pressable accessibilityRole="button" onPress={() => { setPlan(''); setRepeatDays('0'); }}><Text style={{color: BAD, fontSize: 13, fontWeight: '700'}}>Parar os aportes</Text></Pressable> : null}
      </> : <>
        {kind === 'in' && split ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Sai do saldo geral ({money(split.daily)}) e passa a ser guardado. Não é despesa nem receita.{split.realized > 0 ? ' Você já guardou ' + money(split.realized) + ' neste mês.' : ''}</Text> : null}
        {kind === 'in' && split && (parseMoney(amount) ?? 0) > split.daily ? <Text style={{color: BAD, fontSize: 12}}>Esse valor é maior que o saldo geral e o deixaria negativo.</Text> : null}
        {kind === 'out' && split ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Hoje guardado: {money(split.saved)}. A retirada devolve o valor ao saldo geral.</Text> : null}
        {input('Valor', amount, setAmount, 'Ex.: 500')}
        {kind === 'out' ? <View style={{gap: 8}}>
          <Text style={{color: c.muted, fontSize: 12}}>Essa retirada</Text>
          {([[false, 'Recompor este mês', 'Soma ao que falta guardar neste mês.'], [true, 'Retirada planejada', 'Sai do guardado e não precisa ser recomposta.']] as const).map(([v, label, hint]) =>
            <Pressable key={label} accessibilityRole="button" accessibilityState={{selected: plannedOut === v}} onPress={() => setPlannedOut(v)}
              style={{padding: 12, borderRadius: 14, borderWidth: 1, borderColor: plannedOut === v ? c.accent : c.line, backgroundColor: plannedOut === v ? c.accentSoft : 'transparent', gap: 2}}>
              <Text style={{color: plannedOut === v ? c.accent : c.text, fontWeight: '700', fontSize: 14}}>{label}</Text>
              <Text style={{color: c.muted, fontSize: 11}}>{hint}</Text>
            </Pressable>)}
        </View> : null}
        {input('Observação (opcional)', note, setNote)}
      </>}
      <Button title={kind === 'out' ? 'Retirar' : 'Salvar'} loading={busy} onPress={() => kind === 'out' ? confirmOut() : void save()} />
    </ScrollView>
  </Sheet>;
}

// ============================ PENDENTES MANUAIS ============================
function PendingTab({d,api,month,accountId,warning,onBill,reload,isPrimary=true,onAporte,onNew,onMonth,side:sideProp,onSide}: {side?:'pagar'|'receber';onSide?:(v:'pagar'|'receber')=>void;onMonth?:(m:string)=>void;onNew:(flow:'expense'|'income')=>void;d:Data;api:SofiaApi;month:string;accountId:string;warning:string;onBill:(t:Tx|'new',scope?:'month'|'series')=>void;reload:()=>Promise<void>;isPrimary?:boolean;onAporte?:()=>void}) {
  // A aba segue o mes escolhido no topo; cada mes mostra so as suas contas (0.3.180)
  const c=useTheme(),today=todayISO();
  // 0.3.221: pagar a fatura paga junto as contas marcadas com o cartao dela
  const settled=useMemo(()=>cardBillSettled(d.cards,d.txs,today),[d,today]);
  const list=useMemo(()=>monthDues(d.txs,accountId,month,today,settled).filter(r=>isScheduled(r.tx)),[d,accountId,month,today,settled]);
  const open=list.filter(row=>!row.paid&&!row.tx?.cardId),total=open.reduce((sum,row)=>sum+row.amount,0),paidCount=list.length-open.length;
  const toPay=open.filter(r=>r.kind!=='receber'),toGet=open.filter(r=>r.kind==='receber');
  const [sideLocal,setSideLocal]=useState<'pagar'|'receber'>('pagar');const side=sideProp??sideLocal,setSide=(v:'pagar'|'receber')=>{setSideLocal(v);onSide?.(v);};
  const sideOpen=side==='pagar'?toPay:toGet;
  const payList=list.filter(r=>r.kind!=='receber'),getList=list.filter(r=>r.kind==='receber');
  // contas do mes seguinte (ex.: o que entra no periodo do salario, mas ja em novembro) - para nada parecer oculto
  const nextMonth=addMonths(month,1),nextList=useMemo(()=>monthDues(d.txs,accountId,nextMonth,today,settled).filter(r=>!r.paid&&isScheduled(r.tx)),[d,accountId,nextMonth,today,settled]);
  const sideList=side==='pagar'?list.filter(r=>r.kind!=='receber'):list.filter(r=>r.kind==='receber');
  const sideNext=nextList.some(r=>side==='receber'?r.kind==='receber':r.kind!=='receber');
  const nextHint=(kind:'pagar'|'receber')=>{const rows=nextList.filter(r=>kind==='receber'?r.kind==='receber':r.kind!=='receber');if(!rows.length||!onMonth)return null;
    return <Pressable accessibilityRole="button" onPress={()=>onMonth(nextMonth)} style={{paddingVertical:6}}><Text style={{color:c.accent,fontSize:12,fontWeight:'700'}}>Em {monthLabel(nextMonth).split(' ')[0].toLowerCase()}: {rows.length} {kind==='receber'?'a receber':'a pagar'} · {money(rows.reduce((s,r)=>s+r.amount,0))} ›</Text></Pressable>;};
  // 0.3.188: o aporte do mes entra junto das contas: amarelo enquanto falta, verde quando feito
  const reserve=reserveFor(d.goals,accountId,isPrimary);
  const aporte=useMemo(()=>reserve?moneySplit(reserve,d.moves||[],d.accounts,d.txs,d.cards,month,today):null,[reserve,d,month,today]);
  // 0.3.161: as pendencias marcadas como "todo mes" sao as contas fixas; aqui elas aparecem juntas,
  // com o total do ciclo, o quanto ja foi pago e quanto representam do que entrou.
  const cycleDay=d.accounts.find(a=>a.id===accountId)?.cycleDay||0;
  // 0.3.185: mesmo periodo da lista de cima (o mes escolhido no topo), para nenhuma conta sumir de uma das duas
  const range=useMemo(()=>({start:dayIn(month,1),end:dayIn(month,daysIn(month)),label:monthLabel(month).split(' ')[0].toLowerCase()}),[month]);
  const fixed=useMemo(()=>fixedSummary(d.txs,accountId,range,'expense',settled),[d,accountId,range,settled]);
  const fixedIn=useMemo(()=>fixedSummary(d.txs,accountId,range,'income'),[d,accountId,range]);
  // 0.3.228: fixas que so comecam depois deste mes tambem aparecem na lista ("comeca em"), fora dos totais
  const upcomingFx=useMemo(()=>fixedUpcoming(d.txs,accountId,range,side==='pagar'?'expense':'income'),[d,accountId,range,side]);

  const prevShare=useMemo(()=>{const out:number[]=[];for(let i=1;i<=3;i++){const m=addMonths(month,-i);const f=fixedSummary(d.txs,accountId,{start:dayIn(m,1),end:dayIn(m,daysIn(m))});if(f.share!==null)out.push(f.share);}return out.length?out.reduce((a,b)=>a+b,0)/out.length:null;},[d,accountId,month]);
  const fx=side==='pagar'?fixed:fixedIn;
  return <>
    <FixedDupCard d={d} api={api} reload={reload} />
    <Card_>
      {/* 0.3.197: A pagar e A receber no mesmo esquema, separados por um seletor */}
      <Segmented value={side} onChange={setSide} options={[{value: 'pagar' as const, label: 'A pagar'}, {value: 'receber' as const, label: 'A receber'}]} />
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
        <View style={{flex:1,gap:4}}>
          <Text style={{fontSize:17,fontWeight:'800',color:c.text}}>{side==='pagar'?'Contas a pagar':'Contas a receber'}</Text>
          <Text style={{fontSize:12,color:c.muted}}>{sideOpen.length} em aberto em {monthLabel(month).split(' ')[0].toLowerCase()} · {money(sideOpen.reduce((s,r)=>s+r.amount,0))}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={side==='pagar'?'Nova conta a pagar':'Nova conta a receber'} onPress={()=>onNew(side==='pagar'?'expense':'income')} style={{backgroundColor:c.accent,paddingHorizontal:13,paddingVertical:11,borderRadius:12}}>
          <Text style={{color:c.onAccent,fontSize:13,fontWeight:'800'}}>＋ Nova</Text>
        </Pressable>
      </View>
      {warning ? <Text style={{fontSize:12,color:WARN}}>{warning}</Text> : null}
    </Card_>
    {fx.bills.length||upcomingFx.length ? <Card_>
      <Title text={side==='pagar'?'Contas fixas':'Receitas fixas'} />
      <Text style={{fontSize:12,color:c.muted,lineHeight:18}}>{side==='pagar'?'As contas marcadas como “Todo mês”':'As receitas marcadas como “Todo mês” (ex.: salário)'}, em {range.label}.</Text>
      {/* 0.3.192: tocar numa conta fixa abre a edicao dela (nome, valor, dia, parcelas, avisos) - vale para todos os meses */}
      {fx.bills.map(b=>{const original=d.txs.find(t=>!t.virtual&&t.id===(b.tx.seriesId||b.tx.id))||(!b.tx.virtual?b.tx:null);
        return <Pressable key={b.id+b.date} accessibilityRole="button" accessibilityLabel={'Editar '+b.title} disabled={!original} onPress={()=>original&&onBill(original,'series')} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,borderTopWidth:1,borderColor:c.line,opacity:pressed?0.6:1})}>
        <View style={{flex:1,gap:2}}>
          <Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{b.title}</Text>
          <Text style={{color:c.muted,fontSize:11}}>dia {b.day}{b.cardId?' · 💳 '+(d.cards.find(x=>x.id===b.cardId)?.name||'cartão')+(b.paid?' · paga com a fatura':' · na fatura'):' · '+(side==='pagar'?(b.paid?'paga':'a pagar'):(b.paid?'recebida':'a receber'))}{b.installments?' · parcela '+b.index+' de '+b.installments+(b.left?' · faltam '+b.left:' · última'):''}</Text>
        </View>
        <Text style={{color:b.paid?c.muted:c.text,fontWeight:'700',fontSize:14,textDecorationLine:b.paid?'line-through':'none'}}>{money(b.amount)}</Text>
        {original?<Text style={{color:c.muted,fontSize:16}}>›</Text>:null}
      </Pressable>;})}
      {/* 0.3.230: a fixa que comeca depois aparece igual as outras (sem botao); so diz de quando e */}
      {upcomingFx.map(t=>{const n=Math.round(Number(t.entity?.data?.installments)||0),from=monthLabel(monthOf(t.date)).split(' ')[0].toLowerCase(),to=n>1?monthLabel(addMonths(monthOf(t.date),n-Math.max(1,Math.round(Number(t.entity?.data?.installment)||1)))).split(' ')[0].toLowerCase():'';
        return <Pressable key={'u'+t.id} accessibilityRole="button" accessibilityLabel={'Editar '+t.desc} onPress={()=>onBill(t,'series')} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12,borderTopWidth:1,borderColor:c.line,opacity:pressed?0.7:1})}>
        <View style={{flex:1,gap:2}}>
          <Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{t.desc}</Text>
          <Text style={{color:c.muted,fontSize:11}}>dia {Number(t.date.slice(8,10))} · {side==='pagar'?'a pagar':'a receber'} · {to?'de '+from+' a '+to:'a partir de '+from}</Text>
        </View>
        <Text style={{color:c.text,fontWeight:'700',fontSize:14}}>{money(t.amount)}</Text>
        <Text style={{color:c.muted,fontSize:16}}>›</Text>
      </Pressable>;})}
      <Text style={{color:c.muted,fontSize:11}}>{tap('Toque numa conta para mudar nome, valor, dia, parcelas ou avisos. Vale para todos os meses.')}</Text>
      <View style={{borderTopWidth:1,borderColor:c.line,paddingTop:12,gap:6}}>
        <View style={{flexDirection:'row'}}><Text style={{flex:1,color:c.text,fontWeight:'700'}}>Total do mês</Text><Text style={{color:c.text,fontWeight:'800'}}>{money(fx.total)}</Text></View>
        <View style={{flexDirection:'row'}}><Text style={{flex:1,color:c.muted,fontSize:12}}>{side==='pagar'?'Pagas':'Recebidas'}</Text><Text style={{color:c.muted,fontSize:12}}>{money(fx.paid)}{fx.card?' · no cartão '+money(fx.card):''} · faltam {money(fx.open)}</Text></View>
        {side==='pagar'&&fx.share!==null?<Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Suas fixas são {Math.round(fx.share*100)}% do que entrou em {range.label} ({money(fx.income)}){prevShare!==null?`, contra ${Math.round(prevShare*100)}% na média dos meses anteriores`:''}.</Text>
          :side==='pagar'?<Text style={{color:c.muted,fontSize:12}}>Ainda não há receitas registradas em {range.label} para calcular a proporção.</Text>:null}
      </View>
    </Card_> : null}
    <Card_>
      <Title text={month===monthOf(today)?'A vencer e atrasadas':'Pendentes de '+monthLabel(month).split(' ')[0].toLowerCase()} />
      {/* 0.3.226: o aporte do mes nao aparece mais aqui (fica no guardado e no + do Resumo) */}
      {sideList.length || sideNext ? <>
        {sideList.length?sideList.map(due=><DueRow key={due.id} due={due} d={d} api={api} reload={reload} onTx={t=>onBill(t as Tx,'month')} />):<Text style={{color:c.muted,fontSize:12}}>{side==='pagar'?'Nada a pagar neste mês.':'Nada a receber neste mês.'}</Text>}
        {nextHint(side)}
      </>
        : <Text style={{color:c.muted,fontSize:13,lineHeight:20}}>{month===monthOf(today)?'Nada a pagar ou receber neste mês.':'Nada pendente em '+monthLabel(month).split(' ')[0].toLowerCase()+'.'} Para ver outro mês, troque o mês no topo.</Text>}
      <Text style={{fontSize:11,color:c.muted}}>Os avisos locais saem às 9h do vencimento (e, se você escolher, alguns dias antes), com a permissão de notificações do Android. Confirmar o pagamento ou o recebimento tira o item dos pendentes e o inclui no extrato.</Text>
    </Card_>
  </>;
}
function BillEditor({api,tx,accountId,onClose,onSaved,onOptimistic,scope='series',initialFlow='expense',hasReserve=false,finance,initialCard=''}:{onOptimistic?:(t:Tx,replaceId:string|null)=>void;initialCard?:string;finance?:Data;hasReserve?:boolean;api:SofiaApi;tx:Tx|null;accountId:string;onClose:()=>void;onSaved:(saved?:{id:string;kind:string;date:string;title:string})=>void;scope?:'month'|'series';initialFlow?:'expense'|'income'}) {
  const c=useTheme(),existing=!!tx?.entity&&!tx?.virtual;
  // 0.3.193: aberta por "A vencer e atrasadas", a edicao de uma conta que se repete vale SO para aquele mes;
  // por "Contas fixas", vale para todos os meses.
  const recurring=!!tx&&(tx.virtual||tx.recurrence==='monthly'||!!tx.seriesId);
  const monthOnly=scope==='month'&&recurring;
  const isTemplate=!!tx&&!tx.virtual&&tx.recurrence==='monthly'&&!tx.seriesId;
  const [name,setName]=useState(tx?.desc||''),[amount,setAmount]=useState(tx?.amount?finishMoneyInput(String(tx.amount).replace('.',',')):'');
  const [date,setDate]=useState(tx?.date||todayISO()),[category,setCategory]=useState(tx?.category||'Contas');
  const [repeat,setRepeat]=useState(tx?.recurrence==='monthly'?'monthly':'none');
  // 0.3.216: receita que se repete (salario, aluguel) pode mandar uma parte para o guardado todo mes
  const [toReserve,setToReserve]=useState(tx?.reservePart?finishMoneyInput(String(tx.reservePart).replace('.',',')):'');
  const [time,setTime]=useState(tx?.time||'');
  const [note,setNote]=useState(String(tx?.entity?.content||''));
  // 0.3.223: pagar com a conta ou com um cartao (a do cartao entra na fatura e nao sai do saldo direto)
  const cardsList=(finance?.cards||[]).filter(k=>!k.archived),[payCard,setPayCard]=useState(tx?.cardId||initialCard||'');
  // 0.3.151: tambem contas a receber, e aviso alguns dias antes (alem do aviso no dia)
  const [flow,setFlow]=useState<'expense'|'income'>(tx?tx.kind==='income'?'income':'expense':initialFlow),[before,setBefore]=useState(String(tx?.remindDays||0));
  // 0.3.165: conta fixa com prazo (ex.: 10 parcelas) - para de se repetir sozinha no fim
  const [parcels,setParcels]=useState(String(tx?.entity?.data?.installments||''));
  const [parcelNow,setParcelNow]=useState(String(tx?.entity?.data?.installment||''));
  // 0.3.168: se o app for para o fundo (ou for encerrado) no meio do preenchimento, nada se perde.
  // 0.3.196: rascunho separado para A pagar e A receber; antes um rascunho antigo podia trocar o tipo escolhido
  const draftKey='bill:'+(tx?.id||'novo:'+initialFlow);
  const form={name,amount,date,category,repeat,flow,before,parcels,parcelNow,payCard};
  const {draft,ready,clear:clearDraft}=useFormDraft(draftKey,form);
  const restored=useRef(false);
  useEffect(()=>{
    if(!ready||restored.current||!draft)return;
    restored.current=true;
    if(draft.name!==undefined)setName(String(draft.name));
    if(draft.amount!==undefined)setAmount(String(draft.amount));
    if(draft.category)setCategory(String(draft.category));
    if(draft.date)setDate(String(draft.date));
    if(draft.repeat)setRepeat(String(draft.repeat) as typeof repeat);
    if(draft.before!==undefined)setBefore(String(draft.before));
    if(draft.parcels!==undefined)setParcels(String(draft.parcels));
    if(draft.parcelNow!==undefined)setParcelNow(String(draft.parcelNow));
    if(typeof draft.payCard==='string'&&cardsList.some(k=>k.id===draft.payCard||draft.payCard===''))setPayCard(draft.payCard);
  },[ready,draft]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function save() {
    const value=parseMoney(amount);
    if(!name.trim()){setError(flow==='income'?'Informe o que você vai receber.':'Informe qual conta ou dívida precisa pagar.');return;}
    if(!value||value<=0){setError(flow==='income'?'Informe o valor a receber.':'Informe o valor a pagar.');return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))){setError('Selecione uma data de vencimento válida.');return;}
    if(!accountId){setError('Selecione uma conta financeira primeiro.');return;}
    if(repeat!=='monthly'&&!(tx&&(tx.virtual||tx.seriesId||tx.recurrence==='monthly'))&&isClosedMonth(monthOf(date))){setError(CLOSED_MSG);return;}
    const reserveAmt=flow==='income'&&hasReserve?(parseMoney(toReserve)||0):0;
    const cardFor=flow==='expense'?payCard:'';
    if(reserveAmt>value){setError('O valor para o guardado passa do valor da receita.');return;}
    setBusy(true);setError('');
    try{
      // 0.3.192: conta fixa ja existente - a data escolhida define o novo DIA; o mes de inicio continua o mesmo
      // (assim o historico dos meses ja pagos nao se move)
      // So este mes, sendo o registro original da conta fixa: ele vira o registro daquele mes e a conta fixa
      // continua a partir do mes seguinte, com o valor de antes (nada muda nos outros meses).
      if(monthOnly&&isTemplate&&tx?.entity){
        const old=tx.entity.data||{},nextDate=addMonths(monthOf(tx.date),1)+'-'+String(Math.min(Number(tx.date.slice(8,10)),daysIn(addMonths(monthOf(tx.date),1)))).padStart(2,'0');
        const total=Number(old.installments)||0,at=Number(old.installment)||1;
        const continues=!total||at<total;
        let nextId='';
        if(continues){const next=await api.saveEntity({kind:'fin_tx',title:tx.desc,content:'',area:tx.entity.area||'Pessoal',privacy:'private',state:'active',tags:[],
          data:{...old,date:nextDate,paid:false,recurrence:'monthly',series_id:'',installment:total?at+1:'',import_id:'sofia-pendencia:'+uid()}});nextId=next.id;}
        // 0.3.223: este caminho tambem grava o cartao, o horario e a descricao (antes so gravava na segunda vez)
        const cardMonth=flow==='expense'?payCard:'';
        await api.saveEntity({...tx.entity,title:name.trim(),content:note.trim(),data:{...old,kind:flow,amount:value,date,category,remind_days:Number(before)||0,recurrence:'none',series_id:nextId,installments:'',installment:'',recurrence_end:'',card_id:cardMonth,invoice_month:'',paid:cardMonth?false:!!old.paid,time:time||''}});
        await clearDraft();onSaved();return;
      }
      if(cardFor&&existing&&tx&&!tx.virtual&&!tx.cardId&&tx.paid&&tx.recurrence==='monthly'&&!tx.seriesId&&tx.entity){
        await startSeriesNextMonth(api,tx,{card_id:cardFor,invoice_month:'',amount:value,category,remind_days:Number(before)||0,time:time||''},name.trim());
        await clearDraft();onSaved();return;
      }
      const isSeries=!!tx&&!tx.virtual&&tx.recurrence==='monthly'&&!tx.seriesId&&repeat==='monthly';
      const finalDate=isSeries&&tx?String(tx.entity?.data?.date||tx.date).slice(0,7)+'-'+String(Math.min(Number(date.slice(8,10)),daysIn(String(tx.entity?.data?.date||tx.date).slice(0,7)))).padStart(2,'0'):date;
      const data={
        kind:flow,amount:value,date:finalDate,category,account_id:tx?.accountId||accountId,remind_days:Number(before)||0,
        installments:!monthOnly&&repeat==='monthly'&&Number(parcels)>1?Math.min(360,Math.round(Number(parcels))):'',
        installment:!monthOnly&&repeat==='monthly'&&Number(parcels)>1?Math.min(Math.round(Number(parcels)),Math.max(1,Math.round(Number(parcelNow))||1)):'',
        recurrence_end:!monthOnly&&repeat==='monthly'&&Number(parcels)>1?addMonths(monthOf(finalDate),Math.round(Number(parcels))-Math.max(1,Math.round(Number(parcelNow))||1)):'',
        paid:cardFor?false:existing?!!tx?.paid:false,card_id:cardFor,invoice_month:'',to_account_id:'',
        recurrence:tx?.virtual||monthOnly?'none':repeat,
        series_id:tx?.seriesId||'',
        reserve_part:reserveAmt>0?reserveAmt:'',
        time:time||'',
        __content:note.trim(),
        import_id:existing?String(tx?.entity?.data?.import_id||''): 'sofia-pendencia:'+uid(),
      };
      // 0.3.226: editar ou criar conta/receita em Contas muda a tela e os totais NA HORA e fecha; a gravacao segue
      // por tras (antes esperava o servidor e recarregava Financas inteira). Se falhar, avisa e volta ao que esta salvo.
      if(onOptimistic){
        const baseEntity:any=existing&&tx?.entity?tx.entity:{id:'local:'+uid(),kind:'fin_tx',area:'Pessoal',privacy:'private',state:'active',tags:[]};
        const local=toTx({...baseEntity,title:name.trim(),content:note.trim(),data:{...(baseEntity.data||{}),...data}} as Entity);
        onOptimistic(local,existing&&tx?.entity?tx.entity.id:null);
        void (async()=>{
          try{
            let saved=await saveEntity(api,'fin_tx',name.trim(),data,existing?tx?.entity:undefined);
            if(String(saved?.data?.card_id||'')!==String(cardFor||''))saved=await api.saveEntity({...saved,data:{...saved.data,card_id:cardFor,invoice_month:'',paid:cardFor?false:saved.data?.paid}});
            if(flow==='income'&&finance){const g=reserveOf(finance.goals);if(g)await syncIncomeReserve(api,finance,saved.id,g.id,reserveAmt,!!data.paid,finalDate,name.trim());}
            await clearDraft();
          }catch(e){appAlert('Não consegui salvar',errorText(e)+' Os valores voltaram ao que está salvo.');}
          onSaved();
        })();
        return;
      }
      let saved=await saveEntity(api,'fin_tx',name.trim(),data,existing?tx?.entity:undefined);
      // 0.3.222: confere que o cartao ficou gravado (antes, as vezes era preciso salvar duas vezes para o cartao pegar)
      if(String(saved?.data?.card_id||'')!==String(cardFor||'')){saved=await api.saveEntity({...saved,data:{...saved.data,card_id:cardFor,invoice_month:'',paid:cardFor?false:saved.data?.paid}});
        if(String(saved?.data?.card_id||'')!==String(cardFor||''))throw new Error('O cartão não foi gravado. Tente salvar de novo.');}
      // receita ja recebida: o aporte ligado a ela acompanha a nova parte do guardado
      if(flow==='income'&&finance){const g=reserveOf(finance.goals);if(g)await syncIncomeReserve(api,finance,saved.id,g.id,reserveAmt,!!data.paid,finalDate,name.trim());}
      await clearDraft();
      onSaved({id:saved.id,kind:flow,date:finalDate,title:name.trim()});
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  function erase() {
    if(!tx?.entity||tx.virtual)return;
    appAlert('Excluir vencimento?', 'Esse cadastro será apagado. Lançamentos já pagos de meses anteriores não serão excluídos.' + (flow === 'income' && tx?.paid && (tx?.reservePart || 0) > 0 ? ' O aporte de ' + money(tx?.reservePart || 0) + ' que foi para o guardado neste recebimento também é apagado.' : ''), [
      {text:'Cancelar',style:'cancel'},
      {text:'Excluir',style:'destructive',onPress:()=>{setBusy(true);void api.deleteEntity(tx.entity!.id).then(()=>onSaved()).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}
    ]);
  }
  return <Sheet visible onClose={() => { void clearDraft(); onClose(); }} label="Fechar cadastro de vencimento">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:13,paddingBottom:24}}>
      <Text style={{fontSize:20,fontWeight:'800',color:c.text}}>{monthOnly?'Editar só '+monthLabel(monthOf(tx!.date)).split(' ')[0].toLowerCase():existing?'Editar vencimento':'Novo vencimento'}</Text>
      <Text style={{fontSize:13,lineHeight:19,color:c.muted}}>Este registro só afeta o saldo depois que você confirmar o pagamento. Não vem automaticamente do extrato bancário.</Text>
      <Chips value={flow} onChange={setFlow} options={[{value:'expense',label:'A pagar'},{value:'income',label:'A receber'}]}/>
      <Field label={flow==='income'?'Conta a receber':'Conta a pagar'} value={name} onChange={setName} placeholder={flow==='income'?'Ex.: Freela, aluguel recebido, reembolso':'Ex.: Boleto de energia, dívida, aluguel'} />
      <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>Descrição (opcional)</Text><TextInput accessibilityLabel="Descrição" value={note} onChangeText={setNote} placeholder="Uma observação breve" placeholderTextColor={c.muted} multiline maxLength={280} style={{minHeight: 44, maxHeight: 88, color: c.text, backgroundColor: c.input, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top'}} /></View>
      <Field label="Valor (R$)" value={amount} onChange={setAmount} numeric placeholder="0,00" />
      <DateTimeField label={tx&&!tx.virtual&&tx.recurrence==='monthly'&&!tx.seriesId?'Vencimento (o dia vale para todos os meses)':'Vencimento'} value={date} onChange={v=>v&&setDate(v)} dateOnly allowClear={false} />
      <DateTimeField label="Horário (opcional)" value={time} onChange={v=>setTime(v?String(v).slice(0,5):'')} timeOnly emptyLabel="Sem horário" />
      <Text style={{color:c.muted,fontSize:12}}>Categoria</Text>
      <Chips scroll value={category} onChange={setCategory} options={['Contas','Moradia','Saúde','Impostos','Outros'].map(x=>({value:x,label:x}))}/>
      {monthOnly?null:<Text style={{color:c.muted,fontSize:12}}>Repetição</Text>}
      {monthOnly?<Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Esta alteração vale só para {monthLabel(monthOf(tx!.date)).split(' ')[0].toLowerCase()}. Para mudar todos os meses, edite a conta em Contas fixas.</Text>:<>
      <Chips value={repeat} onChange={setRepeat} options={[{value:'none',label:'Só esta vez'},{value:'monthly',label:'Todo mês'}]}/>
      {repeat==='monthly'?<>
        <View style={{flexDirection:'row',gap:10}}>
          <View style={{flex:1}}><Field label="Parcelas (opcional)" value={parcels} onChange={setParcels} numeric placeholder="Ex.: 10" /></View>
          {Number(parcels)>1?<View style={{flex:1}}><Field label="Esta é a parcela nº" value={parcelNow} onChange={setParcelNow} numeric placeholder="1" /></View>:null}
        </View>
        <Text style={{color:c.muted,fontSize:11,lineHeight:16}}>{Number(parcels)>1?'Acaba sozinha na '+Math.round(Number(parcels))+'ª parcela, em '+monthLabel(addMonths(monthOf(date),Math.round(Number(parcels))-Math.max(1,Math.round(Number(parcelNow))||1)))+'. A Sofia avisa quando terminar.':'Em branco, se repete todo mês sem prazo. Já tem parcelas pagas? Informe o total e em qual você está.'}</Text>
      </>:null}
      </>}
      {flow==='income'&&hasReserve?<View style={{gap:6}}>
        <Text style={{fontSize:12,color:c.muted}}>Desta receita, quanto vai para o guardado{repeat==='monthly'?' todo mês':''}? (R$)</Text>
        <TextInput accessibilityLabel="Quanto vai para o guardado todo mês" value={toReserve} onChangeText={v=>setToReserve(old=>formatMoneyInput(v,old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted} style={{fontSize:16,color:c.text,borderWidth:1,borderColor:c.line,borderRadius:12,padding:12,backgroundColor:c.input}} />
        <Text style={{fontSize:11,color:c.muted,lineHeight:16}}>{tap('O resto fica no saldo. Ao tocar em Recebi, esse valor vai sozinho para o guardado; para mudar, é só editar aqui.')}</Text>
      </View>:null}
      {flow==='expense'&&cardsList.length?<View style={{gap:6}}>
        <Text style={{fontSize:12,color:c.muted}}>Feita no cartão</Text>
        <Chips value={payCard} onChange={setPayCard} options={[{value:'',label:'Não'},...cardsList.map(k=>({value:k.id,label:'💳 '+k.name}))]}/>
        {payCard?<Text style={{fontSize:11,color:c.muted,lineHeight:16}}>Fica marcada com 💳 e entra na fatura do {cardsList.find(k=>k.id===payCard)?.name||'cartão'}{repeat==='monthly'?' todo mês':(()=>{const k=cardsList.find(x=>x.id===payCard);return k&&/^\d{4}-\d{2}-\d{2}$/.test(date)?' de '+monthLabel(monthOf(date)).split(' ')[0].toLowerCase():'';})()}.{tx&&!tx.cardId&&tx.paid&&tx.recurrence==='monthly'?' Este mês já está pago; a marcação vale a partir do mês que vem.':''}</Text>:null}
      </View>:null}
      <Text style={{color:c.muted,fontSize:12}}>Avisar</Text>
      <Chips value={before} onChange={setBefore} options={[{value:'0',label:'No dia'},{value:'1',label:'1 dia antes'},{value:'3',label:'3 dias antes'},{value:'7',label:'7 dias antes'}]}/>
      <Text style={{color:c.muted,fontSize:11}}>{before==='0'?'Aviso às '+(time||'9h')+' do dia do vencimento.':'Aviso às '+(time||'9h')+', '+before+(before==='1'?' dia':' dias')+' antes e de novo no dia.'}</Text>
      {tx?.virtual?<Text style={{color:c.muted,fontSize:12}}>Esta ocorrência pertence a uma série mensal. Editá-la cria uma exceção, preservando a série.</Text>:null}
      {error?<Text style={{color:BAD,fontSize:13}}>{error}</Text>:null}
      <Button title={flow==='income'?'Salvar recebimento':'Salvar vencimento'} loading={busy} onPress={()=>void save()} />
      {existing?<Pressable accessibilityRole="button" accessibilityLabel="Excluir vencimento" onPress={erase} style={{alignItems:'center',paddingVertical:12}}>
        <Text style={{color:BAD,fontWeight:'700'}}>Excluir vencimento</Text></Pressable>:null}
    </ScrollView>
  </Sheet>;
}

// ============================ RESUMO ============================
/** 0.3.159: a reserva da conta principal programa os lembretes do aporte. */
function planReminder(d: Data, today: string) {
  const reserve = reserveOf(d.goals);
  if (!reserve || !(Number(reserve.entity?.data?.monthly_plan) > 0)) return undefined;
  return {split: moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, monthOf(today), today), title: reserve.name};
}

function HomeTab({d, month, api, reload, onTx, onTab, accountId, isPrimary, onBill, aporteKey = 0, fresh = true, failed = false, onPatchTx, onRemoveTx}: {onPatchTx?: (id: string, ch: Partial<Tx>) => void; onRemoveTx?: (id: string) => void; failed?: boolean; fresh?: boolean; aporteKey?: number; d: Data; month: string; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onTab: (t: Tab) => void; accountId: string; isPrimary: boolean; onBill: (t?: Tx) => void}) {
  const desktop = useDesktop(); // 0.3.252 (computador)
  const c = useTheme(), today = todayISO();
  // Contas pesadas só quando os dados ou o mês mudam (não a cada toque, como esconder valores).
  const {s, total: accountsTotal, forecast: accountsForecast, dues} = useMemo(() => ({s: monthSummary(d.txs, month), total: totalBalance(d.accounts, d.txs), forecast: forecastBalance(d.accounts, d.txs, month, d.cards),
    dues: manualDues(d.txs, accountId, today, 3)}), [d, accountId, month, today]);
  const [aporteEdit, setAporteEdit] = useState<ReserveMove | null>(null);
  // 0.3.255: o olho fica do jeito que a pessoa deixou (o mesmo do Inicio)
  const [hide, setHideValue] = useValuesHidden(api), setHide = (f: (h: boolean) => boolean) => setHideValue(f(hide));
  const [reserveSheet, setReserveSheet] = useState<'setup' | 'in' | 'out' | 'plan' | 'goal' | 'adjust' | null>(null), [reserveHistoryOpen, setReserveHistoryOpen] = useState(false);
  const show = (v: number) => hide ? 'R$ •••••' : money(v);
  // 0.3.151: cada conta tem o proprio guardado (a principal mantem a reserva antiga, sem conta).
  const reserve = reserveFor(d.goals, accountId, isPrimary);
  const split = useMemo(() => reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs,accountId,today,45)) : null, [reserve, d, accountId, month, today]);
  // 0.3.154: o guardado e independente das contas. O Saldo geral e o que voce tem para usar: so os
  // movimentos de guardar/retirar passam dinheiro entre os dois (o valor inicial nao e descontado).
  const badge = split ? reserveBadge(split, today, money) : '';
  const outlook = useMemo(() => reserve && split ? reserveOutlook(reserve, split.saved, split.planned, today) : null, [reserve, split, today]);
  // 0.3.161: ciclo do dinheiro (comeca no dia em que a pessoa recebe) e a folga dele
  // 0.3.195: cada pessoa no seu ciclo (dia informado na conta ou, se nao houver, o dia do salario fixo)
  const cycleDay = useMemo(() => effectiveCycleDay(d.accounts, d.txs, accountId), [d, accountId]);
  const plan = split?.planned || 0;
  const net = split ? split.net : 0, total = Math.round((accountsTotal - net) * 100) / 100, forecast = Math.round((accountsForecast - net) * 100) / 100;
  // 0.3.208: sobra = Saldo + o que ainda entra - contas que faltam - fatura em aberto - aporte que falta.
  // Controle de gastos: a sobra do periodo atual (100% = sobra + gastos livres ja feitos). Previsto: a sobra ate o fim
  // do periodo do salario (na ultima semana antes do salario, ate o fim do proximo periodo).
  const aportePendingIn = useCallback((range: {start: string; end: string}) => {
    const planDay = split?.planDay || 0, months: string[] = [];
    for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
    const due = planDay ? months.filter(m => { const dt = dayIn(m, Math.min(planDay, daysIn(m))); return dt >= range.start && dt <= range.end; }).length * plan : 0;
    const done = reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((t, m) => t + m.amount, 0) : 0;
    return Math.max(0, due - done);
  }, [split?.planDay, plan, reserve, d]);
  const monthRange = useMemo(() => ({start: dayIn(month, 1), end: dayIn(month, daysIn(month))}), [month]);
  const cycleNow = useMemo(() => moneyLeft(d.txs, d.cards, monthRange, accountId, total, aportePendingIn(monthRange), today), [d, monthRange, accountId, total, aportePendingIn, today]);
  // 0.3.214: Controle de gastos = quanto tinha no inicio do mes (o informado em "Ajustar saldo") x quanto tem agora (o Saldo)
  const manualStart = useMemo(() => { const accs = accountId ? d.accounts.filter(a => a.id === accountId) : d.accounts.filter(a => a.include && !a.archived);
    return accs.length && accs.every(a => typeof a.monthStarts[month] === 'number') ? accs.reduce((t, a) => t + a.monthStarts[month], 0) : null; }, [d, accountId, month]);
  // mes que ja passou: o "agora" e o saldo do ultimo dia daquele mes (nao o de hoje)
  const controlSaldo = useMemo(() => month < monthOf(today) ? balanceAsOf(d.accounts.filter(a => a.include && !a.archived && (!accountId || a.id === accountId)), d.txs, d.moves || [], reserve?.id || '', dayIn(month, daysIn(month))) : total, [d, reserve, month, accountId, total, today]);
  const spend = useMemo(() => monthControl(d.txs, d.moves || [], reserve?.id || '', month, accountId, controlSaldo, manualStart), [d, reserve, month, accountId, controlSaldo, manualStart]);
  // 0.3.224: Previsto ate a VESPERA DO PROXIMO SALARIO (o ponto mais baixo do ciclo, para quem recebe em qualquer dia);
  // nos 5 dias antes do pagamento ele ja mostra o ciclo seguinte. Sem dia de salario informado, o ciclo e o mes.
  // Conta: saldo de agora + receitas programadas ate la - despesas programadas - fatura - aporte.
  // 0.3.225: Previsto = o que SOBRA do ciclo depois de tudo pago (regra do Pedro, 23/10): salario + outras receitas do
  // ciclo (avulsas ou programadas, recebidas ou nao) - todas as despesas do ciclo (avulsas ou programadas, pagas ou nao)
  // - faturas do cartao que vencem no ciclo (pagas ou nao) - aporte do ciclo (contado como feito). NAO usa o Saldo:
  // pagar uma conta nao muda o previsto. Ciclo = do dia do salario ate a vespera do proximo; nos 5 dias antes do
  // pagamento ja mostra o ciclo seguinte. Sem dia de salario informado, o ciclo e o mes.
  const aporteInCycle = useCallback((range: {start: string; end: string}) => {
    const planDay = split?.planDay || 0, months: string[] = [];
    for (let m = monthOf(range.start); m <= monthOf(range.end); m = addMonths(m, 1)) months.push(m);
    const due = planDay ? months.filter(m => { const dt = dayIn(m, Math.min(planDay, daysIn(m))); return dt >= range.start && dt <= range.end; }).length * plan : 0;
    const done = reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && m.date >= range.start && m.date <= range.end).reduce((t, m) => t + m.amount, 0) : 0;
    return Math.round(Math.max(due, done) * 100) / 100;
  }, [split?.planDay, plan, reserve, d]);
  // 0.3.255: Controle de gastos comeca no dia do salario (ver cycleControl). Mes passado: o ciclo que contem o fim dele.
  const controlRange = useMemo(() => cycleRange(cycleDay, month === monthOf(today) ? today : month < monthOf(today) ? dayIn(month, daysIn(month)) : dayIn(month, 1)), [cycleDay, month, today]);
  const ctrl = useMemo(() => {
    const before = addDays(controlRange.start, -1);
    const startSaldo = balanceAsOf(d.accounts.filter(a => a.include && !a.archived && (!accountId || a.id === accountId)), d.txs, d.moves || [], reserve?.id || '', before);
    return cycleControl(d.txs, d.cards, controlRange, accountId, startSaldo, aporteInCycle(controlRange), today);
  }, [d, controlRange, accountId, reserve, today, aporteInCycle]);
  const forecastP = useMemo(() => {
    const ref = month === monthOf(today) ? today : dayIn(month, 1), cur = cycleRange(cycleDay, ref), nextPay = addDays(cur.end, 1);
    const daysLeft = Math.round((Date.parse(nextPay + 'T12:00:00Z') - Date.parse(ref + 'T12:00:00Z')) / 864e5), upcoming = daysLeft <= 5;
    const r = upcoming ? cycleRange(cycleDay, nextPay) : cur;
    const f = simpleForecast(d.txs, d.cards, r, accountId, today, aporteInCycle(r));
    return {start: r.start, end: r.end, income: f.income, toPay: f.expense, card: f.card, aporte: f.aporte, left: f.left,
      incomeItems: f.incomeItems, expenseItems: f.expenseItems, upcoming, shownStart: r.start};
  }, [d, month, cycleDay, accountId, aporteInCycle, today]);
  const monthAporte = useMemo(() => reserve ? (d.moves || []).filter(m => m.goalId === reserve.id && m.direction === 'in' && m.entity?.state !== 'archived' && monthOf(m.date) === month).sort((a, b) => b.date.localeCompare(a.date))[0] || null : null, [d, reserve, month]);
  const forecastEnd = forecastP.end.slice(8, 10) + '/' + forecastP.end.slice(5, 7), paydayKnown = cycleDay > 1;
  // 0.3.225: mes que ainda nao chegou fica zerado no Resumo - so passa a contar quando o mes chegar
  const future = month > monthOf(today);
  const catAlerts = useMemo(() => categoryAlerts(d.txs, accountId, month), [d, accountId, month]);
  // 0.3.208: lancamento repetido (mesmo nome, valor e mes) - avisa e deixa apagar os extras
  const [dupOk, setDupOk] = useState<string[]>([]), [dupOpen, setDupOpen] = useState<string | null>(null), [dupBusy, setDupBusy] = useState('');
  // so um codigo (sem nome nem valor), no armazenamento seguro
  const dupCode = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  useEffect(() => { SecureStore.getItemAsync('sofia_fin_dupok_v1').then(v => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setDupOk(a.map(String)); } catch { /* nenhum */ } }).catch(() => {}); }, []);
  const dups = useMemo(() => duplicateGroups(d.txs).filter(g => g.month === month && !dupOk.includes(dupCode(g.key))), [d, month, dupOk]);
  const dupGroup = dups.find(g => g.key === dupOpen) || null;
  const [forecastOpen, setForecastOpen] = useState(false), [forecastOpenLine, setForecastOpenLine] = useState('');
  const periodLabel = (b: {start: string; end: string}) => b.start.slice(8, 10) + '/' + b.start.slice(5, 7) + ' a ' + b.end.slice(8, 10) + '/' + b.end.slice(5, 7);
  const [reserveMenu, setReserveMenu] = useState(false), [breakdown, setBreakdown] = useState<'saldo' | 'income' | 'expense' | null>(null);
  const lastAporteKey = useRef(aporteKey);
  useEffect(() => { if (aporteKey === lastAporteKey.current) return; lastAporteKey.current = aporteKey; setReserveSheet(reserve ? 'in' : 'setup'); }, [aporteKey, reserve]);
  // aporte em aberto no mes atual: aparece 3 dias antes do dia do aporte (ou do aviso, se for antes) ate ser feito
  const aporteDue = !!split && split.planned > 0 && split.missing > 0 && month === monthOf(today) && Number(today.slice(8, 10)) >= Math.max(1, (split.planDay || 1) - Math.max(3, split.remindBefore || 0));
  // 0.3.252 (computador): Resumo em duas colunas - saldo, guardado, controle e avisos a esquerda; lancamentos a direita
  const summary = (
    <>
      {breakdown ? <MonthBreakdown kind={breakdown} d={d} month={month} show={show} net={net} api={api} accountId={accountId} reload={reload} onPatch={onPatchTx} onRemove={onRemoveTx} onTx={(t: Tx) => { setBreakdown(null); afterSheet(() => onTx(t)); }} onClose={() => setBreakdown(null)} /> : null}
      {forecastOpen ? <Sheet visible onClose={() => setForecastOpen(false)} label="Fechar previsão">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12, paddingBottom: 18}}>
          <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Previsto até {forecastEnd}</Text>
          <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{paydayKnown ? 'Quanto sobra do ciclo, do dia do salário até a véspera do próximo' : 'Quanto sobra do mês'}, depois de tudo pago: salário e outras receitas do ciclo − todas as despesas do ciclo (pagas ou não) − faturas do cartão − aporte. Não usa o Saldo: pagar uma conta não muda o previsto.{paydayKnown ? ' Nos 5 dias antes do pagamento, já mostra o ciclo seguinte.' : ''}</Text>
          <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 6}}>
            {([['Salário e receitas', forecastP.income, GOOD, '+', forecastP.incomeItems], ['Despesas do ciclo (pagas ou não)', forecastP.toPay, BAD, '−', forecastP.expenseItems], ['Faturas do cartão', forecastP.card, BAD, '−', [] as Tx[]], ['Aporte', forecastP.aporte, BAD, '−', [] as Tx[]]] as const)
              .filter(([, v], i) => i < 2 || v > 0).map(([label, v, color, sign, items]) => <View key={label} style={{gap: 4}}>
                <Pressable accessibilityRole="button" disabled={!items.length} onPress={() => setForecastOpenLine(l => l === label ? '' : label)} style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <Text style={{color: c.muted, fontSize: 13}}>{sign} {label}{items.length ? (forecastOpenLine === label ? ' ▾' : ' ▸') : ''}</Text><Text style={{color, fontWeight: '700'}}>{show(v)}</Text>
                </Pressable>
                {forecastOpenLine === label ? items.map(t => { const original = t.virtual ? (d.txs.find(x => !x.virtual && x.id === (t.seriesId || t.id)) || t) : t;
                  return <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={'Abrir ' + t.desc} onPress={() => { setForecastOpen(false); afterSheet(() => original.manualDue ? onBill(original) : onTx(original)); }}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 4}}>
                    <Text numberOfLines={1} style={{flex: 1, color: c.text, fontSize: 12}}>{t.desc}</Text>
                    <Text style={{color: c.muted, fontSize: 11}}>{t.date.slice(8, 10)}/{t.date.slice(5, 7)}{t.virtual || t.recurrence === 'monthly' ? ' · 🔁' : ''}</Text>
                    <Text style={{color: c.text, fontSize: 12, fontWeight: '700'}}>{show(t.amount)}</Text>
                  </Pressable>; }) : null}
              </View>)}
            <View style={{height: 1, backgroundColor: c.line, marginVertical: 4}} />
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '800'}}>= Previsto</Text><Text style={{color: forecastP.left < 0 ? BAD : c.text, fontWeight: '800'}}>{show(forecastP.left)}</Text></View>
          </View>
          {forecastP.left < 0 ? <Text style={{color: BAD, fontSize: 12, lineHeight: 18}}>O que ainda falta pagar passa {show(-forecastP.left)} do que você tem e do que vai entrar até lá.</Text> : null}
        </ScrollView>
      </Sheet> : null}
      {reserveHistoryOpen && reserve ? <ReserveHistorySheet api={api} reserve={reserve} moves={d.moves || []} show={show} reload={reload} startEdit={aporteEdit} onClose={() => { setReserveHistoryOpen(false); setAporteEdit(null); }} /> : null}
      {reserveSheet ? <ReserveSheet accountId={accountId} api={api} kind={reserveSheet} reserve={reserve} split={split} onClose={() => setReserveSheet(null)} onDone={async () => { setReserveSheet(null); await reload(); }} /> : null}
      {/* 0.3.153: cartao verde inteiro ATRAS do roxo (empilhados); o roxo cobre tudo menos a faixa de cima */}
      <View style={{backgroundColor: accountId ? GUARD : 'transparent', borderRadius: 24}}>
      {accountId ? <Pressable accessibilityRole="button" accessibilityLabel="Gerenciar dinheiro guardado" onPress={() => split ? setReserveMenu(true) : setReserveSheet('setup')}
        style={{paddingTop: 15, paddingHorizontal: 20, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>{split ? show(split.saved) : 'Configurar ›'}</Text>
        {split && outlook ? <Text style={{color: '#ffffffcc', fontSize: 11}}>de {show(outlook.target)} · {Math.round(Math.min(1, split.saved / outlook.target) * 100)}%</Text> : split && badge ? <Text style={{color: '#ffffffcc', fontSize: 11}}>{badge}</Text> : null}
        <View style={{flex: 1}} />
        <Text style={{color: '#ffffffdd', fontWeight: '700', fontSize: 13}}>Guardado</Text>
        <Icon name="shield" size={16} color="#ffffffdd" />
      </Pressable> : null}
      <View style={{backgroundColor: c.accent, borderRadius: 24, padding: 20, gap: 16, elevation: 2}}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={{flex: 1, color: c.onAccent + 'cc', fontSize: 13}}>Saldo</Text>
          <Pressable accessibilityLabel={hide ? 'Mostrar valores' : 'Esconder valores'} onPress={() => setHide(h => !h)} hitSlop={8}><Icon name={hide ? 'eyeOff' : 'eye'} size={18} color={c.onAccent + 'cc'} /></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver como o saldo é calculado" onPress={() => setBreakdown('saldo')}><Text style={{color: c.onAccent, fontSize: 32, fontWeight: '800'}}>{show(future ? 0 : total)}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver a previsão" onPress={() => setForecastOpen(true)}><Text style={{color: c.onAccent + 'cc', fontSize: 12}}>{future ? monthLabel(month).split(' ')[0] + ' ainda não começou · previsto' : 'Previsto até ' + forecastEnd}: <Text style={{color: c.onAccent, fontWeight: '700'}}>{show(future ? 0 : forecastP.left)}</Text> ›</Text></Pressable>
        <View style={{flexDirection: 'row', gap: 12}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver receitas do mês" onPress={() => setBreakdown('income')} style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↑ Receitas</Text><Text style={{color: c.onAccent, fontWeight: '800', fontSize: 16}}>{show(future ? 0 : s.income)}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ver despesas do mês" onPress={() => setBreakdown('expense')} style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↓ Despesas</Text><Text style={{color: c.onAccent, fontWeight: '800', fontSize: 16}}>{show(future ? 0 : s.expense)}</Text></Pressable>
        </View>

      </View>
      </View>
      <Sheet visible={reserveMenu} onClose={() => setReserveMenu(false)} label="Fechar detalhes da reserva">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 28}}>
          <Text style={{fontSize: 18, fontWeight: '800', color: c.text}}>Sua reserva</Text>
          {split ? <>
            <Text style={{fontSize: 29, fontWeight: '800', color: c.text}}>{show(split.saved)}</Text>
            <Text style={{fontSize: 12, lineHeight: 18, color: c.muted}}>Esse valor é separado das suas contas: não entra no Saldo, que é o que você tem para usar. Aportar tira do Saldo e soma aqui; retirar devolve. É uma organização da Sofia, não bloqueia nada no banco.</Text>
            {outlook ? <Pressable accessibilityRole="button" accessibilityLabel="Editar meta" onPress={() => { setReserveMenu(false); afterSheet(() => setReserveSheet('goal')); }} style={{backgroundColor: GUARD + '1f', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: GUARD + '55'}}>
              <Text style={{color: c.text, fontWeight: '800', fontSize: 14}}>Meta: {show(outlook.target)} até {outlook.deadline.split('-').reverse().join('/')}</Text>
              <View style={{height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden'}}>
                <View style={{width: `${Math.round(Math.min(1, split.saved / outlook.target) * 100)}%` as `${number}%`, height: 8, backgroundColor: GUARD}} />
              </View>
              <Text style={{color: c.muted, fontSize: 12}}>Hoje {show(split.saved)} · faltam {show(outlook.missing)}{outlook.months > 0 ? ' em ' + outlook.months + (outlook.months === 1 ? ' mês' : ' meses') : ''}</Text>
              {split.planned > 0 ? <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Com {show(split.planned)} por mês: {show(outlook.atCurrent)} em {monthLabel(outlook.deadline.slice(0, 7))}{outlook.reachDate ? ', e a meta inteira em ' + monthLabel(outlook.reachDate) : ''}.</Text> : null}
              {outlook.onTrack ? <Text style={{color: GOOD, fontWeight: '700', fontSize: 13}}>No ritmo atual você chega no prazo ✓</Text>
                : <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>Para fechar no prazo: {show(outlook.neededMonthly)} por mês</Text>}
              {!outlook.onTrack && split.planned > 0 ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Você pode manter {show(split.planned)} e compensar com aportes maiores quando sobrar, ou ajustar o valor em “Editar aportes”.</Text> : null}
            </Pressable> : null}
            {!outlook ? <Pressable accessibilityRole="button" onPress={() => { setReserveMenu(false); afterSheet(() => setReserveSheet('goal')); }}><Text style={{color: c.accent, fontSize: 13, fontWeight: '700'}}>+ Definir uma meta (quanto e até quando)</Text></Pressable> : null}
            {split.monthTarget > 0 || split.realized > 0 ? <View style={{backgroundColor: GUARD + '1f', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: GUARD + '55'}}>
              <Text style={{color: c.text, fontWeight: '800', fontSize: 14}}>Aportes de {monthLabel(month)}</Text>
              {split.planned > 0 ? <Text style={{color: c.muted, fontSize: 12}}>{show(split.planned)} todo dia {split.planDay}, avisar às {split.remindTime}</Text> : null}
              <Text style={{color: c.muted, fontSize: 12}}>Guardado no mês: {show(split.realized)}</Text>
              {split.takenBack > 0 ? <Text style={{color: c.muted, fontSize: 12}}>Retirado no mês, a recompor: −{show(split.takenBack)}</Text> : null}
              {split.monthTarget > 0 ? <Text style={{color: split.closed ? GOOD : c.text, fontWeight: '700', fontSize: 13}}>{split.closed ? 'Aporte do mês fechado ✓' : 'Faltam ' + show(split.missing) + ' para fechar o mês'}</Text> : null}
              {split.monthTarget > 0 ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>O que faltar não passa para o mês seguinte: a conta recomeça no valor do aporte.</Text> : null}
            </View> : null}
            <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Saldo (para usar)</Text><Text style={{color: split.daily < 0 ? BAD : c.text, fontWeight: '700'}}>{show(split.daily)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Guardado + Saldo</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(split.total)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Despesas previstas do mês</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(split.committed)}</Text></View>
              <View style={{height: 1, backgroundColor: c.line}} />
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '700', fontSize: 12}}>Livre após despesas previstas</Text><Text style={{color: split.free < 0 ? BAD : GOOD, fontWeight: '800'}}>{show(split.free)}</Text></View>
            </View>
            {split.daily < 0 ? <Text style={{color: BAD, fontSize: 12}}>O saldo geral ficou negativo: o que foi guardado é maior que o dinheiro que estava disponível. Confira os valores.</Text> : null}
          </> : null}
          {[['Guardar dinheiro', 'in'], ['Retirar da reserva', 'out'], ['Ajustar valor guardado', 'adjust'], ['Editar aportes', 'plan'], ['Editar meta', 'goal'], ['Histórico da reserva', 'history']].map(([label, k]) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => { setReserveMenu(false); afterSheet(() => { if (k === 'history') setReserveHistoryOpen(true); else setReserveSheet(k as 'in' | 'out' | 'plan' | 'goal' | 'adjust'); }); }}
              style={{paddingVertical: 13, borderBottomWidth: 1, borderColor: c.line}}>
              <Text style={{color: k === 'out' ? BAD : c.text, fontSize: 15, fontWeight: '600'}}>{label}  ›</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      {/* 0.3.188: o aporte do mes aparece como uma conta a fazer, com o valor sugerido; tocar abre ja preenchido */}
      {aporteDue && split ? <Pressable accessibilityRole="button" accessibilityLabel={'Aportar ' + show(split.missing)} onPress={() => setReserveSheet('in')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: WARN + '1a', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: WARN}}>
        <Text style={{fontSize: 18}}>🔒</Text>
        <View style={{flex: 1, gap: 2}}>
          <Text style={{color: c.text, fontWeight: '700', fontSize: 14}}>Aporte de {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>{show(split.missing)} {split.planDay ? '· dia ' + split.planDay : ''} · toque para aportar este ou outro valor</Text>
        </View>
        <View style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: WARN + '33'}}><Text style={{color: c.text, fontWeight: '800', fontSize: 12}}>Aportar</Text></View>
      </Pressable> : null}


      {/* 0.3.161: quanto ainda da para gastar neste ciclo, depois das contas fixas e do aporte */}
      {!fresh && !future && !failed ? <ShimmerGroup><View accessibilityRole="progressbar" accessibilityLabel="Atualizando o controle de gastos" style={{backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: c.line}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}><Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 15}}>Controle de gastos</Text><Text style={{color: c.muted, fontSize: 11}}>{monthLabel(month).split(' ')[0]}</Text></View>
        <ShimmerBlock width={'52%'} height={24} radius={8} /><ShimmerBlock width={'100%'} height={10} radius={5} /><ShimmerBlock width={'78%'} height={10} />
      </View></ShimmerGroup> :
      (() => { const b = future ? {...ctrl, base: 0, income: 0, expense: 0, card: 0, aporte: 0, available: 0, left: 0, spent: 0, pct: 0} : ctrl, over = b.left < 0, pct = Math.min(1, b.pct), since = b.start.slice(8, 10) + '/' + b.start.slice(5, 7);
        return <Pressable accessibilityRole="button" accessibilityLabel="Ver as despesas do mês" onPress={() => setBreakdown('expense')}
        style={{backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: over ? BAD : c.line}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}>
          <Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 15}}>Controle de gastos</Text>
          <Text style={{color: c.muted, fontSize: 11}}>{cycleDay > 1 ? 'desde o salário · ' + since : monthLabel(month).split(' ')[0]}</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
          <Text style={{color: over ? BAD : c.text, fontWeight: '800', fontSize: 26}}>{show(b.left)}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>de {show(b.available)}</Text>
          <View style={{flex: 1}} />
          <Text style={{color: over ? BAD : pct <= 0.25 ? WARN : GOOD, fontWeight: '700', fontSize: 13}}>{Math.round(b.pct * 100)}%</Text>
        </View>
        <View style={{height: 10, borderRadius: 5, backgroundColor: c.line, overflow: 'hidden'}}>
          <View style={{width: `${Math.round(pct * 100)}%` as `${number}%`, height: 10, borderRadius: 5, backgroundColor: over ? BAD : pct <= 0.25 ? WARN : GOOD}} />
        </View>
        {future ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>{monthLabel(month).split(' ')[0]} ainda não começou. Os números passam a contar quando o mês chegar.</Text> : <Text testID="spend-control-text" style={{color: c.muted, fontSize: 11, lineHeight: 16}}>{cycleDay > 1 ? 'Desde o salário de ' + since : 'Desde ' + since}: você tinha {show(b.base)}, entram {show(b.income)} de salário e receitas, saem {show(b.expense)} de despesas (pagas, avulsas e previstas){b.card > 0 ? ', ' + show(b.card) + ' de fatura' : ''}{b.aporte > 0 ? ' e ' + show(b.aporte) + ' de aporte' : ''}. Sobram {show(b.left)} até {b.end.slice(8, 10)}/{b.end.slice(5, 7)}{b.spent > 0 ? ' (já foram ' + show(b.spent) + ' em gastos avulsos)' : ''}.{cycleDay > 1 ? '' : tap(' Informe o dia do salário na conta para o controle começar nele.')}</Text>}
      </Pressable>; })()}

      {dups.slice(0, 2).map(g => <Pressable key={g.key} accessibilityRole="button" onPress={() => setDupOpen(g.key)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BAD + '14', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: BAD}}>
        <Text style={{fontSize: 18}}>⚠️</Text>
        <View style={{flex: 1, gap: 2}}>
          <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>“{g.title}” ({show(g.amount)}) aparece {g.items.length} vezes</Text>
          <Text style={{color: c.muted, fontSize: 12}}>Pode ter sido lançado repetido e descontado {g.items.length} vezes. Toque para revisar.</Text>
        </View>
      </Pressable>)}
      <FixedDupCard d={d} api={api} reload={reload} />
      {dupGroup ? <Sheet visible onClose={() => setDupOpen(null)} label="Fechar revisão de repetidos">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12, paddingBottom: 18}}>
          <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Lançamentos repetidos</Text>
          <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>“{dupGroup.title}”, {show(dupGroup.amount)}, aparece {dupGroup.items.length} vezes em {monthLabel(month).split(' ')[0].toLowerCase()}. Apague os que foram lançados a mais: cada um que sai devolve o valor ao Saldo.</Text>
          {dupGroup.items.map((t, i) => <View key={t.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.input, borderRadius: 14, padding: 12}}>
            <View style={{flex: 1}}><Text style={{color: c.text, fontWeight: '600'}}>{i + 1}. {t.desc}</Text><Text style={{color: c.muted, fontSize: 12}}>{t.date.split('-').reverse().join('/')} · {t.category}{(t.entity as {created_at?: string} | undefined)?.created_at ? ' · lançado às ' + new Date(String((t.entity as {created_at?: string}).created_at)).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) : ''}</Text></View>
            <Pressable accessibilityRole="button" disabled={!!dupBusy || dupGroup.items.length < 2} onPress={() => { setDupBusy(t.id); void api.deleteEntity(t.entity!.id).then(() => reload()).catch(e => appAlert('Finanças', errorText(e))).finally(() => setDupBusy('')); }}
              style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: BAD + '1f'}}>{dupBusy === t.id ? <ActivityIndicator color={BAD} /> : <Text style={{color: BAD, fontWeight: '700'}}>Apagar</Text>}</Pressable>
          </View>)}
          <Pressable accessibilityRole="button" onPress={() => { const next = [...dupOk, dupCode(dupGroup.key)].slice(-150); setDupOk(next); void SecureStore.setItemAsync('sofia_fin_dupok_v1', JSON.stringify(next)).catch(() => {}); setDupOpen(null); }} style={{paddingVertical: 12}}>
            <Text style={{color: c.accent, fontWeight: '700'}}>São compras diferentes, pode manter</Text></Pressable>
        </ScrollView>
      </Sheet> : null}
      {/* 0.3.199: categoria que ja passou do que voce costuma gastar no mes */}
      {month === monthOf(today) ? catAlerts.slice(0, 2).map(a => <Pressable key={a.category} accessibilityRole="button" onPress={() => setBreakdown('expense')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: WARN + '1a', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: WARN}}>
        <Text style={{fontSize: 18}}>{categoryOf(a.category).icon}</Text>
        <View style={{flex: 1, gap: 2}}>
          <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>{a.category}: {show(a.total)} em {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>{Math.round(a.pct * 100)}% acima do que você costuma gastar ({show(a.average)} por mês)</Text>
        </View>
      </Pressable>) : null}

      {/* 0.3.152: vencimentos proximos viram uma linha so (o detalhe fica em Pendentes); cartoes ficam na aba Cartoes */}
      {dues.length ? <Pressable accessibilityRole="button" accessibilityLabel="Ver pendentes" onPress={() => onTab('bills')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: dues.some(x => x.late) ? BAD : c.line}}>
        <Text style={{fontSize: 16}}>⏰</Text>
        <Text style={{flex: 1, color: c.text, fontSize: 13}}>{dues.some(x => x.late) ? 'Há conta atrasada' : dues.length === 1 ? '1 vencimento nos próximos 3 dias' : dues.length + ' vencimentos nos próximos 3 dias'}</Text>
        <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>{show(dues.reduce((sum, x) => sum + x.amount, 0))}</Text><Text style={{color: c.muted}}>›</Text>
      </Pressable> : null}

    </>
  );
  const history = <View style={{gap: 12, paddingTop: desktop ? 0 : 6}}>
        <TxTab d={d} month={month} accountFilter="" setAccountFilter={() => undefined} onTx={onTx} api={api} reload={reload} />
      </View>;
  if (desktop) return <View testID="finance-home-split" style={{flexDirection: 'row', gap: 24, alignItems: 'flex-start'}}>
    <View style={{flex: 1, minWidth: 0, maxWidth: 560, gap: 14}}>{summary}</View>
    <View style={{flex: 1.3, minWidth: 0}}>{history}</View>
  </View>;
  return (
    <>
      {summary}
      {history}
    </>
  );
}
function DueRow({due, d, api, reload, onTx}: {due: Due; d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void}) {
  const c = useTheme(), [busy, setBusy] = useState(false), [pick, setPick] = useState(false);
  // 0.3.181: atrasada continua vermelha e fatura roxa; o resto em aberto (inclusive a receber) amarelo; paga verde
  const color = due.late ? BAD : due.kind === 'fatura' ? c.accent : WARN;
  const local = React.useContext(FinanceLocal);
  async function settle(accountId?: string) {
    setBusy(true);
    try {
      if (due.invoice) {
        const acc = accountId || due.invoice.card.accountId || d.accounts[0]?.id;
        await saveEntity(api, 'fin_tx', 'Fatura ' + due.invoice.card.name + ' ' + due.invoice.month.slice(5, 7) + '/' + due.invoice.month.slice(0, 4), {kind: 'card_payment', amount: due.amount, date: todayISO(), card_id: due.invoice.card.id, invoice_month: due.invoice.month, account_id: acc, paid: true, category: 'Fatura do cartão'});
        await reload();
      } else if (due.tx) {
        // Fica "pago" na hora; o servidor grava em seguida. Se falhar, a tela volta ao estado real.
        local?.markPaid(due.tx);
        setBusy(false);
        void receiveTx(api, d, due.tx).then(() => reload()).catch(e => { appAlert('Finanças', errorText(e)); void reload(); });
        return;
      }
    } catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  // 0.3.222: pagar pela conta do cartao = pagar a fatura em que ela cai (o que falta dela)
  function invoiceOf(card: Card, t: Tx) { const m = txInvoiceMonth(card, t); return cardInvoices(card, d.txs).find(i => i.month === m) || null; }
  async function payInvoiceOf(card: Card, t: Tx, accountId: string) {
    const inv = invoiceOf(card, t); if (!inv) return;
    const left = Math.round((inv.total - inv.paid) * 100) / 100; if (left <= 0) return;
    setBusy(true);
    try { await saveEntity(api, 'fin_tx', 'Fatura ' + card.name + ' ' + inv.month.slice(5, 7) + '/' + inv.month.slice(0, 4), {kind: 'card_payment', amount: left, date: todayISO(), card_id: card.id, invoice_month: inv.month, account_id: accountId, paid: true, category: 'Fatura do cartão'}); await reload(); }
    catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  function askPayInvoice(card: Card, t: Tx) {
    const inv = invoiceOf(card, t); if (!inv) return;
    const left = Math.round((inv.total - inv.paid) * 100) / 100, n = inv.items.length, label = monthLabel(inv.month).split(' ')[0].toLowerCase();
    const accounts = d.accounts.filter(a => !a.archived);
    appAlert('Pagar a fatura de ' + label + '?', 'Esta conta está no ' + card.name + '. Pagar marca a fatura de ' + label + ' como paga (' + money(left) + ') e as ' + n + (n === 1 ? ' compra/conta dela fica paga.' : ' compras e contas dela ficam pagas.'),
      [{text: 'Cancelar', style: 'cancel'}, {text: 'Pagar fatura', onPress: () => { if (accounts.length > 1 && !card.accountId) setPick(true); else void payInvoiceOf(card, t, card.accountId || accounts[0]?.id || ''); }}]);
  }
  // 0.3.192: tocar em qualquer parte da linha abre a edicao; numa repeticao, abre a conta fixa original
  // 0.3.193: pela lista do mes, a edicao vale so para aquele mes (a conta fixa inteira muda em Contas fixas)
  const target = due.tx;
  const openEdit = () => { if (target) onTx(target); };
  // 0.3.223: conta no cartao - entra na fatura, sem "Paguei" (quem se paga e a fatura)
  if (due.tx?.cardId && !due.paid) { const cardOf = d.cards.find(x => x.id === due.tx!.cardId); return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.input, opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: cardOf?.color || c.accent}} />
      <View style={{flex: 1, gap: 2}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>💳 {due.title}</Text>
        <Text style={{fontSize: 11, color: c.muted}}>{dateBR(due.date)}{due.tx?.time ? ' · ' + due.tx.time : ''} · na fatura do {cardOf?.name || 'cartão'}{cardOf && due.tx ? ' de ' + monthLabel(txInvoiceMonth(cardOf, due.tx)).split(' ')[0].toLowerCase() : ''}</Text>
      </View>
      <Text style={{color: c.text, fontWeight: '700'}}>{money(due.amount)}</Text>
      {/* 0.3.222: Paguei numa conta do cartao paga a fatura dela inteira - todas as contas daquela fatura ficam pagas */}
      {cardOf && due.tx ? <Pressable disabled={busy} onPress={() => askPayInvoice(cardOf, due.tx!)} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: c.accent + '22'}}>
        {busy ? <ActivityIndicator size="small" color={c.accent} /> : <Text style={{color: c.accent, fontWeight: '700', fontSize: 12}}>Paguei</Text>}
      </Pressable> : null}
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8}}>Pagar a fatura com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setPick(false); if (cardOf && due.tx) void payInvoiceOf(cardOf, due.tx, a.id); }} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 15}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>
    </Pressable>); }
  if (due.paid) return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: GOOD + '1a', opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: GOOD}} />
      <View style={{flex: 1, gap: 2}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: GOOD}}>{due.kind === 'receber' ? 'Recebido' : 'Pago'} · {dateBR(due.date)}{due.tx?.time ? ' · ' + due.tx.time : ''}{due.tx?.cardId ? ' · com a fatura do ' + (d.cards.find(x => x.id === due.tx!.cardId)?.name || 'cartão') : ''}</Text>
      </View>
      <Text style={{color: GOOD, fontWeight: '700'}}>{money(due.amount)}</Text>
      <Text style={{color: GOOD, fontWeight: '800', fontSize: 12}}>✓ {due.kind === 'receber' ? 'Recebido' : 'Pago'}</Text>
    </Pressable>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Editar ' + due.title} disabled={!target} onPress={openEdit}
      style={({pressed}) => ({flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: color + '1a', opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: color}} />
      <View style={{flex: 1, gap: 2}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: due.late ? BAD : c.muted}}>{due.late ? 'Atrasado · ' : ''}{due.kind === 'receber' ? 'receber' : 'vence'} {dateBR(due.date)}{due.tx?.time ? ' · ' + due.tx.time : ''}{due.tx?.virtual ? ' · repetição' : ''}</Text>
      </View>
      <Text style={{color: c.text, fontWeight: '700'}}>{money(due.amount)}</Text>
      <Pressable disabled={busy} onPress={() => due.invoice && d.accounts.length > 1 ? setPick(true) : void settle()} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: color + '22'}}>
        {busy ? <ActivityIndicator size="small" color={color} /> : <Text style={{color, fontWeight: '700', fontSize: 12}}>{due.kind === 'receber' ? 'Recebi' : 'Paguei'}</Text>}
      </Pressable>
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8}}>Pagar {due.title} com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setPick(false); void settle(a.id); }} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 15}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>

    </Pressable>
  );
}
/** Pagar/receber: lançamento real vira pago; repetição prevista vira um lançamento real daquele mês. */
/** Espera a janela que esta fechando terminar de sair antes de abrir a proxima. */
// 0.3.227: a janela que fecha segura o fundo ate a proxima aparecer (sem piscar) e a pausa caiu de 230 para 120 ms
// 0.3.231: mes que ja passou esta FECHADO - nao entra nem muda mais nenhum lancamento; fica no Historico para consulta
const CLOSED_MSG = 'Esse mês já fechou e está no Histórico só para consulta. Use uma data deste mês.';
function isClosedMonth(m: string) { return !!m && m < monthOf(todayISO()); }
function afterSheet(run: () => void) { markSheetHandoff(); setTimeout(run, 120); }
// 0.3.175: atualizacoes locais imediatas (o servidor confirma por tras, sem a pessoa esperar).
const FinanceLocal = React.createContext<{markPaid: (t: Tx) => void} | null>(null);
/** 0.3.208: grava sobre a versao ATUAL do registro: se ele mudou desde que a tela carregou (chat, outra tela),
 * busca de novo e tenta outra vez - antes o "Paguei" falhava calado e a conta voltava para "a pagar". */
async function saveFresh(api: SofiaApi, title: string, data: Record<string, any>, entity: Entity) {
  try { return await saveEntity(api, 'fin_tx', title, data, entity); }
  catch (e) {
    const status = (e as {status?: number}).status;
    if (status !== 409 && status !== 412 && !/revis|vers|alterad/i.test(errorText(e))) throw e;
    const fresh = await api.entity(entity.id);
    if (data.paid === true && fresh.data?.paid === true) return fresh; // ja estava pago: nada a fazer
    return saveEntity(api, 'fin_tx', title, data, fresh);
  }
}
/** 0.3.223: a conta fixa continua a partir do mes seguinte com as mudancas (ex.: passar para o cartao); o registro deste
 * mes fica como foi (ja pago pela conta). Mesmo esquema do "so este mes" do cadastro. */
async function startSeriesNextMonth(api: SofiaApi, tx: Tx, patch: Record<string, any>, title: string) {
  const old = tx.entity!.data || {}, nm = addMonths(monthOf(tx.date), 1), nextDate = nm + '-' + String(Math.min(Number(tx.date.slice(8, 10)), daysIn(nm))).padStart(2, '0');
  const total = Number(old.installments) || 0, at = Number(old.installment) || 1, continues = !total || at < total;
  let nextId = '';
  if (continues) { const next = await api.saveEntity({kind: 'fin_tx', title, content: '', area: tx.entity!.area || 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {...old, date: nextDate, paid: false, recurrence: 'monthly', series_id: '', installment: total ? at + 1 : '', import_id: 'sofia-pendencia:' + uid(), ...patch}}); nextId = next.id; }
  await api.saveEntity({...tx.entity!, data: {...old, recurrence: 'none', series_id: nextId, installments: '', installment: '', recurrence_end: ''}});
}
/** 0.3.217: mantem o aporte ligado a uma receita igual a parte do guardado dela (cria, ajusta ou apaga). */
async function syncIncomeReserve(api: SofiaApi, d: Data, incomeId: string, goalId: string, part: number, paid: boolean, date: string, title: string) {
  const linked = (d.moves || []).find(m => String((m.entity?.data as {income_id?: string} | undefined)?.income_id || '') === incomeId);
  if (part > 0 && paid) {
    const data = {goal_id: goalId, direction: 'in', amount: part, date, note: 'Da receita: ' + title, planned: false, income_id: incomeId};
    if (linked?.entity) await api.saveEntity({...linked.entity, data: {...linked.entity.data, ...data}});
    else await api.saveEntity({kind: 'fin_reserve_move', title: 'Guardado na reserva', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data});
  } else if (linked?.entity) await api.deleteEntity(linked.entity.id);
}
/** 0.3.217: "Recebi": a parte do guardado ja cadastrada na receita vai sozinha para a reserva (sem perguntar);
 * para mudar, a pessoa edita o item. */
async function receiveTx(api: SofiaApi, d: Data, t: Tx) {
  const goal = reserveOf(d.goals), part = t.kind === 'income' && goal ? (t.reservePart || 0) : 0;
  const saved = await confirmTx(api, t, d.txs, part > 0 ? {reserve_part: part} : {});
  if (part > 0 && saved && goal) await syncIncomeReserve(api, d, saved.id, goal.id, part, true, t.date, t.desc);
  return saved;
}
async function confirmTx(api: SofiaApi, t: Tx, txs: Tx[] = [], extra: Record<string, any> = {}): Promise<Entity | null> {
  if (t.virtual) {
    // 0.3.185: nunca registrar duas vezes a mesma ocorrencia (ex.: salario do mes). Se ja existe um
    // registro dessa serie naquele mes, ele e o que fica pago.
    const series = t.seriesId || t.id, month = t.date.slice(0, 7);
    const same = txs.find(x => !x.virtual && x.entity && (x.seriesId === series || x.id === series) && x.date.slice(0, 7) === month);
    if (same && same.entity) return saveFresh(api, same.desc, {paid: true, paid_at: todayISO(), ...extra}, same.entity);
    const data: Record<string, any> = {kind: t.kind, amount: t.amount, date: t.date, category: t.category, account_id: t.accountId, paid: true, paid_at: todayISO(), series_id: t.seriesId, recurrence: 'none', time: t.time || '',
      // 0.3.177: a parcela paga continua aparecendo como pendencia (paga) daquele mes
      import_id: t.manualDue ? 'sofia-pendencia:' + (t.seriesId || t.id) + ':' + t.date : '', ...extra};
    return saveEntity(api, 'fin_tx', t.desc, data);
  } else if (t.entity) return saveFresh(api, t.desc, {paid: true, paid_at: todayISO(), ...extra}, t.entity);
  return null;
}
function BudgetRow({p}: {p: ReturnType<typeof budgetProgress>[number]}) {
  const c = useTheme(), cat = categoryOf(p.budget.category), color = p.state === 'estourado' ? BAD : p.state === 'alerta' ? WARN : GOOD;
  return (
    <View style={{gap: 6}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <Text style={{fontSize: 16}}>{cat.icon}</Text><Text style={{flex: 1, color: c.text, fontWeight: '600'}}>{cat.name}</Text>
        <Text style={{color: c.muted, fontSize: 12}}>{money(p.spent)} de {money(p.budget.limit)}</Text>
      </View>
      <Bar pct={p.pct} color={color} />
      <Text style={{fontSize: 11, color}}>{p.state === 'estourado' ? 'Passou ' + money(-p.left) + ' do limite' : 'Ainda pode gastar ' + money(p.left)}</Text>
    </View>
  );
}

// ============================ LANÇAMENTOS ============================
/** 0.3.213: extratos do banco guardados a parte. Cada linha e conferida ao vivo com os lancamentos do app:
 * bate / falta no app (Lancar) / ja estava no Saldo. O saldo do banco no fim do extrato pode acertar o Saldo. */
/** 0.3.220: seletor compacto de duas opcoes (do tamanho do texto, alinhado a esquerda) - o mesmo em todo Financas. */
function Segmented<T extends string>({value, onChange, options}: {value: T; onChange: (v: T) => void; options: {value: T; label: string}[]}) {
  const c = useTheme();
  // 0.3.227: duas metades iguais na largura toda (como era em Contas), o mesmo em Contas e no Historico do Resumo
  return <View accessibilityRole="tablist" style={{flexDirection: 'row', backgroundColor: c.input, borderRadius: 14, padding: 4}}>
    {options.map(o => { const on = o.value === value; return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{selected: on}} onPress={() => onChange(o.value)}
      style={{flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center', backgroundColor: on ? c.surface : 'transparent', ...(on ? {shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: {width: 0, height: 1}, elevation: 1} : {})}}>
      <Text style={{color: on ? c.text : c.muted, fontWeight: on ? '800' : '600', fontSize: 13}}>{o.label}</Text>
    </Pressable>; })}
  </View>;
}
/** 0.3.219: setinha de abrir/fechar, do mesmo tamanho em todo Financas. */
function Chevron({open}: {open: boolean}) {
  const c = useTheme();
  return <View style={{width: 30, height: 30, borderRadius: 15, backgroundColor: c.input, alignItems: 'center', justifyContent: 'center'}}>
    <Text style={{color: c.text, fontSize: 20, lineHeight: 22, fontWeight: '600', transform: [{rotate: open ? '90deg' : '0deg'}]}}>›</Text>
  </View>;
}
/** 0.3.219: arrastar para o lado mostra "Apagar"; passando do ponto, pede confirmacao. Rolagem vertical nao e afetada. */
function SwipeToDelete({children, onDelete, label, busy = false}: {children: React.ReactNode; onDelete: () => void; label: string; busy?: boolean}) {
  const c = useTheme(), x = useRef(new Animated.Value(0)).current, LIMIT = -96;
  const back = () => Animated.spring(x, {toValue: 0, useNativeDriver: true, bounciness: 4}).start();
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => x.setValue(Math.max(-160, Math.min(0, g.dx))),
    onPanResponderRelease: (_e, g) => { if (g.dx <= LIMIT) { Animated.timing(x, {toValue: -120, duration: 120, useNativeDriver: true}).start(); onDelete(); setTimeout(back, 400); } else back(); },
    onPanResponderTerminate: back,
  })).current;
  return <View style={{borderRadius: 18, overflow: 'hidden'}}>
    <View style={{position: 'absolute', top: 0, bottom: 0, right: 0, left: 0, backgroundColor: BAD, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22}}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text accessibilityLabel={label} style={{color: '#fff', fontWeight: '800'}}>Apagar</Text>}
    </View>
    <Animated.View {...pan.panHandlers} style={{transform: [{translateX: x}]}}>{children}</Animated.View>
  </View>;
}
/** 0.3.227: conta/receita fixa cadastrada mais de uma vez - avisa e deixa apagar as copias (ou manter). */
function FixedDupCard({d, api, reload}: {d: Data; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), [ok, setOk] = useState<string[]>([]), [open, setOpen] = useState<string | null>(null), [busy, setBusy] = useState('');
  const code = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(36); };
  useEffect(() => { SecureStore.getItemAsync('sofia_fin_dupok_v1').then(v => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setOk(a.map(String)); } catch { /* nenhum */ } }).catch(() => {}); }, []);
  const groups = useMemo(() => fixedDuplicateGroups(d.txs).filter(g => !ok.includes(code(g.key))), [d, ok]);
  const g = groups.find(x => x.key === open) || null;
  if (!groups.length) return null;
  return <>
    {groups.slice(0, 2).map(x => <Pressable key={x.key} accessibilityRole="button" onPress={() => setOpen(x.key)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BAD + '14', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: BAD}}>
      <Text style={{fontSize: 18}}>⚠️</Text>
      <View style={{flex: 1, gap: 2}}>
        <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>“{x.title}” está cadastrada {x.items.length} vezes</Text>
        <Text style={{color: c.muted, fontSize: 12}}>{x.kind === 'income' ? 'Receita' : 'Conta'} do dia {x.day}. Toque para apagar as cópias.</Text>
      </View>
    </Pressable>)}
    {g ? <Sheet visible onClose={() => setOpen(null)} label="Fechar cadastros repetidos">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12, paddingBottom: 18}}>
        <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Cadastros repetidos</Text>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>“{g.title}” aparece {g.items.length} vezes, todas no dia {g.day}. Apague as que sobram e deixe só a certa.</Text>
        {g.items.map((t, i) => <View key={t.id} style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.input, borderRadius: 14, padding: 12}}>
          <View style={{flex: 1, gap: 2}}><Text style={{color: c.text, fontWeight: '600'}}>{i + 1}. {t.desc} · {money(t.amount)}</Text><Text style={{color: c.muted, fontSize: 12}}>{t.recurrence === 'monthly' ? (t.installments > 1 ? 'parcela ' + t.installment + ' de ' + t.installments : 'todo mês, sem prazo') : 'só esta vez'} · desde {t.date.split('-').reverse().join('/')}</Text></View>
          <Pressable accessibilityRole="button" disabled={!!busy || g.items.length < 2} onPress={() => { setBusy(t.id); void api.deleteEntity(t.entity!.id).then(() => reload()).catch(e => appAlert('Finanças', errorText(e))).finally(() => setBusy('')); }}
            style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: BAD + '1f'}}>{busy === t.id ? <ActivityIndicator color={BAD} /> : <Text style={{color: BAD, fontWeight: '700'}}>Apagar</Text>}</Pressable>
        </View>)}
        <Pressable accessibilityRole="button" onPress={() => { const next = [...ok, code(g.key)].slice(-150); setOk(next); void SecureStore.setItemAsync('sofia_fin_dupok_v1', JSON.stringify(next)).catch(() => {}); setOpen(null); }} style={{paddingVertical: 12}}>
          <Text style={{color: c.accent, fontWeight: '700'}}>São diferentes, pode manter</Text></Pressable>
      </ScrollView>
    </Sheet> : null}
  </>;
}
function BankStatements({d, api, reload, onImport}: {d: Data; api: SofiaApi; reload: () => Promise<void>; onImport: () => void}) {
  const c = useTheme(), [open, setOpen] = useState<string>(''), [busy, setBusy] = useState('');
  const account = (id: string) => d.accounts.find(a => a.id === id);
  const matchOf = (line: StatementLine, acc: Account | undefined) => {
    const t = Date.parse(line.date + 'T12:00:00Z');
    const byId = d.txs.find(x => !x.virtual && String(x.entity?.data?.import_id || '') === line.import_id); if (byId) return {tx: byId, how: 'extrato' as const};
    const found = d.txs.filter(x => !x.virtual && x.paid && (!acc || x.accountId === acc.id) && x.kind === line.kind && Math.abs(x.amount - line.amount) <= 1.0001 && Math.abs(Date.parse(x.date + 'T12:00:00Z') - t) <= 3 * 864e5)
      .sort((a, b) => Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount))[0];
    return found ? {tx: found, how: 'app' as const} : null;
  };
  async function remove(st: Statement) {
    setBusy(st.id);
    try { await api.financeStatementDelete(st.id); await reload(); } catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(''); }
  }
  if (!d.statements.length) return <View style={{backgroundColor: c.surface, borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: c.line}}>
    <Text style={{color: c.text, fontWeight: '700'}}>Nenhum extrato ainda</Text>
    <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>O extrato do banco fica guardado só aqui, para você conferir com o app. Ele não mexe na conta.</Text>
    <Button title="Importar extrato (OFX ou CSV)" secondary onPress={onImport} />
  </View>;
  return <View style={{gap: 12}}>
    {d.statements.map(st => { const acc = account(st.accountId), start = String(acc?.entity?.data?.balance_set_at || ''); const rows = st.lines.map(l => ({l, m: matchOf(l, acc), before: !!start && l.date < start})); const missing = rows.filter(r => !r.m && !r.before).length;
      return <SwipeToDelete key={st.id} busy={busy === st.id} label="Apagar extrato" onDelete={() => appAlert('Apagar este extrato?', 'O extrato sai daqui' + (st.lines.some(l => d.txs.some(x => String(x.entity?.data?.import_id || '') === l.import_id)) ? ' e o que foi lançado a partir dele também, e a conta volta a como era.' : '.'), [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => void remove(st)}])}>
      <View style={{backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, overflow: 'hidden'}}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(o => o === st.id ? '' : st.id)} style={{padding: 14, gap: 4}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 14}}>{st.from.split('-').reverse().slice(0, 2).join('/')} a {st.to.split('-').reverse().slice(0, 2).join('/')}{acc ? ' · ' + acc.name : ''}</Text><Chevron open={open === st.id} /></View>
          <Text style={{color: c.muted, fontSize: 12}}>{st.lines.length} linhas · {missing ? missing + (missing === 1 ? ' falta no app' : ' faltam no app') : 'tudo confere'}{st.closing !== null ? ' · saldo no banco ' + money(st.closing) : ''}</Text>
        </Pressable>
        {open === st.id ? <View style={{paddingHorizontal: 14, paddingBottom: 14, gap: 6}}>
          {acc && st.closing !== null ? <Text style={{color: c.text, fontSize: 12, backgroundColor: c.input, borderRadius: 12, padding: 10}}>Banco no fim do extrato: <Text style={{fontWeight: '800'}}>{money(st.closing)}</Text> · app agora: <Text style={{fontWeight: '800'}}>{money(accountBalance(acc, d.txs))}</Text></Text> : null}
          {rows.map(({l, m, before}) => <View key={l.import_id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderColor: c.line}}>
            <View style={{flex: 1}}><Text numberOfLines={1} style={{color: c.text, fontSize: 13}}>{l.desc}</Text><Text style={{color: m ? GOOD : before ? c.muted : WARN, fontSize: 11}}>{l.date.split('-').reverse().slice(0, 2).join('/')} · {m ? (m.how === 'app' ? 'bate com “' + m.tx.desc + '”' : 'lançado pelo extrato') : before ? 'antes do ponto de partida (já no Saldo)' : 'falta no app'}</Text></View>
            <Text style={{color: l.kind === 'income' ? GOOD : c.text, fontWeight: '700', fontSize: 13}}>{l.kind === 'income' ? '+' : '−'}{money(l.amount)}</Text>
          </View>)}
        </View> : null}
      </View>
      </SwipeToDelete>; })}
    <Text style={{color: c.muted, fontSize: 11, textAlign: 'center'}}>Arraste um extrato para o lado para apagar.</Text>
    <Button title="Importar outro extrato" secondary onPress={onImport} />
  </View>;
}
function TxTab({d, month, accountFilter, setAccountFilter, onTx, api, reload}: {d: Data; month: string; accountFilter: string; setAccountFilter: (v: string) => void; onTx: (t: Partial<Tx>) => void; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), [kind, setKind] = useState<'all' | TxKind>('all'), [cat, setCat] = useState(''), [status, setStatus] = useState<'all' | 'pending'>('all');
  // 0.3.153: o que voce registrou na Sofia e o extrato importado do banco ficam separados, com troca.
  const [source, setSource] = useState<'app' | 'months'>('app'), [openMonth, setOpenMonth] = useState('');
  const imported = (t: Tx) => { const id = String(t.entity?.data?.import_id || ''); return !!id && !id.startsWith('sofia-pendencia:'); };
  // 0.3.160: em vez de digitar uma busca, filtros prontos com as categorias que JA foram usadas nos
  // lancamentos (nada inventado), da mais usada para a menos usada. Sem nenhuma categoria, sem filtro.
  const catPresets = useMemo(() => { const n = new Map<string, number>(); for (const t of d.txs) { if ((t.manualDue && !t.paid) || imported(t) || (kind !== 'all' && t.kind !== kind)) continue; const name = String(t.category || '').trim(); if (name) n.set(name, (n.get(name) || 0) + 1); } return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([name]) => name); }, [d.txs, source, kind]);
  const activeCat = catPresets.includes(cat) ? cat : '';
  const hasAnyTx = d.txs.some(t => (!t.manualDue || t.paid) && !imported(t));
  // 0.3.226: salario e qualquer receita programada (inclusive as de Contas) aparecem no Historico desde o comeco do mes,
  // como "a receber", ate serem confirmadas; conta a pagar segue so em Contas
  const pendingIncome = (t: Tx) => t.kind === 'income' && !t.paid;
  // 0.3.232: conta avulsa aparece so aqui no extrato; as programadas ficam em Contas
  // 0.3.225: pago antes ou depois do vencimento -> fica no Historico no dia em que foi pago
  const histDate = (t: Tx) => t.paid && t.paidAt ? t.paidAt : t.date;
  const monthItems = (m: string) => [...monthTxs(d.txs, m).filter(t => monthOf(histDate(t)) === m), ...d.txs.filter(t => !t.virtual && t.paid && t.paidAt && monthOf(t.paidAt) === m && monthOf(t.date) !== m)]
    .filter(t => !t.virtual && (t.paid || t.kind !== 'expense' || !isScheduled(t)) && !imported(t));
  const daysOf = (its: Tx[]) => { const g = new Map<string, Tx[]>(); for (const t of its) { const k = histDate(t); if (!g.has(k)) g.set(k, []); g.get(k)!.push(t); } return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0])); };
  const closedMonths = useMemo(() => { const cur = monthOf(todayISO()), ms = new Set<string>(); for (const t of d.txs) { if (t.virtual || imported(t)) continue; const m = monthOf(t.paid && t.paidAt ? t.paidAt : t.date); if (m && m < cur) ms.add(m); } return [...ms].sort().reverse(); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const histSource = [...monthTxs(d.txs, month).filter(t => monthOf(histDate(t)) === month), ...d.txs.filter(t => !t.virtual && t.paid && t.paidAt && monthOf(t.paidAt) === month && monthOf(t.date) !== month)];
  const list = histSource.filter(t => (pendingIncome(t) || !t.manualDue || t.paid || !isScheduled(t)) && !imported(t) && (kind === 'all' || t.kind === kind) && (!accountFilter || t.accountId === accountFilter || t.toAccountId === accountFilter || t.cardId === accountFilter)
    && (status === 'all' || (!t.paid && !t.cardId)) && (!activeCat || t.category === activeCat));
  const days = useMemo(() => { const m = new Map<string, Tx[]>(); for (const t of list) { const k = histDate(t); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); } return [...m.entries()].map(([k, v]) => [k, [...v].sort((a, b) => (b.time || '').localeCompare(a.time || ''))] as [string, Tx[]]); }, [list]);
  const sum = list.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0);
  const filterName = d.accounts.find(a => a.id === accountFilter)?.name || d.cards.find(x => x.id === accountFilter)?.name;
  const [importing, setImporting] = useState(false), [tools, setTools] = useState(false);
  return (
    <>
      {/* 0.3.152: historico direto sob os cartoes; busca, filtros e importacao ficam recolhidos */}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 2}}>
        <Text style={{flex: 1, fontSize: 18, fontWeight: '800', color: c.text}}>Histórico</Text>
        {hasAnyTx ? <IconButton name="filter" label={tools ? 'Esconder filtros' : 'Filtrar'} onPress={() => setTools(v => !v)} /> : null}
      </View>
      <Segmented value={source} onChange={setSource} options={[{value: 'app' as const, label: 'Lançamentos'}, {value: 'months' as const, label: 'Histórico'}]} />
      {/* 0.3.231: Historico = meses que ja fecharam, pelo nome; abrir mostra aquele mes (so consulta) */}
      {source === 'months' ? (closedMonths.length ? closedMonths.map(m => { const its = monthItems(m), res = its.reduce((t, x) => t + (x.kind === 'income' ? x.amount : x.kind === 'expense' ? -x.amount : 0), 0), open = openMonth === m;
        return <Card_ key={m} style={{padding: 0, gap: 0}}>
          <Pressable accessibilityRole="button" accessibilityLabel={(open ? 'Fechar ' : 'Abrir ') + monthLabel(m)} onPress={() => setOpenMonth(open ? '' : m)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14}}>
            <Text style={{fontSize: 16}}>🔒</Text>
            <View style={{flex: 1, gap: 2}}><Text style={{color: c.text, fontWeight: '800', fontSize: 15}}>{monthLabel(m)}</Text>
              <Text style={{color: c.muted, fontSize: 12}}>{its.length} {its.length === 1 ? 'lançamento' : 'lançamentos'} · resultado {money(res)}</Text></View>
            <Chevron open={open} />
          </Pressable>
          {open ? <View style={{paddingHorizontal: 10, paddingBottom: 10, gap: 8}}>{daysOf(its).map(([date, items]) => <View key={date} style={{gap: 6}}>
            <Text style={{color: c.muted, fontSize: 12, fontWeight: '700', paddingLeft: 4}}>{weekday(date)}</Text>
            {items.map((t, i) => <TxRow key={t.id} t={t} d={d} first={i === 0} onPress={() => appAlert('Mês fechado', CLOSED_MSG)} api={api} reload={reload} />)}
          </View>)}</View> : null}
        </Card_>; }) : <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>Nenhum mês fechado ainda. Quando o mês virar, ele aparece aqui para consulta.</Text>) : null}
      {importing ? <ImportSheet api={api} d={d} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await reload(); }} /> : null}
      {source === 'months' ? null : hasAnyTx && (tools || activeCat || kind !== 'all' || status !== 'all') ? <View style={{gap: 10}}>
      {catPresets.length ? <Chips scroll value={activeCat} onChange={setCat} options={[{value: '', label: 'Todas as categorias'}, ...catPresets.map(name => ({value: name, label: name}))]} /> : null}
      <Chips scroll value={kind} onChange={setKind} options={[{value: 'all' as const, label: 'Todos'}, {value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}, {value: 'transfer' as const, label: 'Transferências'}, {value: 'card_payment' as const, label: 'Faturas'}]} />
      <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <Chips value={status} onChange={setStatus} options={[{value: 'all' as const, label: 'Tudo'}, {value: 'pending' as const, label: 'Só pendentes'}]} />
        {filterName ? <Pressable onPress={() => setAccountFilter('')} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontWeight: '600', fontSize: 12}}>{filterName} ✕</Text></Pressable> : null}
      </View>
      </View> : null}
      {source === 'months' ? null : <>
      {isClosedMonth(month) ? <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.input}}><Text>🔒</Text><Text style={{flex: 1, color: c.text, fontSize: 13}}>{monthLabel(month)} já fechou — só consulta. Nada entra nem muda neste mês.</Text></View> : null}
      {list.length ? <Text style={{color: c.muted, fontSize: 12}}>{list.length} movimentações no mês · resultado {money(sum)}</Text> : null}
      {!days.length ? <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>{activeCat || kind !== 'all' || status !== 'all' ? 'Nenhum lançamento com esses filtros.' : (isClosedMonth(month) ? 'Nenhum lançamento neste mês.' : tap('Nenhum lançamento neste mês. Toque em ＋ para registrar.'))}</Text> : days.map(([date, items]) => (
        <View key={date} style={{gap: 8}}>
          <Text style={{color: c.muted, fontSize: 12, fontWeight: '700', paddingLeft: 4}}>{weekday(date)}</Text>
          <Card_ style={{padding: 10, gap: 0}}>{items.map((t, i) => <TxRow key={t.id} t={t} d={d} first={i === 0} onPress={() => onTx(t)} api={api} reload={reload} />)}</Card_>
        </View>
      ))}
      </>}
    </>
  );
}
function TxRow({t, d, first, onPress, api, reload, inInvoice = false}: {inInvoice?: boolean; t: Tx; d: Data; first: boolean; onPress: () => void; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), cat = categoryOf(t.category, t.kind);
  // 0.3.223: compra no cartao cobrada numa fatura de outro mes (feita depois do fechamento): no Historico do mes da compra
  // aparece apagada, avisando quando vai ser cobrada e que nao mexe no saldo agora; dentro da fatura, diz quando foi feita
  const cardOf = t.cardId ? d.cards.find(x => x.id === t.cardId) : undefined, billedIn = cardOf && t.date ? txInvoiceMonth(cardOf, t) : '';
  const later = !!billedIn && t.kind === 'expense' && billedIn > monthOf(t.date), dm = t.date.slice(8, 10) + '/' + t.date.slice(5, 7);
  const source = t.cardId ? (inInvoice ? '💳 ' + (cardOf?.name || 'Cartão') + (later ? ' · compra feita em ' + dm : '')
      : later ? '💳 ' + (cardOf?.name || 'Cartão') + ' · compra de ' + dm + ' · cobrada na fatura de ' + monthLabel(billedIn).split(' ')[0].toLowerCase() + ' · não mexe no saldo agora'
      : '💳 ' + (cardOf?.name || 'Cartão') + cardWhen(t, d.cards)) : t.kind === 'transfer' ? (d.accounts.find(a => a.id === t.accountId)?.name || '') + ' → ' + (d.accounts.find(a => a.id === t.toAccountId)?.name || '') : d.accounts.find(a => a.id === t.accountId)?.name || '';
  const pending = !t.paid && !t.cardId;
  const color = t.kind === 'income' ? GOOD : t.kind === 'transfer' ? c.muted : c.text;
  return (
    <Pressable onPress={onPress} style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: first ? 0 : 1, borderColor: c.line, opacity: later && !inInvoice ? 0.5 : t.virtual ? 0.75 : 1}}>
      <Dot color={cat.color} icon={cat.icon} />
      <View style={{flex: 1}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{t.desc}</Text>
        <Text numberOfLines={later && !inInvoice ? 2 : 1} style={{color: c.muted, fontSize: 11}}>{t.time ? t.time + ' · ' : ''}{cat.name} · {source}{t.installments > 1 ? ' · ' + t.installment + '/' + t.installments : ''}{t.recurrence !== 'none' || t.virtual ? ' · 🔁' : ''}</Text>
      </View>
      <View style={{alignItems: 'flex-end', gap: 2}}>
        <Text style={{color, fontWeight: '700'}}>{t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '−'}{money(t.amount)}</Text>
        {pending ? <Pressable onPress={() => void receiveTx(api, d, t).then(reload).catch(e => appAlert('Finanças', errorText(e)))}><Text style={{fontSize: 11, color: t.date < todayISO() ? BAD : WARN, fontWeight: '700'}}>{t.virtual ? 'previsto · confirmar' : t.kind === 'income' ? 'a receber · ✓' : 'a pagar · ✓'}</Text></Pressable> : null}
      </View>
    </Pressable>
  );
}

// ============================ DEVOLUCOES (0.3.255) ============================
function RefundsTab({d, api, reload, accountId}: {d: Data; api: SofiaApi; reload: () => Promise<void>; accountId: string}) {
  const c = useTheme(), accounts = d.accounts.filter(a => !a.archived);
  const all = (d.refunds || []).filter(r => !accountId || !r.accountId || r.accountId === accountId);
  const pending = all.filter(r => r.state === 'pending').sort((a, b) => (a.expected || '9999').localeCompare(b.expected || '9999'));
  const received = all.filter(r => r.state === 'received').sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 10);
  const total = Math.round(pending.reduce((t, r) => t + r.amount, 0) * 100) / 100;
  const [editing, setEditing] = useState<Refund | 'new' | null>(null), [busy, setBusy] = useState('');
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name || '';
  function receive(r: Refund) {
    const acc = r.accountId && accounts.some(a => a.id === r.accountId) ? r.accountId : accountId || accounts[0]?.id || '';
    if (!acc) { appAlert('Devoluções', 'Cadastre uma conta antes de receber.'); return; }
    appAlert('Recebeu ' + money(r.amount) + '?', '“' + r.title + '” entra agora no Saldo e no Histórico como receita de hoje' + (accountName(acc) ? ', na conta ' + accountName(acc) : '') + '.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Recebi', onPress: () => {
      setBusy(r.id);
      const now = new Date(), time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      void saveEntity(api, 'fin_tx', r.title, {kind: 'income', amount: r.amount, date: todayISO(), category: 'Reembolso', account_id: acc, paid: true, recurrence: 'none', time, __content: 'Devolução recebida'})
        .then(tx => saveEntity(api, 'fin_refund', r.title, {received_at: todayISO(), tx_id: tx.id, account_id: acc}, r.entity, 'received'))
        .then(() => reload()).catch(e => appAlert('Devoluções', errorText(e))).finally(() => setBusy(''));
    }}]);
  }
  return <View style={{gap: 14}}>
    <View style={{backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 6, borderWidth: 1, borderColor: c.line}}>
      <Text style={{color: c.muted, fontSize: 12}}>A receber de devoluções</Text>
      <Text testID="refunds-total" style={{color: c.text, fontSize: 26, fontWeight: '800'}}>{money(total)}</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 17}}>Não entra no Saldo nem no previsto. Quando o dinheiro cair, toque em “Recebi”: ele vai para o Saldo e para o Histórico.</Text>
    </View>
    <Button title="+ Nova devolução a receber" secondary onPress={() => setEditing('new')} />
    {pending.length ? pending.map(r => <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={'Editar ' + r.title} onPress={() => setEditing(r)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.line}}>
      <Text style={{fontSize: 20}}>↩️</Text>
      <View style={{flex: 1, gap: 2}}>
        <Text style={{color: c.text, fontWeight: '700'}} numberOfLines={2}>{r.title}</Text>
        <Text style={{color: c.muted, fontSize: 12}}>{money(r.amount)}{r.expected ? ' · previsão ' + r.expected.split('-').reverse().join('/') : ''}{accountName(r.accountId) ? ' · ' + accountName(r.accountId) : ''}</Text>
      </View>
      <Pressable testID={'refund-receive-' + r.id} accessibilityRole="button" accessibilityLabel={'Recebi ' + r.title} disabled={!!busy} onPress={() => receive(r)} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: GOOD + '22'}}>
        {busy === r.id ? <ActivityIndicator color={GOOD} /> : <Text style={{color: GOOD, fontWeight: '800', fontSize: 12}}>Recebi</Text>}
      </Pressable>
    </Pressable>) : <Text style={{color: c.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12}}>Nenhuma devolução esperando.</Text>}
    {received.length ? <View style={{gap: 8}}><Text style={{color: c.muted, fontSize: 12, fontWeight: '700'}}>RECEBIDAS</Text>{received.map(r => <View key={r.id} style={{flexDirection: 'row', gap: 10, paddingVertical: 6}}>
      <Text style={{flex: 1, color: c.text}} numberOfLines={1}>✓ {r.title}</Text><Text style={{color: c.muted, fontSize: 12}}>{money(r.amount)}{r.receivedAt ? ' · ' + r.receivedAt.split('-').reverse().join('/') : ''}</Text></View>)}</View> : null}
    {editing ? <RefundSheet api={api} refund={editing === 'new' ? null : editing} accounts={accounts} defaultAccount={accountId || accounts[0]?.id || ''} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} /> : null}
  </View>;
}
function RefundSheet({api, refund, accounts, defaultAccount, onClose, onSaved}: {api: SofiaApi; refund: Refund | null; accounts: Account[]; defaultAccount: string; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), [title, setTitle] = useState(refund?.title || ''), [amount, setAmount] = useState(refund ? finishMoneyInput(String(refund.amount).replace('.', ',')) : '');
  const [expected, setExpected] = useState(refund?.expected || ''), [account, setAccount] = useState(refund?.accountId || defaultAccount), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    const value = parseMoney(amount);
    if (!title.trim()) { setError('Diga de onde vem a devolução.'); return; }
    if (!value || value <= 0) { setError('Digite o valor.'); return; }
    setBusy(true); setError('');
    try { await saveEntity(api, 'fin_refund', title.trim(), {amount: value, expected_date: expected || '', account_id: account || ''}, refund?.entity, refund ? undefined : 'pending'); onSaved(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function erase() {
    if (!refund) return;
    appAlert('Apagar esta devolução?', 'Ela sai da lista. O Saldo não muda.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => { setBusy(true); void api.deleteEntity(refund.id).then(onSaved).catch(e => setError(errorText(e))).finally(() => setBusy(false)); }}]);
  }
  return <Sheet visible onClose={onClose} label="Fechar devolução">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 12}}>
      <Text style={{color: c.text, fontSize: 20, fontWeight: '800'}}>{refund ? 'Devolução a receber' : 'Nova devolução a receber'}</Text>
      <Field label="De onde vem" value={title} onChange={setTitle} placeholder="Ex.: Estorno da loja" />
      <Field label="Valor (R$)" value={amount} onChange={setAmount} placeholder="0,00" numeric />
      <DateTimeField label="Previsão de chegada (opcional)" value={expected} onChange={setExpected} dateOnly />
      {accounts.length > 1 ? <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>Conta onde vai cair</Text><Chips scroll value={account} onChange={setAccount} options={accounts.map(a => ({value: a.id, label: a.name}))} /></View> : null}
      {error ? <Text style={{color: BAD, fontSize: 13}}>{error}</Text> : null}
      <Button title="Salvar" loading={busy} onPress={() => void save()} />
      {refund ? <Pressable accessibilityRole="button" onPress={erase} style={{alignItems: 'center', paddingVertical: 10}}><Text style={{color: BAD, fontWeight: '700'}}>Apagar devolução</Text></Pressable> : null}
    </ScrollView>
  </Sheet>;
}

// ============================ EDITOR ============================
/** 0.3.255: quando o item foi lancado no app (criado), em data e hora locais. */
function addedAt(tx: Partial<Tx>): string {
  const raw = String((tx.entity as {created_at?: string} | undefined)?.created_at || ''), at = Date.parse(raw);
  if (!raw || !Number.isFinite(at)) return '';
  const dt = new Date(at);
  return dt.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) + ' às ' + dt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
}
function TxEditor({api, d, tx, defaultAccountId, onClose, onSaved, onOptimistic, onOptimisticRemove}: {onOptimisticRemove?: (id: string) => void; onOptimistic?: (id: string, changes: Partial<Tx>) => void; api: SofiaApi; d: Data; tx: Partial<Tx>; defaultAccountId?: string; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), editing = !!tx.entity && !tx.virtual;
  const [kind, setKind] = useState<TxKind>(tx.kind || 'expense');
  const [amount, setAmount] = useState(tx.amount ? finishMoneyInput(String(tx.amount).replace('.', ',')) : ''), [desc, setDesc] = useState(tx.desc || '');
  const [category, setCategory] = useState(tx.category || ''), [date, setDate] = useState(tx.date || todayISO());
  const firstAccount = (defaultAccountId && d.accounts.some(a=>a.id===defaultAccountId&&!a.archived) ? defaultAccountId : d.accounts.find(a => !a.archived)?.id) || '';
  const [source, setSource] = useState(tx.cardId || tx.accountId || firstAccount), [to, setTo] = useState(tx.toAccountId || d.accounts.find(a => !a.archived && a.id !== firstAccount)?.id || '');
  const [paid, setPaid] = useState(tx.paid ?? true), [repeat, setRepeat] = useState<'none' | 'monthly' | 'installments'>(tx.recurrence && tx.recurrence !== 'none' ? 'monthly' : 'none');
  const [time, setTime] = useState(tx.time || '');
  const [note, setNote] = useState(String(tx.entity?.content || ''));
  const [parts, setParts] = useState(3), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const isCard = d.cards.some(x => x.id === source);
  // 0.3.215: receita avulsa pode mandar uma parte para o guardado (a parte do saldo soma ao valor inicial do Controle)
  const goalForSplit = reserveOf(d.goals), [toReserve, setToReserve] = useState(tx.reservePart ? finishMoneyInput(String(tx.reservePart).replace('.', ',')) : '');
  const reserveValue = parseMoney(toReserve) || 0;
  const cats = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const value = parseMoney(amount);
  const sources = kind === 'expense' ? [...d.accounts.filter(a => !a.archived).map(a => ({id: a.id, label: a.name, card: false})), ...d.cards.filter(x => !x.archived).map(x => ({id: x.id, label: '💳 ' + x.name, card: true}))] : d.accounts.filter(a => !a.archived).map(a => ({id: a.id, label: a.name, card: false}));
  const plan = repeat === 'installments' && value ? installmentPlan(value, parts, date) : null;

  async function save() {
    if (isClosedMonth(monthOf(date)) || (tx.entity && !tx.virtual && tx.date && isClosedMonth(monthOf(tx.date)))) { setError(CLOSED_MSG); return; }
    if (!value || value <= 0) { setError('Digite o valor.'); return; }
    if (kind !== 'transfer' && !category) { setError('Escolha a categoria.'); return; }
    if (kind === 'transfer' && (!to || to === source)) { setError('Escolha a conta de destino.'); return; }
    if (value && reserveValue > value) { setError('O valor para o guardado passa do valor da receita.'); return; }
    setBusy(true); setError('');
    try {
      const card = d.cards.find(x => x.id === source);
      const base: Record<string, any> = {kind, amount: value, date, category: kind === 'transfer' ? 'Transferência' : category, account_id: card ? '' : source, to_account_id: kind === 'transfer' ? to : '',
        card_id: card ? card.id : '', invoice_month: card ? invoiceMonth(card, date) : '', paid: card ? false : paid, recurrence: repeat === 'monthly' ? 'monthly' : 'none', time: time || '', __content: note.trim()};
      const title = desc.trim() || (kind === 'transfer' ? 'Transferência' : category);
      const splitOk = kind === 'income' && !isCard && !!goalForSplit && (repeat === 'monthly' || paid);
      const editSplit = splitOk && reserveValue > 0 && value ? Math.min(reserveValue, value) : 0;
      if (editing) {
        // 0.3.225: editar um item muda a tela NA HORA (valor, totais de Receitas/Despesas, previsto) e fecha;
        // a gravacao no servidor segue por tras. Se falhar, avisa e volta ao que esta no servidor.
        if (onOptimistic && tx.id) {
          onOptimistic(tx.id, {kind, amount: value, desc: title, date, category: base.category, paid: base.paid, accountId: base.account_id, cardId: base.card_id, time: base.time, recurrence: base.recurrence});
          onClose();
          void (async () => {
            try {
              const savedTx = await saveEntity(api, 'fin_tx', title, {...base, ...(kind === 'income' ? {reserve_part: editSplit > 0 ? editSplit : ''} : {})}, tx.entity);
              if (kind === 'income' && goalForSplit) await syncIncomeReserve(api, d, savedTx.id, goalForSplit.id, editSplit, paid && !isCard, date, title);
            } catch (e) { appAlert('Não consegui salvar', errorText(e) + ' Os valores voltaram ao que está salvo.'); }
            onSaved();
          })();
          return;
        }
        const savedTx = await saveEntity(api, 'fin_tx', title, {...base, ...(kind === 'income' ? {reserve_part: editSplit > 0 ? editSplit : ''} : {})}, tx.entity);
        if (kind === 'income' && goalForSplit) await syncIncomeReserve(api, d, savedTx.id, goalForSplit.id, editSplit, paid && !isCard, date, title);
      }
      else if (plan && parts > 1) {
        const series = uid();
        for (const p of plan) await saveEntity(api, 'fin_tx', title + ' (' + p.installment + '/' + parts + ')', {...base, amount: p.amount, date: p.date, invoice_month: card ? invoiceMonth(card, p.date) : '', paid: card ? false : p.installment === 1 ? paid : false, series_id: series, installment: p.installment, installments: parts, recurrence: 'none'});
      } else {
        const split = editSplit;
        const saved = await saveEntity(api, 'fin_tx', title, {...base, ...(tx.virtual ? {series_id: tx.seriesId, recurrence: 'none'} : {}), ...(split ? {reserve_part: split} : {})});
        if (split && goalForSplit && paid) {
          try { await syncIncomeReserve(api, d, saved.id, goalForSplit.id, split, true, date, title); }
          catch (e) { await api.deleteEntity(saved.id).catch(() => {}); throw e; }
        }
      }
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function remove() {
    if (!tx.entity) return;
    // 0.3.217: avisa quando a receita mandou uma parte para o guardado (o aporte ligado a ela acompanha)
    const guarded = tx.kind === 'income' && (tx.reservePart || 0) > 0 ? money(tx.reservePart || 0) : '';
    // 0.3.178/0.3.181: pagamento de CONTA FIXA (inclusive a 1a vez dela). Apagar no historico desfaz o
    // pagamento: a conta volta para Pendentes como "a pagar". Conta avulsa paga e apagada sai de vez.
    if (tx.manualDue && tx.paid && (tx.recurrence === 'monthly' || !!tx.seriesId)) {
      const kind = tx.kind === 'income' ? 'recebimento' : 'pagamento';
      appAlert('Desfazer o ' + kind + '?', '“' + tx.desc + '” sai do histórico e volta para Pendentes como ' + (tx.kind === 'income' ? 'a receber' : 'a pagar') + '.' + (guarded ? ' A parte de ' + guarded + ' que foi para o guardado também sai de lá até você receber de novo.' : ''),
        [{text: 'Cancelar', style: 'cancel'}, {text: 'Desfazer', style: 'destructive', onPress: () => void (async () => {
          try { await api.saveEntity({...tx.entity!, data: {...tx.entity!.data, paid: false, paid_at: ''}}); const g = reserveOf(d.goals); if (g && tx.kind === 'income') await syncIncomeReserve(api, d, tx.entity!.id, g.id, 0, false, tx.date || '', tx.desc || ''); onSaved(); } catch (e) { setError(errorText(e)); }
        })()}]);
      return;
    }
    const series = tx.seriesId;
    const others = series ? d.txs.filter(x => x.seriesId === series && x.id !== tx.id) : [];
    const del = async (all: boolean) => {
      if (tx.date && !tx.virtual && isClosedMonth(monthOf(tx.date))) { setError(CLOSED_MSG); return; }
      // 0.3.226: apagar some da tela na hora (item, total, Historico); o servidor apaga por tras
      if (onOptimisticRemove && tx.id && tx.entity) { const id = tx.entity.id, rest = all ? others.filter(o => o.entity && !o.paid).map(o => o.entity!.id) : [];
        onOptimisticRemove(tx.id); for (const o of all ? others.filter(o => o.entity && !o.paid) : []) onOptimisticRemove(o.id); onClose();
        void (async () => { try { await api.deleteEntity(id); for (const r of rest) await api.deleteEntity(r); } catch (e) { appAlert('Não consegui apagar', errorText(e) + ' O item voltou.'); } onSaved(); })(); return; }
      try { await api.deleteEntity(tx.entity!.id); if (all) for (const o of others) if (o.entity && !o.paid) await api.deleteEntity(o.entity.id); onSaved(); } catch (e) { setError(errorText(e)); } };
    appAlert('Apagar lançamento?', others.length ? 'Este lançamento faz parte de uma série.' : 'Essa ação não pode ser desfeita.' + (guarded ? ' A parte de ' + guarded + ' que foi para o guardado também é apagada do guardado (só esse aporte; os seus outros aportes não mudam).' : ''), others.length
      ? [{text: 'Cancelar', style: 'cancel'}, {text: 'Só este', onPress: () => void del(false)}, {text: 'Este e os pendentes', style: 'destructive', onPress: () => void del(true)}]
      : [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => void del(false)}]);
  }
  // A abinha selecionada tem fundo branco fixo, então o texto dela precisa de uma cor sempre
  // escura o bastante contra branco — a própria cor do destaque no modo claro serve bem para isso,
  // mesmo no app em modo escuro (é só o texto dessa abinha, não muda o resto da tela).
  const head = kind === 'income' ? GOOD : kind === 'transfer' ? '#4fa3ff' : c.accent, headText = head === c.accent ? c.onAccent : '#fff', selectedTabText = head === c.accent ? light.accent : head;
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex: 1, backgroundColor: c.bg}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{backgroundColor: head, paddingTop: 40, paddingBottom: 18, paddingHorizontal: 16, gap: 12}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={{padding: 8}}><Text style={{color: headText, fontSize: 18}}>✕</Text></Pressable>
            <Text style={{flex: 1, color: headText, fontWeight: '700', fontSize: 17}}>{editing ? 'Editar' : tx.virtual ? 'Confirmar repetição' : 'Novo lançamento'}</Text>
            {editing ? <Pressable accessibilityLabel={tx.manualDue && tx.paid && (tx.recurrence === 'monthly' || !!tx.seriesId) ? "Desfazer pagamento" : "Apagar lançamento"} onPress={remove} style={{padding: 8}}><Icon name="trash" size={20} color={headText} /></Pressable> : null}
          </View>
          {/* 0.3.255: tocar num item do Historico mostra quando ele foi lancado (data e hora) */}
          {editing && addedAt(tx) ? <Text testID="tx-added-at" style={{color: headText + 'cc', fontSize: 12, marginTop: -4}}>Lançado em {addedAt(tx)}{tx.paidAt && tx.paid ? ' · pago em ' + tx.paidAt.slice(0, 10).split('-').reverse().join('/') : ''}</Text> : null}
          {!editing ? (
            <View style={{flexDirection: 'row', backgroundColor: headText + '26', borderRadius: 99, padding: 3}}>
              {([['expense', 'Despesa'], ['income', 'Receita'], ['transfer', 'Transferência']] as Array<[TxKind, string]>).map(([k, l]) => (
                <Pressable key={k} onPress={() => { setKind(k); setCategory(''); if (k !== 'expense' && d.cards.some(x => x.id === source)) setSource(firstAccount); }} style={{flex: 1, paddingVertical: 7, borderRadius: 99, backgroundColor: kind === k ? '#fff' : 'transparent', alignItems: 'center'}}>
                  <Text style={{color: kind === k ? selectedTabText : headText, fontWeight: '700', fontSize: 13}}>{l}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <Text style={{color: headText + 'cc', fontSize: 22}}>R$</Text>
            <TextInput accessibilityLabel="Valor" value={amount} onChangeText={v => setAmount(old => formatMoneyInput(v, old))} onBlur={() => setAmount(v => finishMoneyInput(v))} placeholder="0,00" placeholderTextColor={headText + '88'} keyboardType="decimal-pad" autoFocus={!editing}
              style={{flex: 1, color: headText, fontSize: 38, fontWeight: '800', padding: 0}} />
          </View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 16, paddingBottom: 40}}>
          <Field label="Nome" value={desc} onChange={setDesc} placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado do mês'} />
          <View style={{gap: 6}}><Text style={{fontSize: 12, color: c.muted}}>Descrição (opcional)</Text><TextInput accessibilityLabel="Descrição" value={note} onChangeText={setNote} placeholder="Uma observação breve" placeholderTextColor={c.muted} multiline maxLength={280} style={{minHeight: 44, maxHeight: 88, color: c.text, backgroundColor: c.input, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top'}} /></View>
          {kind !== 'transfer' ? (
            <View style={{gap: 8}}>
              <Text style={{fontSize: 12, color: c.muted}}>Categoria</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {cats.map(cat => (
                  <Pressable key={cat.name} accessibilityRole="radio" accessibilityState={{checked: category === cat.name}} onPress={() => setCategory(cat.name)}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: category === cat.name ? cat.color : c.line, backgroundColor: category === cat.name ? cat.color + '22' : 'transparent'}}>
                    <Text>{cat.icon}</Text><Text style={{color: c.text, fontSize: 13}}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <View style={{gap: 8}}>
            <Text style={{fontSize: 12, color: c.muted}}>{kind === 'transfer' ? 'Sai de' : kind === 'income' ? 'Entra em' : 'Pago com'}</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {sources.map(s => <SurePressable key={s.id} accessibilityRole="button" accessibilityState={{selected: source === s.id}} onPress={() => setSource(s.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: source === s.id ? c.accent : c.input}}><Text style={{color: source === s.id ? '#fff' : c.text, fontSize: 13, fontWeight: '600'}}>{s.label}</Text></SurePressable>)}
            </View>
            {isCard ? <Text style={{fontSize: 11, color: c.muted}}>Entra na fatura de {monthLabel(invoiceMonth(d.cards.find(x => x.id === source)!, date)).toLowerCase()}.</Text> : null}
          </View>
          {kind === 'transfer' ? (
            <View style={{gap: 8}}>
              <Text style={{fontSize: 12, color: c.muted}}>Vai para</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {d.accounts.filter(a => !a.archived && a.id !== source).map(a => <SurePressable key={a.id} accessibilityRole="button" onPress={() => setTo(a.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: to === a.id ? c.accent : c.input}}><Text style={{color: to === a.id ? '#fff' : c.text, fontSize: 13, fontWeight: '600'}}>{a.name}</Text></SurePressable>)}
              </View>
              {d.accounts.filter(a => !a.archived).length < 2 ? <Text style={{fontSize: 12, color: c.muted}}>Crie uma segunda conta em ⚙ para transferir.</Text> : null}
            </View>
          ) : null}
          <View style={{flexDirection: 'row', gap: 8}}>
            {[['Hoje', todayISO()], ['Ontem', addDays(todayISO(), -1)]].map(([l, v]) => <Pressable key={l} onPress={() => setDate(v)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: date === v ? c.accent : c.input}}><Text style={{color: date === v ? '#fff' : c.text, fontWeight: '600', fontSize: 13}}>{l}</Text></Pressable>)}
          </View>
          <DateTimeField label="Data" value={date} onChange={v => v && setDate(v)} dateOnly allowClear={false} />
          <DateTimeField label="Horário (opcional)" value={time} onChange={v => setTime(v ? String(v).slice(0, 5) : '')} timeOnly emptyLabel="Sem horário" />
          {!isCard && kind !== 'transfer' ? (
            <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 15}}>{kind === 'income' ? 'Já recebi' : 'Já paguei'}</Text><Switch value={paid} onValueChange={setPaid} /></View>
          ) : null}
          {kind === 'income' && !isCard && goalForSplit && (repeat === 'monthly' || paid) ? (
            <View style={{gap: 6}}>
              <Text style={{fontSize: 12, color: c.muted}}>{repeat === 'monthly' ? 'Desta receita, quanto vai para o guardado todo mês? (R$)' : 'Desta receita, quanto vai para o guardado? (R$)'}</Text>
              <TextInput accessibilityLabel="Quanto vai para o guardado" value={toReserve} onChangeText={v => setToReserve(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
                style={{fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
              <Text style={{fontSize: 11, color: c.muted, lineHeight: 16}}>{reserveValue > 0 && value && value > 0 ? 'Ficam ' + money(Math.max(0, value - reserveValue)) + ' no saldo (somam ao Controle de gastos) e ' + money(Math.min(reserveValue, value)) + ' vão para o guardado.' : 'Deixe em branco para o valor todo ficar no saldo.'}</Text>
            </View>
          ) : null}
          {!editing && kind !== 'transfer' ? (
            <View style={{gap: 10}}>
              <Text style={{fontSize: 12, color: c.muted}}>Repetir</Text>
              <Chips value={repeat} onChange={setRepeat} options={[{value: 'none' as const, label: 'Não'}, {value: 'monthly' as const, label: 'Todo mês'}, ...(kind === 'expense' ? [{value: 'installments' as const, label: 'Parcelado'}] : [])]} />
              {repeat === 'monthly' ? <Text style={{fontSize: 12, color: c.muted}}>{tap('Aparece todo mês como previsto (aluguel, assinatura, salário). Você confirma com um toque quando pagar.')}</Text> : null}
              {repeat === 'installments' ? (
                <View style={{gap: 8}}>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                    {[2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(n => <Pressable key={n} onPress={() => setParts(n)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: parts === n ? c.accent : c.input}}><Text style={{color: parts === n ? '#fff' : c.text, fontWeight: '600'}}>{n}x</Text></Pressable>)}
                  </View>
                  {plan ? <Text style={{fontSize: 13, color: c.text}}>{parts}x de <Text style={{fontWeight: '700'}}>{money(plan[plan.length - 1].amount)}</Text> · última em {dateBR(plan[plan.length - 1].date)}/{plan[plan.length - 1].date.slice(0, 4)}</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          <Button title={editing ? 'Salvar alterações' : 'Salvar'} loading={busy} onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </MotionModal>
  );
}

// ============================ CARTÕES ============================
function CardsTab({d, month, api, reload, onTx, onManage, onNewBill}: {month: string; d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onManage: () => void; onNewBill?: (cardId: string) => void; onEditBill?: (t: Tx) => void}) {
  const c = useTheme(), cards = d.cards.filter(x => !x.archived);
  const [cardId, setCardId] = useState(cards[0]?.id || ''), card = cards.find(x => x.id === cardId) || cards[0];
  // 0.3.223: a fatura e a do mes escolhido no topo (trocou o mes, trocou a fatura); sem setas dentro dela
  const i = card ? invoiceForMonth(card, d.txs, month) : undefined;
  const [pick, setPick] = useState(false), [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false), linking = useRef(false);
  if (!card) return <Card_><Text style={{color: c.text, fontWeight: '700'}}>Nenhum cartão ainda</Text><Text style={{color: c.muted}}>Adicione seu cartão com limite, dia de fechamento e vencimento. A Sofia monta as faturas sozinha.</Text><Button title="Adicionar cartão" onPress={onManage} /></Card_>;
  const used = cardUsed(card, d.txs);
  const statusColor: Record<Invoice['status'], string> = {aberta: '#4fa3ff', fechada: WARN, paga: GOOD, vencida: BAD, futura: c.muted};
  async function pay(accountId: string) {
    if (!i) return;
    setPick(false); setBusy(true);
    try { await saveEntity(api, 'fin_tx', 'Fatura ' + card.name + ' ' + i.month.slice(5, 7) + '/' + i.month.slice(0, 4), {kind: 'card_payment', amount: Math.round((i.total - i.paid) * 100) / 100, date: todayISO(), card_id: card.id, invoice_month: i.month, account_id: accountId, paid: true, category: 'Fatura do cartão'}); await reload(); }
    catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  return (
    <>
      {cards.length > 1 ? <Chips scroll value={card.id} onChange={setCardId} options={cards.map(x => ({value: x.id, label: x.name}))} /> : null}
      <View style={{backgroundColor: card.color, borderRadius: 22, padding: 18, gap: 10}}>
        <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>💳 {card.name}</Text>
        <Text style={{color: '#ffffffcc', fontSize: 12}}>Limite {money(card.limit)} · usado {money(used)} · {card.limit && used > card.limit ? <Text style={{color: '#fff', fontWeight: '800', backgroundColor: BAD, borderRadius: 6}}> passou {money(used - card.limit)} do limite </Text> : 'disponível ' + money(Math.max(0, card.limit - used))}</Text>
        <View style={{height: 8, borderRadius: 4, backgroundColor: '#ffffff44', overflow: 'hidden'}}><View style={{width: `${Math.min(100, card.limit ? used / card.limit * 100 : 0)}%`, height: 8, backgroundColor: '#fff'}} /></View>
        <Text style={{color: '#ffffffcc', fontSize: 11}}>Fecha dia {card.closing} · vence dia {card.due}</Text>
      </View>
      {i ? (
        <Card_>
          <View style={{alignItems: 'center'}}>
              <Text style={{color: c.text, fontWeight: '700'}}>Fatura de {monthLabel(i.month).toLowerCase()}</Text>
              <View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: statusColor[i.status] + '22', marginTop: 4}}><Text style={{color: statusColor[i.status], fontWeight: '700', fontSize: 11}}>{i.status.toUpperCase()}</Text></View>
          </View>
          <Text style={{color: c.text, fontSize: 30, fontWeight: '800', textAlign: 'center'}}>{money(i.total)}</Text>
          <Text style={{color: c.muted, fontSize: 12, textAlign: 'center'}}>{i.status === 'fechada' || i.status === 'paga' ? 'Fechou' : 'Fecha'} {dateBR(i.close)} · {i.status !== 'paga' && todayISO() > i.due ? <Text style={{color: BAD, fontWeight: '700'}}>venceu {dateBR(i.due)}</Text> : 'vence ' + dateBR(i.due)}{i.paid ? ' · pago ' + money(i.paid) : ''}</Text>
          {i.total > i.paid && i.status !== 'futura' && i.status !== 'paga' ? <Button title={busy ? 'Pagando…' : 'Pagar fatura · ' + money(i.total - i.paid)} loading={busy} onPress={() => d.accounts.filter(a => !a.archived).length > 1 ? setPick(true) : void pay(card.accountId || d.accounts[0].id)} /> : null}
          {i.items.length ? i.items.map((t, k) => <TxRow key={t.id} t={t} d={d} first={k === 0} onPress={() => onTx(t)} api={api} reload={reload} inInvoice />) : <Text style={{color: c.muted, textAlign: 'center'}}>Nenhuma compra nesta fatura.</Text>}
          <View style={{flexDirection: 'row', gap: 8, marginTop: 4}}>
            <SurePressable accessibilityRole="button" disabled={busy} onPress={() => { if (!busy) setLinkOpen(true); }} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center'}}><Text style={{color: c.accent, fontWeight: '700', fontSize: 13}}>Usar conta existente</Text></SurePressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => onNewBill?.(card.id)} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center'}}><Text style={{color: c.onAccent, fontWeight: '700', fontSize: 13}}>Nova conta</Text></Pressable>
          </View>
        </Card_>
      ) : null}
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8}}>Pagar com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => void pay(a.id)} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 15}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>
      {/* 0.3.223: "Usar conta existente" - escolhe uma conta de Contas para passar a ser paga neste cartao */}
      {(() => { const candidates = d.txs.filter(t => !t.virtual && t.manualDue && t.kind === 'expense' && !t.cardId && ((t.recurrence === 'monthly' && !t.seriesId) || (t.recurrence === 'none' && !t.paid)));
        const link = async (t: Tx) => { if (linking.current) return; linking.current = true; setBusy(true); try { if (t.recurrence === 'monthly' && t.paid && t.entity) await startSeriesNextMonth(api, t, {card_id: card.id, invoice_month: ''}, t.desc); else if (t.entity) await saveEntity(api, 'fin_tx', t.desc, {card_id: card.id, invoice_month: '', paid: false}, t.entity); setLinkOpen(false); await reload(); } catch (e) { appAlert('Finanças', errorText(e)); } finally { linking.current = false; setBusy(false); } };
        return <>
          {linkOpen ? <Sheet visible onClose={() => setLinkOpen(false)} label="Fechar escolher conta">
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 10, paddingBottom: 18}}>
              <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Pagar no {card.name}</Text>
              <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Escolha a conta que passa a ser paga neste cartão. Conta fixa já paga este mês continua paga pela conta; o cartão vale a partir do mês que vem.</Text>
              {candidates.length ? candidates.map(t => <SurePressable key={t.id} accessibilityRole="button" disabled={busy} onPress={() => void link(t)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, backgroundColor: c.input}}>
                <View style={{flex: 1, gap: 2}}><Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{t.desc}</Text><Text style={{color: c.muted, fontSize: 11}}>{t.recurrence === 'monthly' ? 'todo mês, dia ' + Number(t.date.slice(8, 10)) : dateBR(t.date)}</Text></View>
                <Text style={{color: c.text, fontWeight: '700'}}>{money(t.amount)}</Text>
              </SurePressable>) : <Text style={{color: c.muted}}>Nenhuma conta a pagar em Contas para trazer para o cartão.</Text>}
            </ScrollView>
          </Sheet> : null}
        </>; })()}
    </>
  );
}

// ============================ PLANEJAMENTO ============================
function PlanTab({d, month, api, reload}: {d: Data; month: string; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), progress = budgetProgress(d.budgets, d.txs, month);
  const [budgetSheet, setBudgetSheet] = useState<Budget | 'new' | null>(null), [goalSheet, setGoalSheet] = useState<Goal | 'new' | null>(null), [deposit, setDeposit] = useState<Goal | null>(null);
  const totalLimit = d.budgets.reduce((s, b) => s + b.limit, 0), totalSpent = progress.reduce((s, p) => s + p.spent, 0);
  return (
    <>
      <Card_>
        <Title text="Orçamento do mês" action="+ Categoria" onAction={() => setBudgetSheet('new')} />
        {d.budgets.length ? (
          <>
            <Text style={{color: c.muted, fontSize: 12}}>{money(totalSpent)} gastos de {money(totalLimit)} planejados</Text>
            <Bar pct={totalLimit ? totalSpent / totalLimit : 0} color={totalSpent > totalLimit ? BAD : c.accent} />
            {progress.map(p => <Pressable key={p.budget.id} onPress={() => setBudgetSheet(p.budget)}><BudgetRow p={p} /></Pressable>)}
          </>
        ) : <Text style={{color: c.muted}}>Defina quanto quer gastar por mês em cada categoria. A Sofia mostra quanto ainda pode gastar e avisa quando passar de 80%.</Text>}
      </Card_>
      <Card_>
        <Title text="Objetivos" action="+ Objetivo" onAction={() => setGoalSheet('new')} />
        {d.goals.length ? d.goals.map(g => {
          const p = goalProgress(g);
          return (
            <Pressable key={g.id} onPress={() => setGoalSheet(g)} style={{gap: 6}}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontWeight: '600'}}>{g.done ? '✅ ' : '🎯 '}{g.name}</Text><Text style={{color: c.muted, fontSize: 12}}>{Math.round(p.pct * 100)}%</Text></View>
              <Bar pct={p.pct} color={g.color} />
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={{flex: 1, color: c.muted, fontSize: 11}}>{money(g.saved)} de {money(g.target)}{p.perMonth ? ' · guarde ' + money(p.perMonth) + '/mês até ' + dateBR(g.deadline) + '/' + g.deadline.slice(0, 4) : p.left ? ' · faltam ' + money(p.left) : ' · concluído!'}</Text>
                {p.left > 0 ? <Pressable onPress={() => setDeposit(g)} style={{paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: g.color + '22'}}><Text style={{color: g.color, fontWeight: '700', fontSize: 12}}>+ Guardar</Text></Pressable> : null}
              </View>
            </Pressable>
          );
        }) : <Text style={{color: c.muted}}>Viagem, reserva de emergência, um equipamento novo… A Sofia calcula quanto guardar por mês até o prazo.</Text>}
      </Card_>
      {budgetSheet ? <BudgetSheet api={api} budget={budgetSheet === 'new' ? null : budgetSheet} used={d.budgets.map(b => b.category)} onClose={() => setBudgetSheet(null)} onSaved={() => { setBudgetSheet(null); void reload(); }} /> : null}
      {goalSheet ? <GoalSheet api={api} goal={goalSheet === 'new' ? null : goalSheet} onClose={() => setGoalSheet(null)} onSaved={() => { setGoalSheet(null); void reload(); }} /> : null}
      {deposit ? <AmountSheet title={'Guardar em ' + deposit.name} onClose={() => setDeposit(null)} onSave={async v => { const saved = Math.round((deposit.saved + v) * 100) / 100; await saveEntity(api, 'fin_goal', deposit.name, {saved}, deposit.entity, saved >= deposit.target ? 'completed' : undefined); setDeposit(null); await reload(); }} /> : null}
    </>
  );
}
function AmountSheet({title, onClose, onSave}: {title: string; onClose: () => void; onSave: (v: number) => Promise<void>}) {
  const c = useTheme(), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose} label="Fechar">
      <View style={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{title}</Text>
        <Field label="Valor (R$)" value={text} onChange={setText} numeric big placeholder="0,00" />
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={async () => { const v = parseMoney(text); if (!v || v <= 0) { setError('Digite um valor.'); return; } setBusy(true); try { await onSave(v); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }} />
      </View>
    </Sheet>
  );
}
function BudgetSheet({api, budget, used, onClose, onSaved}: {api: SofiaApi; budget: Budget | null; used: string[]; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), [cat, setCat] = useState(budget?.category || ''), [limit, setLimit] = useState(budget ? finishMoneyInput(String(budget.limit).replace('.', ',')) : ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose} label="Fechar orçamento">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{budget ? 'Editar orçamento' : 'Novo orçamento'}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          {EXPENSE_CATEGORIES.filter(x => x.name === budget?.category || !used.includes(x.name)).map(x => <Pressable key={x.name} onPress={() => setCat(x.name)} style={{flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: cat === x.name ? x.color : c.line, backgroundColor: cat === x.name ? x.color + '22' : 'transparent'}}><Text>{x.icon}</Text><Text style={{color: c.text, fontSize: 13}}>{x.name}</Text></Pressable>)}
        </View>
        <Field label="Limite por mês (R$)" value={limit} onChange={setLimit} numeric placeholder="0,00" />
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={async () => { const v = parseMoney(limit); if (!cat || !v || v <= 0) { setError('Escolha a categoria e o limite.'); return; } setBusy(true); try { await saveEntity(api, 'fin_budget', cat, {category: cat, limit: v}, budget?.entity); onSaved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }} />
        {budget ? <Pressable onPress={async () => { await api.deleteEntity(budget.id).catch(() => undefined); onSaved(); }} style={{alignItems: 'center', padding: 10}}><Text style={{color: c.danger}}>Remover orçamento</Text></Pressable> : null}
      </ScrollView>
    </Sheet>
  );
}
function GoalSheet({api, goal, onClose, onSaved}: {api: SofiaApi; goal: Goal | null; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), [name, setName] = useState(goal?.name || ''), [target, setTarget] = useState(goal ? finishMoneyInput(String(goal.target).replace('.', ',')) : ''), [saved, setSaved] = useState(goal ? finishMoneyInput(String(goal.saved).replace('.', ',')) : '');
  const [deadline, setDeadline] = useState(goal?.deadline || ''), [color, setColor] = useState(goal?.color || FIN_COLORS[1]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Sheet visible onClose={onClose} label="Fechar objetivo">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{goal ? 'Editar objetivo' : 'Novo objetivo'}</Text>
        <Field label="Nome" value={name} onChange={setName} placeholder="Ex.: Reserva de emergência" />
        <Field label="Valor do objetivo (R$)" value={target} onChange={setTarget} numeric placeholder="0,00" />
        <Field label="Já guardado (R$)" value={saved} onChange={setSaved} numeric placeholder="0,00" />
        <DateTimeField label="Prazo (opcional)" value={deadline} onChange={setDeadline} dateOnly />
        <View style={{flexDirection: 'row', gap: 10}}>{FIN_COLORS.map(x => <Pressable key={x} onPress={() => setColor(x)} style={{width: 30, height: 30, borderRadius: 15, backgroundColor: x, borderWidth: color === x ? 3 : 0, borderColor: c.text}} />)}</View>
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={async () => {
          const t = parseMoney(target), s = saved.trim() ? parseMoney(saved) : 0;
          if (!name.trim() || !t || t <= 0 || s === null || s < 0) { setError('Preencha nome e valor.'); return; }
          setBusy(true); try { await saveEntity(api, 'fin_goal', name.trim(), {target: t, saved: s, deadline, color}, goal?.entity, s >= t ? 'completed' : 'active'); onSaved(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
        }} />
        {goal ? <Pressable onPress={async () => { await api.deleteEntity(goal.id).catch(() => undefined); onSaved(); }} style={{alignItems: 'center', padding: 10}}><Text style={{color: c.danger}}>Apagar objetivo</Text></Pressable> : null}
      </ScrollView>
    </Sheet>
  );
}

// ============================ RELATÓRIOS ============================
function Donut({slices, size = 170}: {slices: Array<{value: number; color: string}>; size?: number}) {
  const c = useTheme(), total = slices.reduce((s, x) => s + x.value, 0), r = size / 2 - 14, cx = size / 2, cy = size / 2;
  if (!total) return <View style={{width: size, height: size, borderRadius: size / 2, borderWidth: 24, borderColor: c.input}} />;
  let a0 = -Math.PI / 2;
  const arcs = slices.filter(x => x.value > 0).map((x, i) => {
    const a1 = a0 + x.value / total * Math.PI * 2 - 0.0001, large = a1 - a0 > Math.PI ? 1 : 0;
    const p = `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
    a0 = a1 + 0.0001;
    return <Path key={i} d={p} stroke={x.color} strokeWidth={24} fill="none" />;
  });
  return <Svg width={size} height={size}>{arcs}</Svg>;
}
/** 0.3.208: meta no Inicio, no mesmo estilo do Controle de gastos. Usa o cache criptografado de Financas e atualiza
 * por tras; sem meta configurada, nao aparece. */
/** 0.3.222: meta do guardado para o Inicio (cache criptografado e atualiza por tras); null sem meta configurada. */
export function useFinanceGoal(api: SofiaApi, refresh = true): GoalNumbers | null {
  // 0.3.240: nasce do ULTIMO estado conhecido (a Meta ja aparece no primeiro quadro, sem entrar depois e empurrar a tela);
  // so redesenha se os numeros mudaram; e a leitura de Financas espera como as outras do Inicio (nao compete com o 1o quadro).
  const [g, setG] = useCachedGoal(api, todayISO());
  useEffect(() => { if (!refresh) return; let live = true;
    // 0.3.243: a leitura LOCAL nunca esconde a Meta; so o servidor pode dizer "sem meta" (evita sumir e voltar)
    const show = (b: Bundle | null, fromServer: boolean) => { if (!live || !b) return; const dd = toData(b.items, b.carry), reserve = reserveOf(dd.goals);
      let next: GoalNumbers | null = null;
      if (reserve && Number(reserve.target) > 0) {
        const sp = moneySplit(reserve, dd.moves || [], dd.accounts, dd.txs, dd.cards, monthOf(todayISO()));
        next = {name: reserve.name || 'Sua meta', saved: sp.saved, target: Number(reserve.target), monthly: sp.planned || 0, deadline: String(reserve.entity?.data?.deadline || ''), today: todayISO()};
      }
      if (!next && !fromServer) return;
      setG(prev => keepIfSame(prev, next)); writeGoalWidget(api, {goal: next}); };
    void readCache(api).then(b => show(b, false)).catch(() => {});
    const cancel = scheduleIdleTask(() => { void loadAll(api, financeWindow(monthOf(todayISO()), 'home')).then(b => show(b, true)).catch(() => {}); });
    return () => { live = false; cancel(); }; }, [api, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  return g;
}
export function FinanceGoalHome({api, onOpen}: {api: SofiaApi; onOpen?: () => void}) {
  const g = useFinanceGoal(api);
  return g ? <GoalProgressCard g={g} compact onPress={onOpen} /> : null;
}
/** 0.3.208: secao dos Relatorios que abre e fecha; lembra como a pessoa deixou da ultima vez (aberta por padrao). */
const FOLD_KEY = 'sofia_fin_folds_v1';
let foldMemory: Record<string, boolean> | null = null;
// 0.3.227: as secoes dos Relatorios so desenham depois de saber se estavam abertas ou fechadas (antes abriam e,
// um instante depois, fechavam - a Meta piscava ao aparecer). A escolha ja e lida ao abrir Financas.
let foldLoading: Promise<void> | null = null;
function preloadFolds(): Promise<void> { if (foldMemory) return Promise.resolve(); if (!foldLoading) foldLoading = SecureStore.getItemAsync(FOLD_KEY).then(v => { try { foldMemory = JSON.parse(v || '{}') || {}; } catch { foldMemory = {}; } }).catch(() => { foldMemory = {}; }); return foldLoading; }
function Fold({id, title, children}: {id: string; title: string; children: React.ReactNode}) {
  const c = useTheme(), [open, setOpen] = useState<boolean | null>(foldMemory ? (foldMemory[id] ?? true) : null);
  useEffect(() => { if (open !== null) return; let alive = true; void preloadFolds().then(() => { if (alive) setOpen(foldMemory?.[id] ?? true); }); return () => { alive = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => { const next = !(open ?? true); setOpen(next); foldMemory = {...(foldMemory || {}), [id]: next}; void SecureStore.setItemAsync(FOLD_KEY, JSON.stringify(foldMemory)).catch(() => {}); };
  return <Card_>
    <Pressable accessibilityRole="button" accessibilityState={{expanded: !!open}} accessibilityLabel={(open ? 'Fechar ' : 'Abrir ') + title} onPress={toggle} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 16}}>{title}</Text>
      <Chevron open={!!open} />
    </Pressable>
    {open ? children : null}
  </Card_>;
}
function ReportsTab({d: full, month, reserve, api, reload}: {d: Data; month: string; reserve: Goal | null; api?: SofiaApi; reload?: () => Promise<void>}) {
  const c = useTheme(), [kind, setKind] = useState<'expense' | 'income'>('expense');
  // 0.3.194: botao para recomecar os relatorios a partir de hoje (ponto de partida). Nada e apagado.
  const accounts = full.accounts.filter(a => !a.archived);
  const starts = [...new Set(accounts.map(a => a.reportStart).filter(Boolean))].sort();
  const startLabel = starts.length ? starts[starts.length - 1].split('-').reverse().join('/') : '';
  const d = useMemo(() => ({...full, txs: sinceReportStart(full.accounts, full.txs), moves: (full.moves || []).filter(m => !starts.length || m.date >= starts[0])}), [full]);
  // saldo e guardado sao valores absolutos: vem do historico inteiro, mas o grafico so mostra a partir do ponto de partida
  const startMs = starts.length ? Date.parse(starts[starts.length - 1] + 'T00:00:00Z') : 0;
  const fromStart = (pts: Array<{t: number; v: number}>) => pts.filter(p => p.t >= startMs);
  const [resetBusy, setResetBusy] = useState(false);
  // 0.3.208: meta do guardado com progresso, marcos e projecao
  const goal = useMemo(() => { if (!reserve || !(Number(reserve.target) > 0)) return null; const sp = moneySplit(reserve, full.moves || [], full.accounts, full.txs, full.cards, monthOf(todayISO()));
    return {name: reserve.name || 'Sua meta', saved: sp.saved, target: Number(reserve.target), monthly: sp.planned || 0, deadline: String(reserve.entity?.data?.deadline || ''), today: todayISO()}; }, [reserve, full]);
  // 0.3.227: so despesas avulsas (sem contas, fixas e parcelas)
  const week = useMemo(() => lastWeekByCategory(full.txs.filter(t => !t.manualDue && t.recurrence === 'none' && !t.seriesId), ''), [full]);
  function setStart(date: string) {
    if (!api) return;
    const go = async () => {
      setResetBusy(true);
      try { await Promise.all(accounts.map(a => api.saveEntity({...a.entity, data: {...a.entity.data, report_start: date}}))); await reload?.(); }
      catch (e) { appAlert('Finanças', errorText(e)); } finally { setResetBusy(false); }
    };
    if (!date) { void go(); return; }
    appAlert('Recomeçar os relatórios a partir de hoje?', 'Os gráficos e totais passam a contar a partir de ' + date.split('-').reverse().join('/') + '. Nada é apagado: os lançamentos de antes continuam no Histórico e no Saldo, e dá para voltar ao histórico completo quando quiser.',
      [{text: 'Cancelar', style: 'cancel'}, {text: 'Recomeçar', onPress: () => void go()}]);
  }
  const cats = useMemo(() => byCategory(d.txs, month, kind), [d, month, kind]), total = cats.reduce((s, x) => s + x.total, 0);
  const {t6, s, prev, bal, saved} = useMemo(() => ({t6: trend(d.txs, month, 6), s: monthSummary(d.txs, month), prev: monthSummary(d.txs, addMonths(month, -1)), bal: fromStart(balanceSeries(full.accounts, full.txs, month, reserve ? {goalId: reserve.id, moves: full.moves || []} : undefined)), saved: reserve ? fromStart(reserveSeries(reserve, full.moves || [], month)) : []}), [d, full, month, reserve]);
  const max = Math.max(1, ...t6.flatMap(x => [x.income, x.expense]));
  const [w, setW] = useState(0);
  return (
    <>
      {/* 0.3.223: ordem - Por categoria, Evolucao do guardado, Dinheiro guardado, Evolucao do saldo; depois semana, comparado e 6 meses */}
      <Fold id="categorias" title="Por categoria">
        <View style={{alignSelf: 'flex-start'}}><Chips value={kind} onChange={setKind} options={[{value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}]} /></View>
        <View style={{alignItems: 'center', justifyContent: 'center'}}>
          <Donut slices={cats.map(x => ({value: x.total, color: x.category.color}))} />
          <View style={{position: 'absolute', alignItems: 'center'}}><Text style={{color: c.muted, fontSize: 11}}>Total</Text><Text style={{color: c.text, fontWeight: '800', fontSize: 16}}>{money(total)}</Text></View>
        </View>
        {cats.length ? cats.map(x => (
          <View key={x.category.name} style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <Dot color={x.category.color} icon={x.category.icon} size={30} />
            <View style={{flex: 1, gap: 4}}><View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.text}}>{x.category.name}</Text><Text style={{color: c.text, fontWeight: '700'}}>{money(x.total)}</Text></View><Bar pct={x.pct} color={x.category.color} /></View>
            <Text style={{color: c.muted, fontSize: 11, width: 36, textAlign: 'right'}}>{Math.round(x.pct * 100)}%</Text>
          </View>
        )) : <Text style={{color: c.muted, textAlign: 'center'}}>Sem {kind === 'expense' ? 'despesas' : 'receitas'} neste mês.</Text>}
      </Fold>
      {saved.length > 1 ? (
        <Fold id="guardado" title="Evolução do guardado no mês">
          
          <PriceChart lines={[{id: 'guardado', color: GUARD, points: saved}]} height={160} window="all" mode="price" />
          <Text style={{color: c.muted, fontSize: 12}}>De {money(saved[0].v)} no início a {money(saved[saved.length - 1].v)} hoje.</Text>
        </Fold>
      ) : null}
      {goal ? <Fold id="meta" title="Dinheiro guardado"><GoalProgressCard g={goal} flat /></Fold> : null}
      {bal.length > 1 ? (
        <Fold id="saldo" title="Evolução do saldo no mês">
          
          <PriceChart lines={[{id: 'saldo', color: c.accent, points: bal}]} height={160} window="all" mode="price" />
        </Fold>
      ) : null}
      {week.lines.length ? <Fold id="semana" title="Semana passada">
        
        <Text style={{color: c.muted, fontSize: 12}}>{week.start.split('-').reverse().slice(0, 2).join('/')} a {week.end.split('-').reverse().slice(0, 2).join('/')} · {money(week.total)} em gastos</Text>
        {week.lines.slice(0, 6).map(l => <View key={l.category} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderColor: c.line}}>
          <Text style={{fontSize: 16}}>{categoryOf(l.category).icon}</Text>
          <Text style={{flex: 1, color: c.text, fontSize: 13}}>{l.category}</Text>
          {l.change !== null ? <Text style={{color: l.change > 0.3 ? WARN : l.change < -0.1 ? GOOD : c.muted, fontSize: 11, fontWeight: '700'}}>{l.change > 0 ? '+' : ''}{Math.round(l.change * 100)}% vs média</Text> : <Text style={{color: c.muted, fontSize: 11}}>novo</Text>}
          <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>{money(l.total)}</Text>
        </View>)}
      </Fold> : null}
      <Fold id="seis" title="Receitas × despesas · 6 meses">
        
        <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{height: 150}}>
          {w ? <Svg width={w} height={150}>
            <Line x1={0} x2={w} y1={130} y2={130} stroke={c.line} />
            {t6.map((m, i) => { const bw = w / t6.length, x = i * bw + bw * 0.18, h1 = m.income / max * 120, h2 = m.expense / max * 120; return <React.Fragment key={m.month}><Rect x={x} y={130 - h1} width={bw * 0.3} height={h1} rx={3} fill={GOOD} /><Rect x={x + bw * 0.33} y={130 - h2} width={bw * 0.3} height={h2} rx={3} fill={BAD} /></React.Fragment>; })}
          </Svg> : null}
        </View>
        <View style={{flexDirection: 'row'}}>{t6.map(m => <Text key={m.month} style={{flex: 1, textAlign: 'center', fontSize: 10, color: m.month === month ? c.text : c.muted, fontWeight: m.month === month ? '700' : '400'}}>{monthLabel(m.month).slice(0, 3)}</Text>)}</View>
        <View style={{flexDirection: 'row', gap: 14, justifyContent: 'center'}}><Text style={{color: GOOD, fontSize: 12}}>● Receitas</Text><Text style={{color: BAD, fontSize: 12}}>● Despesas</Text></View>
      </Fold>

    </>
  );
}

// ============================ 0.3.182: DETALHES DO SALDO, RECEITAS E DESPESAS ============================
/** Tocar no Saldo mostra de onde ele vem; tocar em Receitas ou Despesas lista as do mes. */
function MonthBreakdown({kind, d, month, show, net, onTx, onClose, api, accountId = '', reload, onPatch, onRemove}: {onPatch?: (id: string, ch: Partial<Tx>) => void; onRemove?: (id: string) => void; kind: 'saldo' | 'income' | 'expense'; d: Data; month: string; show: (v: number) => string; net: number; onTx: (t: Tx) => void; onClose: () => void; api?: SofiaApi; accountId?: string; reload?: () => Promise<void>}) {
  const c = useTheme();
  // 0.3.192: ajustar o Saldo para o valor real do banco. Muda o ponto de partida da conta (saldo inicial)
  // pela diferenca; nada e apagado e os lancamentos continuam contando a partir dali.
  const included = d.accounts.filter(a => a.include && !a.archived);
  const target = accountId ? d.accounts.find(a => a.id === accountId) : included.length === 1 ? included[0] : undefined;
  const [adjusting, setAdjusting] = useState(false), [real, setReal] = useState(''), [adjBusy, setAdjBusy] = useState(false), [adjError, setAdjError] = useState('');
  async function applyAdjust(current: number) {
    const v = parseMoney(real), st = parseMoney(startReal);
    if (v === null || !Number.isFinite(v)) { setAdjError('Informe o saldo atual.'); return; }
    if (st === null || !Number.isFinite(st)) { setAdjError('Informe o saldo no início do mês.'); return; }
    if (!target || !api) return;
    setAdjBusy(true); setAdjError('');
    try {
      // 0.3.214: saldo atual -> o Saldo; saldo no inicio do mes -> o 100% do Controle de gastos deste mes
      const diff = Math.round((v - current) * 100) / 100, starts = {...target.monthStarts, [month]: Math.round(st * 100) / 100};
      await api.saveEntity({...target.entity, data: {...target.entity.data, initial_balance: String(Math.round((target.initial - (target.carry || 0) + diff) * 100) / 100), balance_set_at: todayISO(), month_starts_json: JSON.stringify(starts)}});
      // 0.3.225: fecha primeiro e recarrega depois que a janela saiu (antes a tela de tras aparecia cortada)
      Keyboard.dismiss(); setAdjusting(false); onClose(); afterSheet(() => { void reload?.(); });
    } catch (e) { setAdjError(errorText(e)); } finally { setAdjBusy(false); }
  }
  const list = useMemo(() => monthTxs(d.txs, month).filter(t => t.paid && t.kind === kind).sort((a, b) => b.date.localeCompare(a.date)), [d, month, kind]);
  const [rowEdit, setRowEdit] = useState<string | null>(null), [rowAmount, setRowAmount] = useState(''), [rowError, setRowError] = useState('');
  function saveRow(t: Tx) {
    const v = parseMoney(rowAmount);
    if (v === null || !Number.isFinite(v) || v <= 0) { setRowError('Digite o valor.'); return; }
    if (!api || !t.entity || !onPatch) return;
    Keyboard.dismiss(); onPatch(t.id, {amount: v}); setRowEdit(null); setRowError('');
    const entity = t.entity;
    void (async () => { try { await saveFresh(api, t.desc, {amount: v}, entity); } catch (e) { appAlert('Não consegui salvar', errorText(e) + ' O valor voltou ao que está salvo.'); } await reload?.(); })();
  }
  function removeRow(t: Tx) {
    if (!api || !t.entity || !onRemove) return;
    const entity = t.entity;
    appAlert('Apagar ' + (t.kind === 'income' ? 'esta receita' : 'esta despesa') + '?', t.desc + ' · ' + show(t.amount) + ' sai do total e do Histórico.', [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Apagar', style: 'destructive', onPress: () => { Keyboard.dismiss(); onRemove(t.id); setRowEdit(null);
        void (async () => { try { await api.deleteEntity(entity.id); } catch (e) { appAlert('Não consegui apagar', errorText(e) + ' O item voltou.'); } await reload?.(); })(); }},
    ]);
  }
  const total = list.reduce((s, t) => s + t.amount, 0);
  const [ledgerOpen, setLedgerOpen] = useState(false), reserve = reserveOf(d.goals);
  const [changes, setChanges] = useState<SaldoChange[]>([]);
  useEffect(() => {
    if (kind !== 'saldo' || !api) return;
    let live = true;
    const keys = [...(accountId ? [accountId] : d.accounts.filter(a => a.include && !a.archived).map(a => a.id)), ...(net ? ['reserve'] : [])];
    void readSaldoStore(api).then(st => { if (live) setChanges(keys.flatMap(k => st.log[k] || []).sort((a, b) => b.at.localeCompare(a.at))); });
    return () => { live = false; };
  }, [kind, api, accountId, d, net]);
  const parts = useMemo(() => {
    if (kind !== 'saldo') return null;
    const accounts = d.accounts.filter(a => a.include && !a.archived);
    const ids = new Set(accounts.map(a => a.id));
    const paid = d.txs.filter(t => t.paid && !t.virtual && ids.has(t.accountId) && !t.cardId);
    const initial = accounts.reduce((s, a) => s + a.initial, 0);
    const income = paid.filter(t => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = paid.filter(t => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    const cards = d.txs.filter(t => t.paid && t.kind === 'card_payment' && ids.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
    const total = totalBalance(d.accounts, d.txs) - net;
    // o que sobra para fechar a conta sao as transferencias entre contas (com conta fora do total)
    const transfers = Math.round((total + net - (initial + income - expense - cards)) * 100) / 100;
    const carry = Math.round(accounts.reduce((s, a) => s + (a.carry || 0), 0) * 100) / 100;
    // so o que esta na tela (o resto ja vem somado no acumulado dos meses anteriores)
    return {initial, income: income, expense, cards, transfers, total, carry};
  }, [kind, d, net]);
  // 0.3.222: extrato do saldo com o historico de mudancas (ajustes e alteracoes viram linhas, o passado fica como era)
  const ledger = useMemo(() => {
    if (!parts) return null;
    const ids = new Set(d.accounts.filter(a => a.include && !a.archived).map(a => a.id));
    const items: LedgerItem[] = [...d.txs.filter(t => t.paid && !t.virtual && ids.has(t.accountId) && !t.cardId && (t.kind === 'income' || t.kind === 'expense' || t.kind === 'card_payment')).map(t => ({id: t.id, date: t.date, desc: t.desc, delta: t.kind === 'income' ? t.amount : -t.amount, tx: t as Tx | null, note: t.manualDue ? 'conta' : /^(fitid:|h:)/.test(String(t.entity?.data?.import_id || '')) ? 'do extrato' : t.kind === 'card_payment' ? 'fatura' : ''})),
      ...d.txs.filter(t => t.paid && !t.virtual && t.kind === 'transfer' && (ids.has(t.accountId) !== ids.has(t.toAccountId))).map(t => ({id: t.id, date: t.date, desc: t.desc || 'Transferência', delta: ids.has(t.toAccountId) ? t.amount : -t.amount, tx: t as Tx | null, note: 'transferência'})),
      ...(reserve && net ? (d.moves || []).filter(m => m.goalId === reserve.id && m.entity?.state !== 'archived').map(m => ({id: 'move:' + m.id, date: m.date, desc: m.direction === 'in' ? 'Aporte no guardado' : 'Retirada do guardado', delta: m.direction === 'in' ? -m.amount : m.amount, tx: null as Tx | null, note: 'reserva'})) : [])];
    return saldoLedger(items, Math.round((parts.initial - parts.carry) * 100) / 100, parts.carry, changes, parts.total);
  }, [parts, d, reserve, net, changes]);
  const [startReal, setStartReal] = useState('');
  const monthStartGuess = useMemo(() => { if (!parts) return 0; const r = reserveOf(d.goals); return monthControl(d.txs, d.moves || [], r?.id || '', month, accountId, parts.total, null).start; }, [parts, d, month, accountId]);
  const row = (label: string, value: string, strong = false, color?: string) => <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4}}>
    <Text style={{color: strong ? c.text : c.muted, fontSize: strong ? 14 : 13, fontWeight: strong ? '800' : '400'}}>{label}</Text>
    <Text style={{color: color || c.text, fontSize: strong ? 15 : 13, fontWeight: strong ? '800' : '700'}}>{value}</Text></View>;
  return <Sheet visible onClose={onClose} label="Fechar detalhes">
    {/* 0.3.219: em Receitas/Despesas, o titulo e o valor ficam fixos no topo (fundo solido) e a lista rola por baixo */}
    <ScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={parts ? undefined : [0]} contentContainerStyle={{gap: 12, paddingBottom: 18}}>
      {parts ? <>
        <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Saldo</Text>
        {target && api ? (adjusting ? <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 10}}>
          <Text style={{color: c.text, fontWeight: '700'}}>Saldo no início de {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
          <TextInput accessibilityLabel="Saldo no início do mês" value={startReal} onChangeText={v => setStartReal(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
            style={{fontSize: 22, fontWeight: '800', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.surface}} />
          <Text style={{color: c.text, fontWeight: '700'}}>Saldo atual</Text>
          <TextInput accessibilityLabel="Saldo atual" value={real} onChangeText={v => setReal(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
            style={{fontSize: 22, fontWeight: '800', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.surface}} />
          <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>O saldo atual é o que aparece no Saldo. O do início do mês é de onde o Controle de gastos parte: ele compara quanto você tinha com quanto tem agora. Nenhum lançamento é apagado.</Text>
          {adjError ? <Text style={{color: BAD}}>{adjError}</Text> : null}
          <Button title="Salvar" loading={adjBusy} onPress={() => void applyAdjust(parts.total)} />
          <Pressable accessibilityRole="button" onPress={() => setAdjusting(false)}><Text style={{color: c.muted, textAlign: 'center'}}>Cancelar</Text></Pressable>
        </View> : <Button title="Ajustar saldo" secondary onPress={() => { setReal(finishMoneyInput(String(parts.total).replace('.', ','))); setStartReal(finishMoneyInput(String(target.monthStarts[month] ?? monthStartGuess).replace('.', ','))); setAdjusting(true); }} />)
          : <Text style={{color: c.muted, fontSize: 12}}>Para ajustar o saldo, escolha uma conta no topo.</Text>}
        <Text style={{fontSize: 15, fontWeight: '800', color: c.text, marginTop: 6}}>Como o saldo é calculado</Text>
        <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 2}}>
          {row('Ponto de partida (saldo inicial e ajustes)', show(parts.initial - parts.carry))}
          {parts.carry ? row((parts.carry > 0 ? '+' : '−') + ' Lançamentos de meses anteriores', show(Math.abs(parts.carry)), false, parts.carry > 0 ? GOOD : BAD) : null}
          {parts.initial ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16, marginBottom: 4}}>Não é um lançamento: é o saldo inicial da conta, já com os ajustes ao valor do banco. Muda pelo botão acima ou em Contas e cartões → conta.</Text> : null}
          {row('+ Receitas recebidas', show(parts.income), false, GOOD)}
          {row('− Despesas pagas', show(parts.expense), false, BAD)}
          {parts.cards ? row('− Faturas de cartão pagas', show(parts.cards), false, BAD) : null}
          {parts.transfers ? row((parts.transfers > 0 ? '+' : '−') + ' Transferências entre contas', show(Math.abs(parts.transfers)), false, parts.transfers > 0 ? GOOD : BAD) : null}
          {net ? row(net > 0 ? '− Guardado (aportes − retiradas)' : '+ Retirado da reserva', show(Math.abs(net)), false, net > 0 ? BAD : GOOD) : null}
          <View style={{height: 1, backgroundColor: c.line, marginVertical: 6}} />
          {row('= Saldo', show(parts.total), true)}
        </View>
        {/* 0.3.225: extrato do saldo retirado a pedido do Pedro */}
        {ledgerOpen && parts && ledger ? <View style={{backgroundColor: c.input, borderRadius: 16, padding: 12, gap: 4}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '700', fontSize: 12}}>Ponto de partida</Text><Text style={{color: c.text, fontWeight: '800', fontSize: 12}}>{show(ledger.start)}</Text></View>
          {ledger.carry ? <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Lançamentos de meses anteriores (somados)</Text><Text style={{color: ledger.carry > 0 ? GOOD : BAD, fontWeight: '700', fontSize: 12}}>{ledger.carry > 0 ? '+' : '−'}{show(Math.abs(ledger.carry))}</Text></View> : null}
          {ledger.rows.map(r => <Pressable key={r.id} accessibilityRole="button" disabled={!r.tx} onPress={() => { if (r.tx) onTx(r.tx); }} style={{flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderColor: c.line, backgroundColor: r.change ? WARN + '14' : 'transparent'}}>
            <Text style={{color: c.muted, fontSize: 11, width: 38}}>{r.date.slice(8, 10)}/{r.date.slice(5, 7)}</Text>
            <Text numberOfLines={2} style={{flex: 1, color: c.text, fontSize: 12}}>{r.desc}{r.note ? <Text style={{color: r.change ? WARN : c.muted}}> · {r.note}</Text> : null}</Text>
            <Text style={{color: r.delta >= 0 ? GOOD : BAD, fontSize: 12, fontWeight: '700'}}>{r.delta >= 0 ? '+' : '−'}{show(Math.abs(r.delta))}</Text>
            <Text style={{color: r.run < 0 ? BAD : c.text, fontSize: 11, width: 76, textAlign: 'right'}}>{show(r.run)}</Text>
          </Pressable>)}
          <Text style={{color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 6}}>{tap('Funciona como o extrato do banco: o que já passou não muda. Ajustes e alterações entram como uma linha nova, na hora em que aconteceram, com quanto mudou e quanto ficou. A última coluna é o saldo depois de cada linha. Toque num item para corrigir ou apagar.')}</Text>
        </View> : null}
        <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{tap('Soma de tudo o que já foi pago ou recebido nas contas (não só deste mês). Se algum valor parecer errado, toque em Receitas ou Despesas para ver os lançamentos, ou confira o saldo inicial da conta em Contas e cartões.')}</Text>
      </> : <View style={{backgroundColor: c.surface, paddingBottom: 10, gap: 2, borderBottomWidth: 1, borderColor: c.line}}>
        <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>{kind === 'income' ? 'Receitas' : 'Despesas'} de {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
        <Text style={{color: kind === 'income' ? GOOD : BAD, fontWeight: '800', fontSize: 22}}>{show(total)}</Text>
      </View>}
      {parts ? null : <View>
        {/* 0.3.226: editar o valor ou apagar o item AQUI DENTRO; o item, o total e o Historico mudam na hora */}
        {list.length ? list.map((t, i) => rowEdit === t.id ? <View key={t.id} style={{gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
          <Text numberOfLines={1} style={{color: c.text, fontWeight: '700'}}>{categoryOf(t.category).icon}  {t.desc}</Text>
          <TextInput accessibilityLabel={'Valor de ' + t.desc} autoFocus value={rowAmount} onChangeText={v => setRowAmount(old => formatMoneyInput(v, old))} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={c.muted}
            style={{fontSize: 22, fontWeight: '800', color: c.text, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, backgroundColor: c.input}} />
          {rowError ? <Text style={{color: BAD}}>{rowError}</Text> : null}
          <View style={{flexDirection: 'row', gap: 8}}>
            <View style={{flex: 1}}><Button title="Salvar" onPress={() => saveRow(t)} /></View>
            <View style={{flex: 1}}><Button title="Apagar" secondary onPress={() => removeRow(t)} /></View>
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Pressable accessibilityRole="button" onPress={() => onTx(t)} style={{paddingVertical: 6}}><Text style={{color: c.accent, fontWeight: '700'}}>Mais opções</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRowEdit(null); setRowError(''); }} style={{paddingVertical: 6}}><Text style={{color: c.muted}}>Cancelar</Text></Pressable>
          </View>
        </View> : <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={'Editar ' + t.desc} onPress={() => { if (isClosedMonth(monthOf(t.date))) { appAlert('Mês fechado', CLOSED_MSG); return; } if (onPatch && t.entity) { setRowEdit(t.id); setRowError(''); setRowAmount(finishMoneyInput(String(t.amount).replace('.', ','))); } else onTx(t); }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
          <Text style={{fontSize: 18}}>{categoryOf(t.category).icon}</Text>
          <View style={{flex: 1, gap: 2}}>
            <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{t.desc}</Text>
            <Text style={{color: c.muted, fontSize: 11}}>{t.date.split('-').reverse().slice(0, 2).join('/')} · {t.category}</Text>
          </View>
          <Text style={{color: kind === 'income' ? GOOD : BAD, fontWeight: '700'}}>{kind === 'income' ? '+' : '−'}{show(t.amount)}</Text>
        </Pressable>) : <Text style={{color: c.muted}}>Nenhuma {kind === 'income' ? 'receita' : 'despesa'} paga neste mês.</Text>}
      </View>}
    </ScrollView>
  </Sheet>;
}

// ============================ 0.3.182: RECUPERAR APAGADOS ============================
function ManageSheet({api, d, onClose, reload, onFinished}: {api: SofiaApi; d: Data; onClose: () => void; reload: () => Promise<void>; onFinished?: () => void}) {
  const c = useTheme(), [edit, setEdit] = useState<{type: 'account'; item: Account | null} | {type: 'card'; item: Card | null} | null>(null);
  const [resetting, setResetting] = useState(false), [resetWord, setResetWord] = useState(''), [resetBusy, setResetBusy] = useState(false);
  const [setup, setSetup] = useState(false), [recover, setRecover] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{paddingTop: 40, paddingBottom: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line}}>
          <IconButton name="back" label="Voltar" onPress={onClose} /><Text style={{flex: 1, fontSize: 17, fontWeight: '700', color: c.text}}>Contas e cartões</Text>
        </View>
        {setup ? <Onboarding api={api} onDone={reload} onClose={() => setSetup(false)} onFinished={() => { setSetup(false); onFinished ? onFinished() : onClose(); }} existing={{account: d.accounts.find(a => !a.archived) || null, reserve: reserveOf(d.goals), fixed: d.txs.filter(t => t.manualDue && t.recurrence === 'monthly' && !t.virtual && t.kind === 'expense' && t.entity?.state !== 'archived'),
            salary: d.txs.filter(t => !t.virtual && t.kind === 'income' && t.recurrence === 'monthly' && !t.seriesId && t.entity?.state !== 'archived').sort((a, b) => b.amount - a.amount)[0] || null}} /> :
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 18, gap: 14}}>
          {/* 0.3.223: Redefinir Financas - apaga tudo e abre o passo a passo do zero */}
          <View style={{backgroundColor: c.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.line, gap: 10}}>
            <View style={{gap: 2}}><Text style={{color: c.text, fontWeight: '700', fontSize: 14}}>Redefinir Finanças</Text><Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Apaga contas, cartões, lançamentos, reserva e metas. Você recomeça do zero, pelo passo a passo ou mandando seus prints para a Sofia.</Text></View>
            {resetting ? <View style={{gap: 8}}>
              <TextInput accessibilityLabel="Confirmação para zerar" value={resetWord} onChangeText={setResetWord} autoCapitalize="characters" placeholder="Digite REDEFINIR" placeholderTextColor={c.muted} style={{color: c.text, backgroundColor: c.input, borderRadius: 12, padding: 12, fontSize: 16, letterSpacing: 2}} />
              <View style={{flexDirection: 'row', gap: 8}}>
                <Pressable accessibilityRole="button" disabled={resetWord.trim().toUpperCase() !== 'REDEFINIR' || resetBusy} onPress={() => { setResetBusy(true); void api.financeReset().then(async () => { await clearAllFormDrafts(); setResetBusy(false); setResetting(false); void reload(); onClose(); }).catch(e => { setResetBusy(false); appAlert('Finanças', errorText(e)); }); }} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: resetWord.trim().toUpperCase() === 'REDEFINIR' ? BAD : c.line, alignItems: 'center'}}>{resetBusy ? <ActivityIndicator color="#fff" /> : <Text style={{color: '#fff', fontWeight: '800'}}>Redefinir</Text>}</Pressable>
                <Pressable accessibilityRole="button" onPress={() => setResetting(false)} style={{flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: c.input, alignItems: 'center'}}><Text style={{color: c.text, fontWeight: '700'}}>Cancelar</Text></Pressable>
              </View>
            </View> : <Pressable accessibilityRole="button" onPress={() => { setResetWord(''); setResetting(true); }} style={{paddingVertical: 10, borderRadius: 12, backgroundColor: BAD + '1f', alignItems: 'center'}}><Text style={{color: BAD, fontWeight: '700', fontSize: 13}}>Redefinir Finanças</Text></Pressable>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSetup(true)} style={{backgroundColor: c.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 10}}>
            <View style={{flex: 1, gap: 2}}>
              <Text style={{color: c.text, fontWeight: '700', fontSize: 14}}>Refazer a configuração</Text>
              <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Passo a passo com o que você já tem: conta, dia do recebimento, contas fixas, guardado, aporte e meta. Nada é apagado.</Text>
            </View>
            <Text style={{color: c.muted}}>›</Text>
          </Pressable>
          <Card_>
            <Title text="Contas" action="+ Conta" onAction={() => setEdit({type: 'account', item: null})} />
            {d.accounts.map(a => <Pressable key={a.id} onPress={() => setEdit({type: 'account', item: a})} style={{flexDirection: 'row', alignItems: 'center', gap: 10, opacity: a.archived ? 0.5 : 1}}><View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: a.color}} /><Text style={{flex: 1, color: c.text}}>{a.name}{a.archived ? ' (arquivada)' : ''}</Text><Text style={{color: c.muted}}>{money(accountBalance(a, d.txs))}</Text></Pressable>)}
          </Card_>
          <Card_>
            <Title text="Cartões de crédito" action="+ Cartão" onAction={() => setEdit({type: 'card', item: null})} />
            {d.cards.filter(x=>!x.archived || showArchived).length ? d.cards.filter(x=>!x.archived || showArchived).map(x => <Pressable key={x.id} onPress={() => setEdit({type: 'card', item: x})} style={{flexDirection: 'row', alignItems: 'center', gap: 10, opacity: x.archived ? 0.5 : 1}}><View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: x.color}} /><Text style={{flex: 1, color: c.text}}>{x.name}</Text><Text style={{color: c.muted, fontSize: 12}}>{x.archived ? 'removido · ' : ''}fecha {x.closing} · vence {x.due}</Text></Pressable>) : <Text style={{color: c.muted}}>Nenhum cartão.</Text>}
            {d.cards.some(x=>x.archived)?<Pressable accessibilityRole="button" onPress={()=>setShowArchived(v=>!v)}><Text style={{color:c.accent,fontSize:12}}>{showArchived?'Ocultar cartões removidos':'Mostrar cartões removidos'}</Text></Pressable>:null}
          </Card_>
        </ScrollView>}
      </View>
      {edit ? <AccountCardSheet api={api} d={d} edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} /> : null}
    </MotionModal>
  );
}
function AccountCardSheet({api, d, edit, onClose, onSaved}: {api: SofiaApi; d: Data; edit: {type: 'account'; item: Account | null} | {type: 'card'; item: Card | null}; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), isCard = edit.type === 'card', acc = edit.type === 'account' ? edit.item : null, card = edit.type === 'card' ? edit.item : null;
  const [name, setName] = useState(edit.item?.name || ''), [type, setType] = useState(acc?.type || 'corrente'), [initial, setInitial] = useState(acc ? finishMoneyInput(String(acc.entity.data.initial_balance || '0').replace('.', ',')) : '');
  const [include, setInclude] = useState(acc?.include ?? true), [color, setColor] = useState(edit.item?.color || FIN_COLORS[isCard ? 2 : d.accounts.length % FIN_COLORS.length]);
  // 0.3.161: dia em que a pessoa recebe - o ciclo do Saldo comeca nele (vazio = mes do calendario)
  const [cycleDay, setCycleDay] = useState(acc?.cycleDay ? String(acc.cycleDay) : '');
  const [limit, setLimit] = useState(card ? finishMoneyInput(String(card.limit).replace('.', ',')) : ''), [closing, setClosing] = useState(card ? String(card.closing) : ''), [due, setDue] = useState(card ? String(card.due) : '');
  const [payFrom, setPayFrom] = useState(card?.accountId || d.accounts[0]?.id || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) { setError('Dê um nome.'); return; }
    setBusy(true); setError('');
    try {
      if (isCard) {
        const l = parseMoney(limit), cl = Number(closing), du = Number(due);
        if (!l || !Number.isInteger(cl) || !Number.isInteger(du) || cl < 1 || cl > 31 || du < 1 || du > 31) { setError('Limite e dias (1 a 31) são obrigatórios.'); setBusy(false); return; }
        await saveEntity(api, 'fin_card', name.trim(), {limit: l, closing_day: cl, due_day: du, color, account_id: payFrom}, card?.entity);
      } else {
        const v = initial.trim() ? parseMoney(initial) : 0;
        if (v === null) { setError('Saldo inválido.'); setBusy(false); return; }
        await saveEntity(api, 'fin_account', name.trim(), {account_type: type, initial_balance: String(v), color, include_total: include, cycle_day: Math.min(31, Math.max(0, Number(cycleDay) || 0))}, acc?.entity);
      }
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const archived = edit.item?.archived;
  async function removeCard() {
    if(!card)return;
    setBusy(true);setError('');
    try {
      // O resumo mensal recebe apenas uma janela de lançamentos.
      // Consultar a coleção completa evita apagar um cartão com faturas antigas.
      let used=false,exhaustive=false;
      for(let offset=0;offset<20000;offset+=100){
        const result=await api.entities('fin_tx','',offset);
        if(result.items.some(e=>String(e.data?.card_id||'')===card.id)){used=true;break;}
        if(result.items.length<100){exhaustive=true;break;}
      }
      const mustArchive=used||!exhaustive;
      appAlert(mustArchive?'Remover cartão e preservar histórico?':'Excluir cartão?',
        mustArchive?'O cartão sai da lista. Compras, pagamentos e faturas anteriores continuam salvos.':'Nenhum lançamento está vinculado a este cartão. Excluir definitivamente?',[
        {text:'Cancelar',style:'cancel'},
        {text:mustArchive?'Remover cartão':'Excluir definitivamente',style:'destructive',onPress:()=>{setBusy(true);void (mustArchive
          ? saveEntity(api,'fin_card',card.name,{},card.entity,'archived')
          : api.deleteEntity(card.id)).then(onSaved).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}
      ]);
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  return (
    <Sheet visible onClose={onClose} label="Fechar edição">
      <ScrollView contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>{edit.item ? 'Editar' : 'Novo'} {isCard ? 'cartão' : 'conta'}</Text>
        <Field label="Nome" value={name} onChange={setName} placeholder={isCard ? 'Ex.: Nubank Visa' : 'Ex.: Itaú'} />
        {isCard ? (
          <>
            <Field label="Limite (R$)" value={limit} onChange={setLimit} numeric placeholder="0,00" />
            <View style={{flexDirection: 'row', gap: 10}}><View style={{flex: 1}}><Field label="Fecha dia" value={closing} onChange={setClosing} numeric placeholder="5" /></View><View style={{flex: 1}}><Field label="Vence dia" value={due} onChange={setDue} numeric placeholder="12" /></View></View>
            <Text style={{fontSize: 12, color: c.muted}}>Fatura paga com</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => setPayFrom(a.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: payFrom === a.id ? c.accent : c.input}}><Text style={{color: payFrom === a.id ? '#fff' : c.text, fontSize: 13}}>{a.name}</Text></Pressable>)}</View>
          </>
        ) : (
          <>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{ACCOUNT_TYPES.map(t => <Pressable key={t.value} onPress={() => setType(t.value)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: type === t.value ? c.accent : c.input}}><Text style={{color: type === t.value ? '#fff' : c.text, fontSize: 13}}>{t.label}</Text></Pressable>)}</View>
            <Field label="Saldo inicial (R$)" value={initial} onChange={setInitial} numeric placeholder="0,00" />
            <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text}}>Somar no saldo geral</Text><Switch value={include} onValueChange={setInclude} /></View>
            <Field label="Dia em que você recebe (opcional)" value={cycleDay} onChange={setCycleDay} numeric placeholder="Ex.: 25" />
            <Text style={{fontSize: 11, color: c.muted, lineHeight: 16}}>Com esse dia, o Saldo passa a contar de um recebimento ao outro. Em branco, conta pelo mês do calendário.</Text>
          </>
        )}
        <View style={{flexDirection: 'row', gap: 10}}>{FIN_COLORS.map(x => <Pressable key={x} onPress={() => setColor(x)} style={{width: 30, height: 30, borderRadius: 15, backgroundColor: x, borderWidth: color === x ? 3 : 0, borderColor: c.text}} />)}</View>
        {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
        <Button title="Salvar" loading={busy} onPress={() => void save()} />
        {edit.item ? <Pressable onPress={async () => { try { await saveEntity(api, isCard ? 'fin_card' : 'fin_account', edit.item!.name, {}, edit.item!.entity, archived ? 'active' : 'archived'); onSaved(); } catch (e) { setError(errorText(e)); } }} style={{alignItems: 'center', padding: 10}}><Text style={{color: archived ? c.accent : c.danger}}>{archived ? 'Reativar' : 'Arquivar (o histórico fica)'}</Text></Pressable> : null}
        {card && !card.archived ? <Pressable accessibilityRole="button" accessibilityLabel="Excluir cartão" disabled={busy} onPress={()=>void removeCard()} style={{alignItems:'center',padding:12}}><Text style={{color:BAD,fontWeight:'800'}}>Excluir cartão</Text></Pressable>:null}
      </ScrollView>
    </Sheet>
  );
}

// ---------- Importar extrato (OFX/CSV) ----------
function ImportSheet({api, d, onClose, onDone}: {api: SofiaApi; d: Data; onClose: () => void; onDone: () => Promise<void>}) {
  const c = useTheme();
  const [target, setTarget] = useState<{type: 'account' | 'card'; id: string} | null>(() => d.accounts.filter(a => !a.archived).length === 1 && !d.cards.length ? {type: 'account', id: d.accounts[0].id} : null);
  const [file, setFile] = useState<{name: string; text: string} | null>(null), [preview, setPreview] = useState<ImportItem[] | null>(null), [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<{created: number; skipped: number} | null>(null);
  async function pick() {
    setError('');
    try {
      const r = await DocumentPicker.getDocumentAsync({type: ['*/*'], copyToCacheDirectory: true, multiple: false});
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0]; const text = await new File(a.uri).text();
      setFile({name: a.name || 'extrato', text}); setPreview(null); setChosen(new Set());
    } catch (e) { setError(errorText(e)); }
  }
  async function analyze() {
    if (!file || !target) return;
    setBusy(true); setError('');
    try {
      // 0.3.219: extrato da conta so fica guardado em "Extrato do banco" - nada e lancado na conta
      if (target.type === 'account') { await api.financeStatement(file.text, target.id); await onDone(); return; }
      const r = await api.financeImportPreview(file.text, target.type, target.id); setPreview(r.items); setChosen(new Set(r.items.filter(i => i.checked !== false && !i.duplicate && !i.skip).map(i => i.import_id)));
    }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview || !target) return;
    setBusy(true); setError('');
    try { const r = await api.financeImportCommit(preview.filter(i => chosen.has(i.import_id)), target.type, target.id); setResult(r); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const toggle = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosenItems = preview ? preview.filter(i => chosen.has(i.import_id)) : [];
  const sum = chosenItems.reduce((s, i) => s + (i.kind === 'income' ? i.amount : -i.amount), 0);
  return (
    <Sheet visible onClose={onClose} label="Fechar importação de extrato">
      <View style={{gap: 12}}>
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text}}>Importar extrato</Text>
        {result ? (
          <View style={{gap: 10}}>
            <Text style={{color: c.text}}>{result.created} lançamento{result.created === 1 ? '' : 's'} importado{result.created === 1 ? '' : 's'}{result.skipped ? ' · ' + result.skipped + ' já existia' + (result.skipped === 1 ? '' : 'm') + ' (não duplicado)' : ''}.</Text>
            <Button title="Pronto" onPress={() => void onDone()} />
          </View>
        ) : (
          <>
            <Text style={{fontSize: 12, color: c.muted}}>Exporte o extrato no app do banco (OFX ou CSV) e escolha o arquivo aqui. Nada entra duplicado: o que já foi importado fica desmarcado.</Text>
            <Text style={{fontSize: 12, color: c.muted, fontWeight: '700'}}>1. De onde é o extrato?</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setTarget({type: 'account', id: a.id}); setPreview(null); }} style={{paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: target?.id === a.id ? c.accent : c.surface, borderWidth: 1, borderColor: c.line}}><Text style={{color: target?.id === a.id ? '#fff' : c.text, fontWeight: '600'}}>{a.name}</Text></Pressable>)}
              {d.cards.filter(x => !x.archived).map(x => <Pressable key={x.id} onPress={() => { setTarget({type: 'card', id: x.id}); setPreview(null); }} style={{paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, backgroundColor: target?.id === x.id ? c.accent : c.surface, borderWidth: 1, borderColor: c.line}}><Text style={{color: target?.id === x.id ? '#fff' : c.text, fontWeight: '600'}}>💳 {x.name}</Text></Pressable>)}
            </View>
            <Text style={{fontSize: 12, color: c.muted, fontWeight: '700'}}>2. Arquivo</Text>
            <Button title={file ? file.name : 'Escolher arquivo (OFX ou CSV)'} secondary onPress={() => void pick()} />
            {file && target && !preview ? <Button title={target?.type === 'account' ? 'Guardar extrato' : 'Conferir com o app'} loading={busy} onPress={() => void analyze()} /> : null}
            {preview ? (
              <View style={{gap: 6}}>
                <Text style={{fontSize: 12, color: c.muted, fontWeight: '700'}}>3. Confira ({chosenItems.length} de {preview.length} marcados · {money(Math.abs(sum))} {sum >= 0 ? 'de entrada' : 'de saída'})</Text>
                {/* 0.3.210: a lista rola por dentro e o botao Importar fica sempre visivel logo abaixo */}
                <View style={{flexDirection: 'row', gap: 16}}>
                  <Pressable accessibilityRole="button" onPress={() => setChosen(new Set(preview.filter(i => !i.skip && !i.duplicate).map(i => i.import_id)))}><Text style={{color: c.accent, fontWeight: '700', fontSize: 12}}>Marcar todos</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setChosen(new Set())}><Text style={{color: c.accent, fontWeight: '700', fontSize: 12}}>Desmarcar todos</Text></Pressable>
                </View>
                <View style={{maxHeight: Math.round(Dimensions.get('window').height * 0.42), borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10}}><ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {preview.map(i => <Pressable key={i.import_id} disabled={!!i.skip} onPress={() => toggle(i.import_id)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line, opacity: i.skip ? 0.45 : 1}}>
                    <View style={{width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: chosen.has(i.import_id) ? c.accent : c.line, backgroundColor: chosen.has(i.import_id) ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{chosen.has(i.import_id) ? <Text style={{color: c.onAccent, fontSize: 13, fontWeight: '800'}}>✓</Text> : null}</View>
                    <View style={{flex: 1}}><Text style={{color: c.text}} numberOfLines={1}>{i.desc}</Text><Text style={{fontSize: 11, color: c.muted}}>{i.date.split('-').reverse().join('/')}{i.category ? ' · ' + i.category : ''}{i.duplicate ? ' · já importado' : ''}{i.match ? ' · já está no app: “' + i.match.title + '”' + (typeof i.match.amount === 'number' && Math.abs(i.match.amount - i.amount) > 0.004 ? ' (lá com ' + money(i.match.amount) + ')' : '') : ''}{i.before ? ' · antes do seu ponto de partida (já está no Saldo)' : ''}{i.skip ? ' · ' + i.skip : ''}</Text></View>
                    <Text style={{fontWeight: '700', color: i.kind === 'income' ? '#2fc58b' : c.text}}>{i.kind === 'income' ? '+' : '-'}{money(i.amount)}</Text>
                  </Pressable>)}
                </ScrollView></View>
                <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>O extrato já ficou guardado em Lançamentos → Extrato do banco, para conferir e acertar o Saldo. Só o que está marcado vira lançamento.</Text>
                <Button title={chosenItems.length ? 'Lançar ' + chosenItems.length + (chosenItems.length === 1 ? ' que falta' : ' que faltam') : 'Nada a lançar: tudo já está no app'} loading={busy} disabled={!chosenItems.length} onPress={() => void confirm()} />
              </View>
            ) : null}
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          </>
        )}
      </View>
    </Sheet>
  );
}
