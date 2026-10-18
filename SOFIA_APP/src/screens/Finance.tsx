import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View} from 'react-native';
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
import {Sheet} from '../components/Sheet';
import {InternalBackGesture} from '../components/InternalBackGesture';
import {DateTimeField} from '../components/DateTimeField';
import {Icon} from '../components/Icon';
import {Button, IconButton} from '../components/UI';
import {PriceChart} from '../components/PriceChart';
import {Spinner, LoadingLines} from '../components/Loading';
import {money} from '../lib/monitoring';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ACCOUNT_TYPES, FIN_COLORS, categoryOf, toAccount, toCard, toTx, toBudget, toGoal, monthOf, addMonths, monthLabel, todayISO,
  invoiceMonth, cardInvoices, cardUsed, installmentPlan, accountBalance, totalBalance, forecastBalance, monthTxs, monthSummary, byCategory, budgetProgress,
  trend, balanceSeries, upcoming, manualDues, transactionsForAccount, goalProgress, parseMoney, formatMoneyInput, finishMoneyInput, addDays,
  dayIn} from '../lib/finance';
import type {Account, Card, Tx, TxKind, Budget, Goal, Invoice, Due, ReserveMove} from '../lib/finance';
import {cycleRange, cycleRoom, fixedSummary, lastInstallmentMonth, monthDues, moneySplit, reserveOutlook, reserveBadge, reserveHistory, reserveMoveLabel, reserveOf, reserveFor, reserveSeries, toReserveMove} from '../lib/finance';
import {syncFinanceDueNotifications} from '../lib/finance-notifications';
import {appAlert} from '../lib/app-alert';
import {useFormDraft} from '../lib/form-draft';

const GOOD = '#2fc58b', BAD = '#ff6b7a', WARN = '#ffb547', GUARD = '#1f9d63';
type Data = {accounts: Account[]; cards: Card[]; txs: Tx[]; budgets: Budget[]; goals: Goal[]; moves: ReserveMove[]};
type Tab = 'home' | 'txs' | 'bills' | 'cards' | 'plan' | 'reports';
const KINDS = ['fin_account', 'fin_card', 'fin_tx', 'fin_budget', 'fin_goal', 'fin_reserve_move'] as const;
const dateBR = (d: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const weekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC'});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

type Bundle = {items: Record<string, Entity[]>; carry?: Record<string, number>; window?: {from: string; to: string} | null};
/** Mês a mês: o servidor manda só os lançamentos da janela e o "saldo acumulado" de cada
 * conta até o início dela. Somado ao saldo inicial, todos os cálculos (saldo, previsto,
 * gráfico dia a dia) continuam exatos sem baixar o histórico inteiro. */
function toData(all: Record<string, Entity[]>, carry: Record<string, number> = {}): Data {
  const g = (k: string) => all[k] || [];
  return {accounts: g('fin_account').map(toAccount).map(a => ({...a, initial: a.initial + (carry[a.id] || 0)})), cards: g('fin_card').map(toCard), txs: g('fin_tx').filter(e => e.state !== 'archived').map(toTx),
    budgets: g('fin_budget').filter(e => e.state !== 'archived').map(toBudget), goals: g('fin_goal').filter(e => e.state !== 'archived').map(toGoal), moves: g('fin_reserve_move').filter(e => e.state !== 'archived').map(toReserveMove)};
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
function writeCache(api: SofiaApi, bundle: Bundle) { void encryptedStorage.write(cacheScope(api), JSON.stringify(bundle)).catch(() => undefined); }
function saveEntity(api: SofiaApi, kind: string, title: string, data: Record<string, any>, existing?: Entity, state?: string) {
  return existing ? api.saveEntity({...existing, title, ...(state ? {state} : {}), data: {...existing.data, ...data}})
    : api.saveEntity({kind, title, content: '', area: 'Pessoal', state: state || 'active', privacy: 'private', tags: [], data});
}

function Chips<T extends string | number>({value, options, onChange, scroll = false}: {value: T; options: Array<{value: T; label: string}>; onChange: (v: T) => void; scroll?: boolean}) {
  const c = useTheme();
  const inner = options.map(o => (
    <Pressable key={String(o.value)} accessibilityRole="button" accessibilityState={{selected: o.value === value}} onPress={() => onChange(o.value)}
      style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: o.value === value ? c.surface : 'transparent'}}>
      <Text style={{fontSize: 13, fontWeight: '600', color: o.value === value ? c.text : c.muted}}>{o.label}</Text>
    </Pressable>
  ));
  const box = {flexDirection: 'row' as const, backgroundColor: c.input, borderRadius: 99, padding: 3};
  return scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={box}>{inner}</View></ScrollView> : <View style={box}>{inner}</View>;
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
export function Finance({api, active, onBack}: {api: SofiaApi; active: boolean; onBack: () => void}) {
  useRenderCost('apps:finance');
  const c = useTheme(), insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('home'), [month, setMonth] = useState(monthOf(todayISO()));
  const [editing, setEditing] = useState<Partial<Tx> | null>(null), [manage, setManage] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState(''), [accountPicker, setAccountPicker] = useState(false);
  const [billEditor, setBillEditor] = useState<Tx | 'new' | null>(null), [notificationWarning, setNotificationWarning] = useState('');
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);
  const navigateFinance = useCallback((next: Tab) => {
    if (next === tab) return;
    setTabHistory(h => [...h, tab].slice(-16)); setTab(next);
  },[tab]);
  const markPaid = useCallback((t: Tx) => setData(prev => {
    if (!prev) return prev;
    if (t.virtual) return {...prev, txs: [...prev.txs, {...t, id: 'local:' + t.id, virtual: false, paid: true, recurrence: 'none'} as Tx]};
    return {...prev, txs: prev.txs.map(x => x.id === t.id ? {...x, paid: true} : x)};
  }), []);
  const local = useMemo(() => ({markPaid}), [markPaid]);
  const goHome = useCallback(() => { setManage(false); setEditing(null); setBillEditor(null); setAccountPicker(false); setTabHistory([]); setTab('home'); }, []);
  const backFinance = useCallback(() => {
    if (billEditor) {setBillEditor(null);return;}
    if (accountPicker) {setAccountPicker(false);return;}
    if (editing) {setEditing(null);return;}
    if (manage) {setManage(false);return;}
    if (tabHistory.length) {setTab(tabHistory[tabHistory.length - 1]);setTabHistory(h => h.slice(0,-1));return;}
    onBack();
  },[billEditor,accountPicker,editing,manage,tabHistory,onBack]);
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {backFinance();return true;});
    return () => sub.remove();
  },[active,backFinance]);
  const window = financeWindow(month, tab), windowKey = window.from + '..' + window.to, loaded = useRef<string>('');
  const reload = useCallback(async () => {
    setLoading(true);
    try { const bundle = await loadAll(api, window); setData(toData(bundle.items, bundle.carry)); setError(''); loaded.current = windowKey; if (window.from <= monthOf(todayISO()) && window.to >= monthOf(todayISO())) writeCache(api, bundle); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [api, windowKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [newMenu, setNewMenu] = useState(false);
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
          <IconButton name="back" label="Mês anterior" size={32} onPress={() => setMonth(m => addMonths(m, -1))} />
          <Pressable accessibilityLabel="Voltar ao mês atual" onPress={() => setMonth(monthOf(todayISO()))}><Text style={{fontSize: 14, fontWeight: '700', color: c.text, minWidth: 104, textAlign: 'center'}}>{monthLabel(month)}</Text></Pressable>
          <Pressable accessibilityLabel="Próximo mês" onPress={() => setMonth(m => addMonths(m, 1))} style={{width: 32, height: 32, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '180deg'}]}}><Icon name="back" size={18} color={c.text} /></Pressable>
        </View>
        <View style={{paddingHorizontal: 20, paddingBottom: 14}}>
          <Chips scroll value={tab} onChange={navigateFinance} options={[{value: 'home' as Tab, label: 'Resumo'}, {value: 'bills' as Tab, label: 'Pendentes'}, {value: 'cards' as Tab, label: 'Cartões'}, {value: 'reports' as Tab, label: 'Relatórios'}]} />
        </View>

        {!d ? <View style={{flex: 1, padding: 16, gap: 14}}>{error ? <View style={{padding: 20, gap: 12}}><Text style={{color: c.danger}}>{error}</Text><Button title="Tentar de novo" secondary onPress={() => void reload()} /></View> : <View style={{gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Spinner size={16} stroke={1.8} /><Text style={{color: c.muted, fontSize: 13}}>Carregando suas finanças</Text></View><LoadingLines rows={5} /></View>}</View> : !d.accounts.length ? (
          <Onboarding api={api} onDone={reload} onFinished={goHome} />
        ) : (
          <ScrollView contentContainerStyle={{paddingHorizontal: 20, paddingTop: 2, paddingBottom: insets.bottom + 110, gap: 16}} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
            {tab === 'home' ? <HomeTab d={scoped || d} month={month} api={api} reload={reload} onTx={setEditing} onTab={navigateFinance} accountId={accountId} isPrimary={isPrimary} onBill={t => setBillEditor(t || 'new')} />
              : tab === 'bills' ? <PendingTab d={scoped || d} api={api} month={month} accountId={accountId} warning={notificationWarning} onBill={setBillEditor} reload={reload} />
              : tab === 'cards' ? <CardsTab d={scoped || d} api={api} reload={reload} onTx={setEditing} onManage={() => setManage(true)} />
              : <ReportsTab d={scoped || d} month={month} reserve={reserveFor((scoped || d).goals, accountId, isPrimary)} />}
          </ScrollView>
        )}

        {d && d.accounts.length ? <>
          {/* 0.3.152: um unico botao + (antes eram dois botoes grandes sobre o extrato) */}
          <Pressable accessibilityRole="button" accessibilityLabel="Novo lançamento" onPress={() => setNewMenu(true)}
            style={{position: 'absolute', right: 18, bottom: insets.bottom + 20, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', elevation: 6}}>
            <Text style={{color: c.onAccent, fontSize: 28, fontWeight: '400', marginTop: -2}}>＋</Text>
          </Pressable>
          <Sheet visible={newMenu} onClose={() => setNewMenu(false)} label="Fechar novo lançamento">
            <View style={{gap: 4, paddingBottom: 12}}>
              <Text style={{fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 6}}>Novo lançamento</Text>
              {([['expense', '↓ Despesa', BAD], ['income', '↑ Receita', GOOD], ['transfer', '⇄ Transferência entre contas', c.accent]] as const).map(([k, label, color]) =>
                <Pressable key={k} accessibilityRole="button" onPress={() => { setNewMenu(false); newTx(k as TxKind); }} style={{paddingVertical: 15, borderBottomWidth: 1, borderColor: c.line}}><Text style={{color, fontSize: 16, fontWeight: '700'}}>{label}</Text></Pressable>)}
              <Pressable accessibilityRole="button" onPress={() => { setNewMenu(false); setBillEditor('new'); }} style={{paddingVertical: 15}}><Text style={{color: c.text, fontSize: 16, fontWeight: '700'}}>⏰ Conta a pagar ou receber</Text></Pressable>
            </View>
          </Sheet>
        </> : null}

        {editing && d ? <TxEditor api={api} d={d} tx={editing} defaultAccountId={accountId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} /> : null}
        {billEditor && d ? <BillEditor api={api} tx={billEditor === 'new' ? null : billEditor} accountId={accountId} onClose={() => setBillEditor(null)} onSaved={() => {setBillEditor(null);void reload();}} /> : null}
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
function Onboarding({api, onDone, existing, onClose, onFinished}: {api: SofiaApi; onDone: () => Promise<void>; existing?: {account: Account | null; reserve: Goal | null; fixed?: Tx[]} | null; onClose?: () => void; onFinished?: () => void}) {
  const c = useTheme(), acc = existing?.account || null, reserve = existing?.reserve || null;
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(acc?.name || 'Conta principal'), [balance, setBalance] = useState(acc ? finishMoneyInput(String(acc.initial).replace('.', ',')) : '');
  const [cycleDay, setCycleDay] = useState(acc?.cycleDay ? String(acc.cycleDay) : '');
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
  const wizardForm = {step: String(step), name, balance, cycleDay, bills: JSON.stringify(bills), saved, plan, planDay, goalValue, goalMonth,
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
      const account = await saveEntity(api, 'fin_account', name.trim() || 'Conta principal',
        {account_type: acc?.type || 'corrente', initial_balance: String(money0(balance)), color: acc?.color || FIN_COLORS[0], include_total: true, cycle_day: Math.min(31, Math.max(0, Number(cycleDay) || 0))}, acc?.entity);
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
      <Field label="Saldo de hoje (R$)" value={balance} onChange={setBalance} placeholder="0,00" numeric />
    </>},
    {title: 'Quando você recebe', hint: 'O dia do mês em que entra seu dinheiro. O Saldo passa a contar de um recebimento ao outro. Em branco, conta pelo mês do calendário.', body:
      <Field label="Dia em que você recebe" value={cycleDay} onChange={setCycleDay} placeholder="Ex.: 25" numeric />},
    {title: 'Contas fixas', hint: 'Aluguel, academia, imposto, assinaturas. Elas se repetem todo mês e a Sofia avisa no vencimento.', body: <>
      {bills.map((b, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={'Editar ' + b.title}
        onPress={() => { setBillEditing(i); setBillTitle(b.title); setBillAmount(b.amount); setBillDay(b.day); setBillParcels(b.parcels); setBillAt(b.at); }}
        style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: billEditing === i ? c.accent : c.line}}>
        <View style={{flex: 1}}><Text style={{color: billEditing === i ? c.accent : c.text, fontWeight: '600'}}>{b.title}</Text><Text style={{color: c.muted, fontSize: 11}}>dia {b.day || 1}{Number(b.parcels) > 1 ? ' · parcela ' + (Math.max(1, Number(b.at) || 1)) + ' de ' + Math.round(Number(b.parcels)) : ''}{billEditing === i ? ' · editando' : ''}</Text></View>
        <Text style={{color: c.text, fontWeight: '700'}}>{money(money0(b.amount))}</Text>
        <IconButton name="trash" label={'Remover ' + b.title} onPress={() => { setBills(list => list.filter((_, n) => n !== i)); if (billEditing === i) { setBillEditing(null); setBillTitle(''); setBillAmount(''); setBillDay(''); setBillParcels(''); setBillAt(''); } }} />
      </Pressable>)}
      {bills.length ? <Text style={{color: c.muted, fontSize: 11}}>Toque em uma conta para corrigir os dados dela.</Text> : null}
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
      {cycleDay ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Ciclo</Text><Text style={{color: c.text, fontWeight: '700'}}>todo dia {cycleDay}</Text></View> : null}
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
      {last && existing ? <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Nada foi alterado ainda. Só ao tocar em “Substituir configuração” estes dados passam a valer; se sair agora, tudo continua como estava.</Text> : null}
      <Button title={last ? (existing ? 'Substituir configuração' : 'Começar a usar') : 'Continuar'} loading={busy} disabled={step === 0 && !name.trim()}
        onPress={() => last ? confirmFinish() : setStep(s => s + 1)} />
      <View style={{flexDirection: 'row', justifyContent: 'center', gap: 18}}>
        {step > 0 ? <Pressable accessibilityRole="button" onPress={() => setStep(s => s - 1)}><Text style={{color: c.accent, fontSize: 13, fontWeight: '700'}}>Voltar</Text></Pressable> : null}
        {!last ? <Pressable accessibilityRole="button" onPress={() => setStep(steps.length - 1)}><Text style={{color: c.muted, fontSize: 13}}>Pular o resto</Text></Pressable> : null}
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
function ReserveHistorySheet({api, reserve, moves, show, onClose, reload}: {api: SofiaApi; reserve: Goal; moves: ReserveMove[]; show: (v: number) => string; onClose: () => void; reload: () => Promise<void>}) {
  const c = useTheme(), months = useMemo(() => reserveHistory(moves, reserve.id), [moves, reserve.id]);
  // 0.3.162: corrigir ou apagar um movimento errado. O guardado e a conta do mes se ajustam sozinhos,
  // porque sao calculados a partir destes registros.
  const [edit, setEdit] = useState<ReserveMove | null>(null), [amount, setAmount] = useState(''), [date, setDate] = useState(''), [note, setNote] = useState(''), [planned, setPlanned] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function open(m: ReserveMove) { setEdit(m); setAmount(finishMoneyInput(String(m.amount).replace('.', ','))); setDate(m.date); setNote(m.note); setPlanned(m.planned); setError(''); }
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
    <ScrollView contentContainerStyle={{gap: 16, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>Histórico da reserva</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Toque em um movimento para corrigir o valor, a data ou apagá-lo.</Text>
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

function ReserveSheet({api, kind, reserve, split, onClose, onDone, accountId = ''}: {accountId?: string; api: SofiaApi; kind: 'setup' | 'in' | 'out' | 'plan' | 'goal'; reserve: Goal | null; split: ReturnType<typeof moneySplit> | null; onClose: () => void; onDone: () => Promise<void>}) {
  const c = useTheme();
  const [name, setName] = useState(reserve?.name || 'Dinheiro guardado'), [amount, setAmount] = useState(''), [note, setNote] = useState(''),
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
  const title = kind === 'setup' ? 'Separar o dinheiro guardado' : kind === 'in' ? 'Guardar dinheiro' : kind === 'plan' ? 'Valor dos aportes' : kind === 'goal' ? 'Meta' : 'Retirar da reserva';
  async function save() {
    setBusy(true); setError('');
    try {
      if (kind === 'setup') {
        const saved = parseMoney(amount) ?? 0, monthly = parseMoney(plan) ?? 0;
        if (saved < 0 || monthly < 0) throw Error('Use valores positivos.');
        await api.saveEntity({kind: 'fin_goal', title: name.trim() || 'Dinheiro guardado', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {role: 'reserve', saved, ...planFields, ...goalFields, monthly_plan: monthly, color: GOOD, account_id: accountId || ''}});
      } else if ((kind === 'plan' || kind === 'goal') && reserve) {
        await api.saveEntity({...reserve.entity, data: {...reserve.entity.data, ...planFields, ...goalFields}});
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
    <View style={{flexDirection: 'row', gap: 10}}>
      <View style={{flex: 1}}>{input('Quero juntar', goalValue, setGoalValue, 'Ex.: 39.000')}</View>
      <View style={{flex: 1}}><DateTimeField label="Até" value={goalMonth} onChange={setGoalMonth} dateOnly emptyLabel="Escolher data" /></View>
    </View>
  </View>;
  const planEditor = <View style={{gap: 10}}>
    <View style={{flexDirection: 'row', gap: 10}}>
      <View style={{flex: 1}}>{input('Todo dia (1 a 28)', day, setDay, '5')}</View>
      <View style={{flex: 1}}><DateTimeField label="Avisar às" value={remindTime} onChange={v => setRemindTime(v || remindTime)} timeOnly allowClear={false} /></View>
    </View>
    <Text style={{color: c.muted, fontSize: 12}}>Avisar também</Text>
    <Chips value={remindBefore} onChange={setRemindBefore} options={[{value: '0', label: 'No dia'}, {value: '1', label: '1 dia antes'}, {value: '2', label: '2 dias antes'}, {value: '5', label: '5 dias antes'}]} />
    <Chips value={repeatDays} onChange={setRepeatDays} options={[{value: '0', label: 'Não repetir'}, {value: '3', label: 'A cada 3 dias até aportar'}, {value: '7', label: 'A cada 7 dias até aportar'}]} />
  </View>;
  return <Sheet visible onClose={onClose} label={'Fechar ' + title}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>{title}</Text>
      {error ? <Text style={{color: BAD}}>{error}</Text> : null}
      {kind === 'setup' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Informe quanto você tem guardado, esteja onde estiver. Esse valor fica separado: não entra no saldo geral, que continua sendo o que você tem para usar. Depois é só registrar cada aporte em “Guardar dinheiro”.</Text>
        {input('Nome', name, setName, 'Dinheiro guardado')}
        {input('Já guardado hoje', amount, setAmount, 'Ex.: 15.000')}
        {input('Aportes de (por mês, opcional)', plan, setPlan, 'Ex.: 4.000')}
        {parseMoney(plan) ? planEditor : null}
        {goalEditor}
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
function PendingTab({d,api,month,accountId,warning,onBill,reload}: {d:Data;api:SofiaApi;month:string;accountId:string;warning:string;onBill:(t:Tx|'new')=>void;reload:()=>Promise<void>}) {
  // 0.3.176: a aba segue o mes escolhido no topo (no mes atual, junto com as atrasadas)
  const c=useTheme(),today=todayISO(),list=useMemo(()=>monthDues(d.txs,accountId,month,today),[d,accountId,month,today]);
  const open=list.filter(row=>!row.paid),total=open.reduce((sum,row)=>sum+row.amount,0),paidCount=list.length-open.length;
  // 0.3.161: as pendencias marcadas como "todo mes" sao as contas fixas; aqui elas aparecem juntas,
  // com o total do ciclo, o quanto ja foi pago e quanto representam do que entrou.
  const cycleDay=d.accounts.find(a=>a.id===accountId)?.cycleDay||0;
  const range=useMemo(()=>cycleRange(cycleDay,month===monthOf(today)?today:dayIn(month,Math.min(28,Math.max(1,cycleDay||1)))),[cycleDay,today,month]);
  const fixed=useMemo(()=>fixedSummary(d.txs,accountId,range),[d,accountId,range]);
  const prevShare=useMemo(()=>{const out:number[]=[];let r=range;for(let i=0;i<3;i++){r=cycleRange(cycleDay,addDays(r.start,-1));const f=fixedSummary(d.txs,accountId,r);if(f.share!==null)out.push(f.share);}return out.length?out.reduce((a,b)=>a+b,0)/out.length:null;},[d,accountId,range,cycleDay]);
  return <>
    <Card_>
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
        <View style={{flex:1,gap:6}}><Text style={{fontSize:17,fontWeight:'800',color:c.text}}>A pagar e a receber</Text>
        <Text style={{fontSize:12,color:c.muted,lineHeight:18}}>Cadastre cada vencimento manualmente. Compras e extratos não criam pendências.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cadastrar conta a pagar" onPress={()=>onBill('new')} style={{backgroundColor:c.accent,paddingHorizontal:13,paddingVertical:11,borderRadius:12}}>
          <Text style={{color:c.onAccent,fontSize:13,fontWeight:'800'}}>＋ Nova</Text>
        </Pressable>
      </View>
      <View style={{borderTopWidth:1,borderColor:c.line,paddingTop:14,flexDirection:'row',justifyContent:'space-between'}}>
        <Text style={{color:c.muted,fontSize:12}}>{open.length} {open.length===1?'pendente':'pendentes'}{paidCount?' · '+paidCount+(paidCount===1?' paga':' pagas'):''} em {monthLabel(month).split(' ')[0].toLowerCase()}</Text>
        <Text style={{color:c.text,fontWeight:'800'}}>{money(total)}</Text>
      </View>
      {warning ? <Text style={{fontSize:12,color:WARN}}>{warning}</Text> : null}
    </Card_>
    {fixed.bills.length ? <Card_>
      <Title text="Contas fixas" />
      <Text style={{fontSize:12,color:c.muted,lineHeight:18}}>As pendências marcadas como “Todo mês”, no ciclo {range.label}.</Text>
      {fixed.bills.map(b=><View key={b.id+b.date} style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,borderTopWidth:1,borderColor:c.line}}>
        <View style={{flex:1,gap:2}}>
          <Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{b.title}</Text>
          <Text style={{color:c.muted,fontSize:11}}>dia {b.day}{b.cardId?' · cartão':''} · {b.paid?'paga':'a pagar'}{b.installments?' · parcela '+b.index+' de '+b.installments+(b.left?' · faltam '+b.left:' · última'):''}</Text>
        </View>
        <Text style={{color:b.paid?c.muted:c.text,fontWeight:'700',fontSize:14,textDecorationLine:b.paid?'line-through':'none'}}>{money(b.amount)}</Text>
      </View>)}
      <View style={{borderTopWidth:1,borderColor:c.line,paddingTop:12,gap:6}}>
        <View style={{flexDirection:'row'}}><Text style={{flex:1,color:c.text,fontWeight:'700'}}>Total do ciclo</Text><Text style={{color:c.text,fontWeight:'800'}}>{money(fixed.total)}</Text></View>
        <View style={{flexDirection:'row'}}><Text style={{flex:1,color:c.muted,fontSize:12}}>Pagas</Text><Text style={{color:c.muted,fontSize:12}}>{money(fixed.paid)} · faltam {money(fixed.open)}</Text></View>
        {fixed.share!==null?<Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Suas fixas são {Math.round(fixed.share*100)}% do que entrou neste ciclo ({money(fixed.income)}){prevShare!==null?`, contra ${Math.round(prevShare*100)}% na média dos anteriores`:''}.</Text>
          :<Text style={{color:c.muted,fontSize:12}}>Ainda não há receitas registradas neste ciclo para calcular a proporção.</Text>}
      </View>
    </Card_> : null}
    <Card_>
      <Title text={month===monthOf(today)?'A vencer e atrasadas':'Pendentes de '+monthLabel(month).split(' ')[0].toLowerCase()} />
      {list.length ? list.map(due=><DueRow key={due.id} due={due} d={d} api={api} reload={reload} onTx={t=>onBill(t as Tx)} />)
        : <Text style={{color:c.muted,fontSize:13,lineHeight:20}}>{month===monthOf(today)?'Nada a pagar ou receber neste mês.':'Nada pendente em '+monthLabel(month).split(' ')[0].toLowerCase()+'.'} Para ver outro mês, troque o mês no topo.</Text>}
      <Text style={{fontSize:11,color:c.muted}}>Os avisos locais saem às 9h do vencimento (e, se você escolher, alguns dias antes), com a permissão de notificações do Android. Confirmar o pagamento ou o recebimento tira o item dos pendentes e o inclui no extrato.</Text>
    </Card_>
  </>;
}
function BillEditor({api,tx,accountId,onClose,onSaved}:{api:SofiaApi;tx:Tx|null;accountId:string;onClose:()=>void;onSaved:()=>void}) {
  const c=useTheme(),existing=!!tx?.entity&&!tx?.virtual;
  const [name,setName]=useState(tx?.desc||''),[amount,setAmount]=useState(tx?.amount?finishMoneyInput(String(tx.amount).replace('.',',')):'');
  const [date,setDate]=useState(tx?.date||todayISO()),[category,setCategory]=useState(tx?.category||'Contas');
  const [repeat,setRepeat]=useState(tx?.recurrence==='monthly'?'monthly':'none');
  // 0.3.151: tambem contas a receber, e aviso alguns dias antes (alem do aviso no dia)
  const [flow,setFlow]=useState<'expense'|'income'>(tx?.kind==='income'?'income':'expense'),[before,setBefore]=useState(String(tx?.remindDays||0));
  // 0.3.165: conta fixa com prazo (ex.: 10 parcelas) - para de se repetir sozinha no fim
  const [parcels,setParcels]=useState(String(tx?.entity?.data?.installments||''));
  const [parcelNow,setParcelNow]=useState(String(tx?.entity?.data?.installment||''));
  // 0.3.168: se o app for para o fundo (ou for encerrado) no meio do preenchimento, nada se perde.
  const draftKey='bill:'+(tx?.id||'novo');
  const form={name,amount,date,category,repeat,flow,before,parcels,parcelNow};
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
    if(draft.flow)setFlow(draft.flow==='income'?'income':'expense');
    if(draft.before!==undefined)setBefore(String(draft.before));
    if(draft.parcels!==undefined)setParcels(String(draft.parcels));
    if(draft.parcelNow!==undefined)setParcelNow(String(draft.parcelNow));
  },[ready,draft]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function save() {
    const value=parseMoney(amount);
    if(!name.trim()){setError(flow==='income'?'Informe o que você vai receber.':'Informe qual conta ou dívida precisa pagar.');return;}
    if(!value||value<=0){setError(flow==='income'?'Informe o valor a receber.':'Informe o valor a pagar.');return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))){setError('Selecione uma data de vencimento válida.');return;}
    if(!accountId){setError('Selecione uma conta financeira primeiro.');return;}
    setBusy(true);setError('');
    try{
      const data={
        kind:flow,amount:value,date,category,account_id:tx?.accountId||accountId,remind_days:Number(before)||0,
        installments:repeat==='monthly'&&Number(parcels)>1?Math.min(360,Math.round(Number(parcels))):'',
        installment:repeat==='monthly'&&Number(parcels)>1?Math.min(Math.round(Number(parcels)),Math.max(1,Math.round(Number(parcelNow))||1)):'',
        recurrence_end:repeat==='monthly'&&Number(parcels)>1?addMonths(monthOf(date),Math.round(Number(parcels))-Math.max(1,Math.round(Number(parcelNow))||1)):'',
        paid:false,card_id:'',to_account_id:'',
        recurrence:tx?.virtual?'none':repeat,
        series_id:tx?.seriesId||'',
        import_id:existing?String(tx?.entity?.data?.import_id||''): 'sofia-pendencia:'+uid(),
      };
      await saveEntity(api,'fin_tx',name.trim(),data,existing?tx?.entity:undefined);
      await clearDraft();
      onSaved();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  function erase() {
    if(!tx?.entity||tx.virtual)return;
    appAlert('Excluir vencimento?', 'Esse cadastro será apagado. Lançamentos já pagos de meses anteriores não serão excluídos.', [
      {text:'Cancelar',style:'cancel'},
      {text:'Excluir',style:'destructive',onPress:()=>{setBusy(true);void api.deleteEntity(tx.entity!.id).then(onSaved).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}
    ]);
  }
  return <Sheet visible onClose={onClose} label="Fechar cadastro de vencimento">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:13,paddingBottom:24}}>
      <Text style={{fontSize:20,fontWeight:'800',color:c.text}}>{existing?'Editar vencimento':'Novo vencimento'}</Text>
      <Text style={{fontSize:13,lineHeight:19,color:c.muted}}>Este registro só afeta o saldo depois que você confirmar o pagamento. Não vem automaticamente do extrato bancário.</Text>
      <Chips value={flow} onChange={setFlow} options={[{value:'expense',label:'A pagar'},{value:'income',label:'A receber'}]}/>
      <Field label={flow==='income'?'Conta a receber':'Conta a pagar'} value={name} onChange={setName} placeholder={flow==='income'?'Ex.: Freela, aluguel recebido, reembolso':'Ex.: Boleto de energia, dívida, aluguel'} />
      <Field label="Valor (R$)" value={amount} onChange={setAmount} numeric placeholder="0,00" />
      <DateTimeField label="Vencimento" value={date} onChange={v=>v&&setDate(v)} dateOnly allowClear={false} />
      <Text style={{color:c.muted,fontSize:12}}>Categoria</Text>
      <Chips scroll value={category} onChange={setCategory} options={['Contas','Moradia','Saúde','Impostos','Outros'].map(x=>({value:x,label:x}))}/>
      <Text style={{color:c.muted,fontSize:12}}>Repetição</Text>
      <Chips value={repeat} onChange={setRepeat} options={[{value:'none',label:'Só esta vez'},{value:'monthly',label:'Todo mês'}]}/>
      {repeat==='monthly'?<>
        <View style={{flexDirection:'row',gap:10}}>
          <View style={{flex:1}}><Field label="Parcelas (opcional)" value={parcels} onChange={setParcels} numeric placeholder="Ex.: 10" /></View>
          {Number(parcels)>1?<View style={{flex:1}}><Field label="Esta é a parcela nº" value={parcelNow} onChange={setParcelNow} numeric placeholder="1" /></View>:null}
        </View>
        <Text style={{color:c.muted,fontSize:11,lineHeight:16}}>{Number(parcels)>1?'Acaba sozinha na '+Math.round(Number(parcels))+'ª parcela, em '+monthLabel(addMonths(monthOf(date),Math.round(Number(parcels))-Math.max(1,Math.round(Number(parcelNow))||1)))+'. A Sofia avisa quando terminar.':'Em branco, se repete todo mês sem prazo. Já tem parcelas pagas? Informe o total e em qual você está.'}</Text>
      </>:null}
      <Text style={{color:c.muted,fontSize:12}}>Avisar</Text>
      <Chips value={before} onChange={setBefore} options={[{value:'0',label:'No dia'},{value:'1',label:'1 dia antes'},{value:'3',label:'3 dias antes'},{value:'7',label:'7 dias antes'}]}/>
      <Text style={{color:c.muted,fontSize:11}}>{before==='0'?'Aviso às 9h do dia do vencimento.':'Aviso às 9h, '+before+(before==='1'?' dia':' dias')+' antes e de novo no dia.'}</Text>
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

function HomeTab({d, month, api, reload, onTx, onTab, accountId, isPrimary, onBill}: {d: Data; month: string; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onTab: (t: Tab) => void; accountId: string; isPrimary: boolean; onBill: (t?: Tx) => void}) {
  const c = useTheme(), today = todayISO();
  // Contas pesadas só quando os dados ou o mês mudam (não a cada toque, como esconder valores).
  const {s, total: accountsTotal, forecast: accountsForecast, dues} = useMemo(() => ({s: monthSummary(d.txs, month), total: totalBalance(d.accounts, d.txs), forecast: forecastBalance(d.accounts, d.txs, month, d.cards),
    dues: manualDues(d.txs, accountId, today, 10)}), [d, accountId, month, today]);
  const [hide, setHide] = useState(false), [reserveSheet, setReserveSheet] = useState<'setup' | 'in' | 'out' | 'plan' | 'goal' | null>(null), [reserveHistoryOpen, setReserveHistoryOpen] = useState(false);
  const show = (v: number) => hide ? 'R$ •••••' : money(v);
  // 0.3.151: cada conta tem o proprio guardado (a principal mantem a reserva antiga, sem conta).
  const reserve = reserveFor(d.goals, accountId, isPrimary);
  const split = useMemo(() => reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs,accountId,today,45)) : null, [reserve, d, accountId, month, today]);
  // 0.3.154: o guardado e independente das contas. O Saldo geral e o que voce tem para usar: so os
  // movimentos de guardar/retirar passam dinheiro entre os dois (o valor inicial nao e descontado).
  const badge = split ? reserveBadge(split, today, money) : '';
  const outlook = useMemo(() => reserve && split ? reserveOutlook(reserve, split.saved, split.planned, today) : null, [reserve, split, today]);
  // 0.3.161: ciclo do dinheiro (comeca no dia em que a pessoa recebe) e a folga dele
  const cycleDay = d.accounts.find(a => a.id === accountId)?.cycleDay || 0;
  const room = useMemo(() => cycleRoom(d.txs, accountId, cycleRange(cycleDay, today), split?.planned || 0,
    d.accounts.filter(a => (!accountId || a.id === accountId) && a.include).reduce((s, a) => s + a.initial, 0)), [d, accountId, cycleDay, today, split?.planned]);
  const net = split ? split.net : 0, total = Math.round((accountsTotal - net) * 100) / 100, forecast = Math.round((accountsForecast - net) * 100) / 100;
  const [reserveMenu, setReserveMenu] = useState(false);
  return (
    <>
      {reserveHistoryOpen && reserve ? <ReserveHistorySheet api={api} reserve={reserve} moves={d.moves || []} show={show} reload={reload} onClose={() => setReserveHistoryOpen(false)} /> : null}
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
          <Text style={{flex: 1, color: c.onAccent + 'cc', fontSize: 13}}>Saldo geral</Text>
          <Pressable accessibilityLabel={hide ? 'Mostrar valores' : 'Esconder valores'} onPress={() => setHide(h => !h)}><Icon name="eye" size={18} color={c.onAccent + 'cc'} /></Pressable>
        </View>
        <Text style={{color: c.onAccent, fontSize: 32, fontWeight: '800'}}>{show(total)}</Text>
        <Text style={{color: c.onAccent + 'cc', fontSize: 12}}>Previsto no fim de {monthLabel(month).split(' ')[0].toLowerCase()}: <Text style={{color: c.onAccent, fontWeight: '700'}}>{show(forecast)}</Text></Text>
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↑ Receitas</Text><Text style={{color: c.onAccent, fontWeight: '800', fontSize: 16}}>{show(s.income)}</Text></View>
          <View style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 16, padding: 12, gap: 2}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↓ Despesas</Text><Text style={{color: c.onAccent, fontWeight: '800', fontSize: 16}}>{show(s.expense)}</Text></View>
        </View>

      </View>
      </View>
      <Sheet visible={reserveMenu} onClose={() => setReserveMenu(false)} label="Fechar detalhes da reserva">
        <View style={{gap: 14, paddingBottom: 12}}>
          <Text style={{fontSize: 18, fontWeight: '800', color: c.text}}>Sua reserva</Text>
          {split ? <>
            <Text style={{fontSize: 29, fontWeight: '800', color: c.text}}>{show(split.saved)}</Text>
            <Text style={{fontSize: 12, lineHeight: 18, color: c.muted}}>Esse valor é separado das suas contas: não entra no saldo geral. O saldo geral é o que você tem para usar. Guardar dinheiro tira do saldo geral; retirar devolve. É uma organização da Sofia, não bloqueia nada no banco.</Text>
            {outlook ? <Pressable accessibilityRole="button" accessibilityLabel="Editar meta" onPress={() => { setReserveMenu(false); setReserveSheet('goal'); }} style={{backgroundColor: GUARD + '1f', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: GUARD + '55'}}>
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
            {!outlook ? <Pressable accessibilityRole="button" onPress={() => { setReserveMenu(false); setReserveSheet('goal'); }}><Text style={{color: c.accent, fontSize: 13, fontWeight: '700'}}>+ Definir uma meta (quanto e até quando)</Text></Pressable> : null}
            {split.monthTarget > 0 || split.realized > 0 ? <View style={{backgroundColor: GUARD + '1f', borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: GUARD + '55'}}>
              <Text style={{color: c.text, fontWeight: '800', fontSize: 14}}>Aportes de {monthLabel(month)}</Text>
              {split.planned > 0 ? <Text style={{color: c.muted, fontSize: 12}}>{show(split.planned)} todo dia {split.planDay}, avisar às {split.remindTime}</Text> : null}
              <Text style={{color: c.muted, fontSize: 12}}>Guardado no mês: {show(split.realized)}</Text>
              {split.takenBack > 0 ? <Text style={{color: c.muted, fontSize: 12}}>Retirado no mês, a recompor: −{show(split.takenBack)}</Text> : null}
              {split.monthTarget > 0 ? <Text style={{color: split.closed ? GOOD : c.text, fontWeight: '700', fontSize: 13}}>{split.closed ? 'Aporte do mês fechado ✓' : 'Faltam ' + show(split.missing) + ' para fechar o mês'}</Text> : null}
              {split.monthTarget > 0 ? <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>O que faltar não passa para o mês seguinte: a conta recomeça no valor do aporte.</Text> : null}
            </View> : null}
            <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 10}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Saldo geral (para usar)</Text><Text style={{color: split.daily < 0 ? BAD : c.text, fontWeight: '700'}}>{show(split.daily)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Guardado + saldo geral</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(split.total)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Despesas previstas do mês</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(split.committed)}</Text></View>
              <View style={{height: 1, backgroundColor: c.line}} />
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '700', fontSize: 12}}>Livre após despesas previstas</Text><Text style={{color: split.free < 0 ? BAD : GOOD, fontWeight: '800'}}>{show(split.free)}</Text></View>
            </View>
            {split.daily < 0 ? <Text style={{color: BAD, fontSize: 12}}>O saldo geral ficou negativo: o que foi guardado é maior que o dinheiro que estava disponível. Confira os valores.</Text> : null}
          </> : null}
          {[['Guardar dinheiro', 'in'], ['Retirar da reserva', 'out'], ['Editar aportes', 'plan'], ['Editar meta', 'goal'], ['Histórico da reserva', 'history']].map(([label, k]) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => { setReserveMenu(false); if (k === 'history') setReserveHistoryOpen(true); else setReserveSheet(k as 'in' | 'out' | 'plan' | 'goal'); }}
              style={{paddingVertical: 13, borderBottomWidth: 1, borderColor: c.line}}>
              <Text style={{color: k === 'out' ? BAD : c.text, fontSize: 15, fontWeight: '600'}}>{label}  ›</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* 0.3.161: quanto ainda da para gastar neste ciclo, depois das contas fixas e do aporte */}
      {room && room.ceiling > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Ver contas fixas" onPress={() => onTab('bills')}
        style={{backgroundColor: c.surface, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: room.over > 0 ? BAD : c.line}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}>
          <Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 15}}>Saldo</Text>
          <Text style={{color: c.muted, fontSize: 11}}>{room.label}</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
          <Text style={{color: room.over > 0 ? BAD : c.text, fontWeight: '800', fontSize: 26}}>{room.over > 0 ? '−' + show(room.over) : show(room.left)}</Text>
          <Text style={{color: c.muted, fontSize: 12}}>{room.over > 0 ? 'além do que havia' : 'de ' + show(room.ceiling)}</Text>
          <View style={{flex: 1}} />
          <Text style={{color: room.over > 0 ? BAD : room.pct <= 0.25 ? WARN : GOOD, fontWeight: '700', fontSize: 13}}>{Math.round(room.pct * 100)}%</Text>
        </View>
        <View style={{height: 10, borderRadius: 5, backgroundColor: c.line, overflow: 'hidden'}}>
          <View style={{width: `${Math.round((room.over > 0 ? 1 : room.pct) * 100)}%` as `${number}%`, height: 10, borderRadius: 5, backgroundColor: room.over > 0 ? BAD : room.pct <= 0.25 ? WARN : GOOD}} />
        </View>
        <Text style={{color: c.muted, fontSize: 11, lineHeight: 16}}>Depois das contas fixas ({show(room.fixed)}){room.plan > 0 ? ' e do aporte (' + show(room.plan) + ')' : ''}. Já gastou {show(room.spent)} neste ciclo.</Text>
      </Pressable> : null}

      {/* 0.3.152: vencimentos proximos viram uma linha so (o detalhe fica em Pendentes); cartoes ficam na aba Cartoes */}
      {dues.length ? <Pressable accessibilityRole="button" accessibilityLabel="Ver pendentes" onPress={() => onTab('bills')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: dues.some(x => x.late) ? BAD : c.line}}>
        <Text style={{fontSize: 16}}>⏰</Text>
        <Text style={{flex: 1, color: c.text, fontSize: 13}}>{dues.some(x => x.late) ? 'Há conta atrasada' : dues.length === 1 ? '1 vencimento nos próximos 10 dias' : dues.length + ' vencimentos nos próximos 10 dias'}</Text>
        <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>{show(dues.reduce((sum, x) => sum + x.amount, 0))}</Text><Text style={{color: c.muted}}>›</Text>
      </Pressable> : null}

      <View style={{gap: 12, paddingTop: 6}}>
        <TxTab d={d} month={month} accountFilter="" setAccountFilter={() => undefined} onTx={onTx} api={api} reload={reload} />
      </View>

    </>
  );
}
function DueRow({due, d, api, reload, onTx}: {due: Due; d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void}) {
  const c = useTheme(), [busy, setBusy] = useState(false), [pick, setPick] = useState(false);
  const color = due.kind === 'receber' ? GOOD : due.late ? BAD : due.kind === 'fatura' ? c.accent : WARN;
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
        void confirmTx(api, due.tx).then(() => reload()).catch(e => { appAlert('Finanças', errorText(e)); void reload(); });
        return;
      }
    } catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  if (due.paid) return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: GOOD + '1a'}}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: GOOD}} />
      <Pressable style={{flex: 1, gap: 2}} onPress={() => due.tx && onTx(due.tx)}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: GOOD}}>{due.kind === 'receber' ? 'Recebido' : 'Pago'} · {dateBR(due.date)}</Text>
      </Pressable>
      <Text style={{color: GOOD, fontWeight: '700'}}>{money(due.amount)}</Text>
      <Text style={{color: GOOD, fontWeight: '800', fontSize: 12}}>✓ {due.kind === 'receber' ? 'Recebido' : 'Pago'}</Text>
    </View>
  );
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4}}>
      <View style={{width: 4, height: 36, borderRadius: 2, backgroundColor: color}} />
      <Pressable style={{flex: 1, gap: 2}} onPress={() => due.tx && onTx(due.tx)}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: due.late ? BAD : c.muted}}>{due.late ? 'Atrasado · ' : ''}{due.kind === 'receber' ? 'receber' : 'vence'} {dateBR(due.date)}{due.tx?.virtual ? ' · repetição' : ''}</Text>
      </Pressable>
      <Text style={{color: due.kind === 'receber' ? GOOD : c.text, fontWeight: '700'}}>{money(due.amount)}</Text>
      <Pressable disabled={busy} onPress={() => due.invoice && d.accounts.length > 1 ? setPick(true) : void settle()} style={{paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: color + '22'}}>
        {busy ? <ActivityIndicator size="small" color={color} /> : <Text style={{color, fontWeight: '700', fontSize: 12}}>{due.kind === 'receber' ? 'Recebi' : 'Paguei'}</Text>}
      </Pressable>
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8}}>Pagar {due.title} com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => { setPick(false); void settle(a.id); }} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 15}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>
    </View>
  );
}
/** Pagar/receber: lançamento real vira pago; repetição prevista vira um lançamento real daquele mês. */
// 0.3.175: atualizacoes locais imediatas (o servidor confirma por tras, sem a pessoa esperar).
const FinanceLocal = React.createContext<{markPaid: (t: Tx) => void} | null>(null);
async function confirmTx(api: SofiaApi, t: Tx) {
  if (t.virtual) {
    const data: Record<string, any> = {kind: t.kind, amount: t.amount, date: t.date, category: t.category, account_id: t.accountId, paid: true, series_id: t.seriesId, recurrence: 'none',
      // 0.3.177: a parcela paga continua aparecendo como pendencia (paga) daquele mes
      import_id: t.manualDue ? 'sofia-pendencia:' + (t.seriesId || t.id) + ':' + t.date : ''};
    await saveEntity(api, 'fin_tx', t.desc, data);
  } else if (t.entity) await saveEntity(api, 'fin_tx', t.desc, {paid: true}, t.entity);
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
function TxTab({d, month, accountFilter, setAccountFilter, onTx, api, reload}: {d: Data; month: string; accountFilter: string; setAccountFilter: (v: string) => void; onTx: (t: Partial<Tx>) => void; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), [kind, setKind] = useState<'all' | TxKind>('all'), [cat, setCat] = useState(''), [status, setStatus] = useState<'all' | 'pending'>('all');
  // 0.3.153: o que voce registrou na Sofia e o extrato importado do banco ficam separados, com troca.
  const [source, setSource] = useState<'app' | 'import'>('app');
  const imported = (t: Tx) => { const id = String(t.entity?.data?.import_id || ''); return !!id && !id.startsWith('sofia-pendencia:'); };
  // 0.3.160: em vez de digitar uma busca, filtros prontos com as categorias que JA foram usadas nos
  // lancamentos (nada inventado), da mais usada para a menos usada. Sem nenhuma categoria, sem filtro.
  const catPresets = useMemo(() => { const n = new Map<string, number>(); for (const t of d.txs) { if ((t.manualDue && !t.paid) || (source === 'import' ? !imported(t) : imported(t)) || (kind !== 'all' && t.kind !== kind)) continue; const name = String(t.category || '').trim(); if (name) n.set(name, (n.get(name) || 0) + 1); } return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([name]) => name); }, [d.txs, source, kind]);
  const activeCat = catPresets.includes(cat) ? cat : '';
  const hasAnyTx = d.txs.some(t => (!t.manualDue || t.paid) && (source === 'import' ? imported(t) : !imported(t)));
  const list = monthTxs(d.txs, month).filter(t => (!t.manualDue || t.paid) && (source === 'import' ? imported(t) : !imported(t)) && (kind === 'all' || t.kind === kind) && (!accountFilter || t.accountId === accountFilter || t.toAccountId === accountFilter || t.cardId === accountFilter)
    && (status === 'all' || (!t.paid && !t.cardId)) && (!activeCat || t.category === activeCat));
  const days = useMemo(() => { const m = new Map<string, Tx[]>(); for (const t of list) { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date)!.push(t); } return [...m.entries()]; }, [list]);
  const sum = list.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0);
  const filterName = d.accounts.find(a => a.id === accountFilter)?.name || d.cards.find(x => x.id === accountFilter)?.name;
  const [importing, setImporting] = useState(false), [tools, setTools] = useState(false);
  return (
    <>
      {/* 0.3.152: historico direto sob os cartoes; busca, filtros e importacao ficam recolhidos */}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 2}}>
        <Text style={{flex: 1, fontSize: 18, fontWeight: '800', color: c.text}}>Histórico</Text>
        {hasAnyTx ? <IconButton name="filter" label={tools ? 'Esconder filtros' : 'Filtrar'} onPress={() => setTools(v => !v)} /> : null}
        <IconButton name="plus" label="Importar extrato (OFX ou CSV)" onPress={() => setImporting(true)} />
      </View>
      <Chips value={source} onChange={setSource} options={[{value: 'app' as const, label: 'Lançamentos'}, {value: 'import' as const, label: 'Extrato importado'}]} />
      {importing ? <ImportSheet api={api} d={d} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await reload(); }} /> : null}
      {hasAnyTx && (tools || activeCat || kind !== 'all' || status !== 'all') ? <View style={{gap: 10}}>
      {catPresets.length ? <Chips scroll value={activeCat} onChange={setCat} options={[{value: '', label: 'Todas as categorias'}, ...catPresets.map(name => ({value: name, label: name}))]} /> : null}
      <Chips scroll value={kind} onChange={setKind} options={[{value: 'all' as const, label: 'Todos'}, {value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}, {value: 'transfer' as const, label: 'Transferências'}, {value: 'card_payment' as const, label: 'Faturas'}]} />
      <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <Chips value={status} onChange={setStatus} options={[{value: 'all' as const, label: 'Tudo'}, {value: 'pending' as const, label: 'Só pendentes'}]} />
        {filterName ? <Pressable onPress={() => setAccountFilter('')} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontWeight: '600', fontSize: 12}}>{filterName} ✕</Text></Pressable> : null}
      </View>
      </View> : null}
      {list.length ? <Text style={{color: c.muted, fontSize: 12}}>{list.length} movimentações no mês · resultado {money(sum)}</Text> : null}
      {!days.length ? <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>{activeCat || kind !== 'all' || status !== 'all' ? 'Nenhum lançamento com esses filtros.' : (source === 'import' ? 'Nenhum extrato importado neste mês. Toque em ＋ ao lado de Histórico para importar (OFX ou CSV).' : 'Nenhum lançamento neste mês. Toque em ＋ para registrar.')}</Text> : days.map(([date, items]) => (
        <View key={date} style={{gap: 8}}>
          <Text style={{color: c.muted, fontSize: 12, fontWeight: '700', paddingLeft: 4}}>{weekday(date)}</Text>
          <Card_ style={{padding: 10, gap: 0}}>{items.map((t, i) => <TxRow key={t.id} t={t} d={d} first={i === 0} onPress={() => onTx(t)} api={api} reload={reload} />)}</Card_>
        </View>
      ))}
    </>
  );
}
function TxRow({t, d, first, onPress, api, reload}: {t: Tx; d: Data; first: boolean; onPress: () => void; api: SofiaApi; reload: () => Promise<void>}) {
  const c = useTheme(), cat = categoryOf(t.category, t.kind);
  const source = t.cardId ? '💳 ' + (d.cards.find(x => x.id === t.cardId)?.name || 'Cartão') : t.kind === 'transfer' ? (d.accounts.find(a => a.id === t.accountId)?.name || '') + ' → ' + (d.accounts.find(a => a.id === t.toAccountId)?.name || '') : d.accounts.find(a => a.id === t.accountId)?.name || '';
  const pending = !t.paid && !t.cardId;
  const color = t.kind === 'income' ? GOOD : t.kind === 'transfer' ? c.muted : c.text;
  return (
    <Pressable onPress={onPress} style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderTopWidth: first ? 0 : 1, borderColor: c.line, opacity: t.virtual ? 0.75 : 1}}>
      <Dot color={cat.color} icon={cat.icon} />
      <View style={{flex: 1}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{t.desc}</Text>
        <Text numberOfLines={1} style={{color: c.muted, fontSize: 11}}>{cat.name} · {source}{t.installments > 1 ? ' · ' + t.installment + '/' + t.installments : ''}{t.recurrence !== 'none' || t.virtual ? ' · 🔁' : ''}</Text>
      </View>
      <View style={{alignItems: 'flex-end', gap: 2}}>
        <Text style={{color, fontWeight: '700'}}>{t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '−'}{money(t.amount)}</Text>
        {pending ? <Pressable onPress={() => void confirmTx(api, t).then(reload).catch(e => appAlert('Finanças', errorText(e)))}><Text style={{fontSize: 11, color: t.date < todayISO() ? BAD : WARN, fontWeight: '700'}}>{t.virtual ? 'previsto · confirmar' : t.kind === 'income' ? 'a receber · ✓' : 'a pagar · ✓'}</Text></Pressable> : null}
      </View>
    </Pressable>
  );
}

// ============================ EDITOR ============================
function TxEditor({api, d, tx, defaultAccountId, onClose, onSaved}: {api: SofiaApi; d: Data; tx: Partial<Tx>; defaultAccountId?: string; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), editing = !!tx.entity && !tx.virtual;
  const [kind, setKind] = useState<TxKind>(tx.kind || 'expense');
  const [amount, setAmount] = useState(tx.amount ? finishMoneyInput(String(tx.amount).replace('.', ',')) : ''), [desc, setDesc] = useState(tx.desc || '');
  const [category, setCategory] = useState(tx.category || ''), [date, setDate] = useState(tx.date || todayISO());
  const firstAccount = (defaultAccountId && d.accounts.some(a=>a.id===defaultAccountId&&!a.archived) ? defaultAccountId : d.accounts.find(a => !a.archived)?.id) || '';
  const [source, setSource] = useState(tx.cardId || tx.accountId || firstAccount), [to, setTo] = useState(tx.toAccountId || d.accounts.find(a => !a.archived && a.id !== firstAccount)?.id || '');
  const [paid, setPaid] = useState(tx.paid ?? true), [repeat, setRepeat] = useState<'none' | 'monthly' | 'installments'>(tx.recurrence && tx.recurrence !== 'none' ? 'monthly' : 'none');
  const [parts, setParts] = useState(3), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const isCard = d.cards.some(x => x.id === source);
  const cats = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const value = parseMoney(amount);
  const sources = kind === 'expense' ? [...d.accounts.filter(a => !a.archived).map(a => ({id: a.id, label: a.name, card: false})), ...d.cards.filter(x => !x.archived).map(x => ({id: x.id, label: '💳 ' + x.name, card: true}))] : d.accounts.filter(a => !a.archived).map(a => ({id: a.id, label: a.name, card: false}));
  const plan = repeat === 'installments' && value ? installmentPlan(value, parts, date) : null;

  async function save() {
    if (!value || value <= 0) { setError('Digite o valor.'); return; }
    if (kind !== 'transfer' && !category) { setError('Escolha a categoria.'); return; }
    if (kind === 'transfer' && (!to || to === source)) { setError('Escolha a conta de destino.'); return; }
    setBusy(true); setError('');
    try {
      const card = d.cards.find(x => x.id === source);
      const base: Record<string, any> = {kind, amount: value, date, category: kind === 'transfer' ? 'Transferência' : category, account_id: card ? '' : source, to_account_id: kind === 'transfer' ? to : '',
        card_id: card ? card.id : '', invoice_month: card ? invoiceMonth(card, date) : '', paid: card ? false : paid, recurrence: repeat === 'monthly' ? 'monthly' : 'none'};
      const title = desc.trim() || (kind === 'transfer' ? 'Transferência' : category);
      if (editing) await saveEntity(api, 'fin_tx', title, base, tx.entity);
      else if (plan && parts > 1) {
        const series = uid();
        for (const p of plan) await saveEntity(api, 'fin_tx', title + ' (' + p.installment + '/' + parts + ')', {...base, amount: p.amount, date: p.date, invoice_month: card ? invoiceMonth(card, p.date) : '', paid: card ? false : p.installment === 1 ? paid : false, series_id: series, installment: p.installment, installments: parts, recurrence: 'none'});
      } else await saveEntity(api, 'fin_tx', title, {...base, ...(tx.virtual ? {series_id: tx.seriesId, recurrence: 'none'} : {})});
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function remove() {
    if (!tx.entity) return;
    // 0.3.178: lancamento que veio de uma conta a pagar/receber paga. Apagar no historico desfaz o
    // pagamento: a conta volta para Pendentes como "a pagar", e o registro nao some de vez.
    if (tx.manualDue && tx.paid) {
      const kind = tx.kind === 'income' ? 'recebimento' : 'pagamento';
      appAlert('Desfazer o ' + kind + '?', '“' + tx.desc + '” sai do histórico e volta para Pendentes como ' + (tx.kind === 'income' ? 'a receber' : 'a pagar') + '.',
        [{text: 'Cancelar', style: 'cancel'}, {text: 'Desfazer', style: 'destructive', onPress: () => void (async () => {
          try { await api.saveEntity({...tx.entity!, data: {...tx.entity!.data, paid: false}}); onSaved(); } catch (e) { setError(errorText(e)); }
        })()}]);
      return;
    }
    const series = tx.seriesId;
    const others = series ? d.txs.filter(x => x.seriesId === series && x.id !== tx.id) : [];
    const del = async (all: boolean) => { try { await api.deleteEntity(tx.entity!.id); if (all) for (const o of others) if (o.entity && !o.paid) await api.deleteEntity(o.entity.id); onSaved(); } catch (e) { setError(errorText(e)); } };
    appAlert('Apagar lançamento?', others.length ? 'Este lançamento faz parte de uma série.' : 'Essa ação não pode ser desfeita.', others.length
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
            {editing ? <Pressable accessibilityLabel={tx.manualDue && tx.paid ? "Desfazer pagamento" : "Apagar lançamento"} onPress={remove} style={{padding: 8}}><Icon name="trash" size={20} color={headText} /></Pressable> : null}
          </View>
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
          <Field label="Descrição" value={desc} onChange={setDesc} placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado do mês'} />
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
              {sources.map(s => <Pressable key={s.id} onPress={() => setSource(s.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: source === s.id ? c.accent : c.input}}><Text style={{color: source === s.id ? '#fff' : c.text, fontSize: 13, fontWeight: '600'}}>{s.label}</Text></Pressable>)}
            </View>
            {isCard ? <Text style={{fontSize: 11, color: c.muted}}>Entra na fatura de {monthLabel(invoiceMonth(d.cards.find(x => x.id === source)!, date)).toLowerCase()}.</Text> : null}
          </View>
          {kind === 'transfer' ? (
            <View style={{gap: 8}}>
              <Text style={{fontSize: 12, color: c.muted}}>Vai para</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {d.accounts.filter(a => !a.archived && a.id !== source).map(a => <Pressable key={a.id} onPress={() => setTo(a.id)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: to === a.id ? c.accent : c.input}}><Text style={{color: to === a.id ? '#fff' : c.text, fontSize: 13, fontWeight: '600'}}>{a.name}</Text></Pressable>)}
              </View>
              {d.accounts.filter(a => !a.archived).length < 2 ? <Text style={{fontSize: 12, color: c.muted}}>Crie uma segunda conta em ⚙ para transferir.</Text> : null}
            </View>
          ) : null}
          <View style={{flexDirection: 'row', gap: 8}}>
            {[['Hoje', todayISO()], ['Ontem', addDays(todayISO(), -1)]].map(([l, v]) => <Pressable key={l} onPress={() => setDate(v)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: date === v ? c.accent : c.input}}><Text style={{color: date === v ? '#fff' : c.text, fontWeight: '600', fontSize: 13}}>{l}</Text></Pressable>)}
          </View>
          <DateTimeField label="Data" value={date} onChange={v => v && setDate(v)} dateOnly allowClear={false} />
          {!isCard && kind !== 'transfer' ? (
            <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text, fontSize: 15}}>{kind === 'income' ? 'Já recebi' : 'Já paguei'}</Text><Switch value={paid} onValueChange={setPaid} /></View>
          ) : null}
          {!editing && kind !== 'transfer' ? (
            <View style={{gap: 10}}>
              <Text style={{fontSize: 12, color: c.muted}}>Repetir</Text>
              <Chips value={repeat} onChange={setRepeat} options={[{value: 'none' as const, label: 'Não'}, {value: 'monthly' as const, label: 'Todo mês'}, ...(kind === 'expense' ? [{value: 'installments' as const, label: 'Parcelado'}] : [])]} />
              {repeat === 'monthly' ? <Text style={{fontSize: 12, color: c.muted}}>Aparece todo mês como previsto (aluguel, assinatura, salário). Você confirma com um toque quando pagar.</Text> : null}
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
function CardsTab({d, api, reload, onTx, onManage}: {d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onManage: () => void}) {
  const c = useTheme(), cards = d.cards.filter(x => !x.archived);
  const [cardId, setCardId] = useState(cards[0]?.id || ''), card = cards.find(x => x.id === cardId) || cards[0];
  const invoices = card ? cardInvoices(card, d.txs) : [];
  const currentIdx = card ? Math.max(0, invoices.findIndex(i => i.month === invoiceMonth(card, todayISO()))) : 0;
  const [idx, setIdx] = useState<number | null>(null), i = invoices[idx ?? currentIdx];
  const [pick, setPick] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { setIdx(null); }, [cardId]);
  if (!card) return <Card_><Text style={{color: c.text, fontWeight: '700'}}>Nenhum cartão ainda</Text><Text style={{color: c.muted}}>Adicione seu cartão com limite, dia de fechamento e vencimento. A Sofia monta as faturas sozinha.</Text><Button title="Adicionar cartão" onPress={onManage} /></Card_>;
  const used = cardUsed(card, d.txs);
  const statusColor: Record<Invoice['status'], string> = {aberta: '#4fa3ff', fechada: WARN, paga: GOOD, vencida: BAD, futura: c.muted};
  async function pay(accountId: string) {
    setPick(false); setBusy(true);
    try { await saveEntity(api, 'fin_tx', 'Fatura ' + card.name + ' ' + i.month.slice(5, 7) + '/' + i.month.slice(0, 4), {kind: 'card_payment', amount: Math.round((i.total - i.paid) * 100) / 100, date: todayISO(), card_id: card.id, invoice_month: i.month, account_id: accountId, paid: true, category: 'Fatura do cartão'}); await reload(); }
    catch (e) { appAlert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  return (
    <>
      {cards.length > 1 ? <Chips scroll value={card.id} onChange={setCardId} options={cards.map(x => ({value: x.id, label: x.name}))} /> : null}
      <View style={{backgroundColor: card.color, borderRadius: 22, padding: 18, gap: 10}}>
        <Text style={{color: '#fff', fontWeight: '800', fontSize: 18}}>💳 {card.name}</Text>
        <Text style={{color: '#ffffffcc', fontSize: 12}}>Limite {money(card.limit)} · usado {money(used)} · disponível {money(Math.max(0, card.limit - used))}</Text>
        <View style={{height: 8, borderRadius: 4, backgroundColor: '#ffffff44', overflow: 'hidden'}}><View style={{width: `${Math.min(100, card.limit ? used / card.limit * 100 : 0)}%`, height: 8, backgroundColor: '#fff'}} /></View>
        <Text style={{color: '#ffffffcc', fontSize: 11}}>Fecha dia {card.closing} · vence dia {card.due}</Text>
      </View>
      {i ? (
        <Card_>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <IconButton name="back" label="Fatura anterior" size={36} disabled={(idx ?? currentIdx) <= 0} onPress={() => setIdx(Math.max(0, (idx ?? currentIdx) - 1))} />
            <View style={{flex: 1, alignItems: 'center'}}>
              <Text style={{color: c.text, fontWeight: '700'}}>Fatura de {monthLabel(i.month).toLowerCase()}</Text>
              <View style={{paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: statusColor[i.status] + '22', marginTop: 4}}><Text style={{color: statusColor[i.status], fontWeight: '700', fontSize: 11}}>{i.status.toUpperCase()}</Text></View>
            </View>
            <Pressable accessibilityLabel="Próxima fatura" disabled={(idx ?? currentIdx) >= invoices.length - 1} onPress={() => setIdx(Math.min(invoices.length - 1, (idx ?? currentIdx) + 1))} style={{width: 36, height: 36, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '180deg'}], opacity: (idx ?? currentIdx) >= invoices.length - 1 ? 0.3 : 1}}><Icon name="back" size={20} color={c.text} /></Pressable>
          </View>
          <Text style={{color: c.text, fontSize: 30, fontWeight: '800', textAlign: 'center'}}>{money(i.total)}</Text>
          <Text style={{color: c.muted, fontSize: 12, textAlign: 'center'}}>Fecha {dateBR(i.close)} · vence {dateBR(i.due)}{i.paid ? ' · pago ' + money(i.paid) : ''}</Text>
          {i.total > i.paid && i.status !== 'futura' ? <Button title={busy ? 'Pagando…' : 'Pagar fatura · ' + money(i.total - i.paid)} loading={busy} onPress={() => d.accounts.filter(a => !a.archived).length > 1 ? setPick(true) : void pay(card.accountId || d.accounts[0].id)} /> : null}
          {i.items.length ? i.items.map((t, k) => <TxRow key={t.id} t={t} d={d} first={k === 0} onPress={() => onTx(t)} api={api} reload={reload} />) : <Text style={{color: c.muted, textAlign: 'center'}}>Nenhuma compra nesta fatura.</Text>}
        </Card_>
      ) : null}
      <Sheet visible={pick} onClose={() => setPick(false)} label="Fechar escolha de conta">
        <Text style={{fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8}}>Pagar com qual conta?</Text>
        {d.accounts.filter(a => !a.archived).map(a => <Pressable key={a.id} onPress={() => void pay(a.id)} style={{paddingVertical: 14}}><Text style={{color: c.text, fontSize: 15}}>{a.name} · {money(accountBalance(a, d.txs))}</Text></Pressable>)}
      </Sheet>
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
      <ScrollView contentContainerStyle={{gap: 12}}>
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
      <ScrollView contentContainerStyle={{gap: 12}}>
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
function ReportsTab({d, month, reserve}: {d: Data; month: string; reserve: Goal | null}) {
  const c = useTheme(), [kind, setKind] = useState<'expense' | 'income'>('expense');
  const cats = useMemo(() => byCategory(d.txs, month, kind), [d, month, kind]), total = cats.reduce((s, x) => s + x.total, 0);
  const {t6, s, prev, bal, saved} = useMemo(() => ({t6: trend(d.txs, month, 6), s: monthSummary(d.txs, month), prev: monthSummary(d.txs, addMonths(month, -1)), bal: balanceSeries(d.accounts, d.txs, month, reserve ? {goalId: reserve.id, moves: d.moves || []} : undefined), saved: reserve ? reserveSeries(reserve, d.moves || [], month) : []}), [d, month, reserve]);
  const max = Math.max(1, ...t6.flatMap(x => [x.income, x.expense]));
  const [w, setW] = useState(0);
  return (
    <>
      <Card_>
        <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, fontSize: 16, fontWeight: '700', color: c.text}}>Por categoria</Text><Chips value={kind} onChange={setKind} options={[{value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}]} /></View>
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
      </Card_>
      <Card_>
        <Title text="Comparado ao mês anterior" />
        {[['Receitas', s.income + s.incomePending, prev.income + prev.incomePending, true], ['Despesas', s.expense + s.expensePending, prev.expense + prev.expensePending, false]].map(([label, now, before, up]) => {
          const n = now as number, b = before as number, diff = b ? (n - b) / b * 100 : null, good = diff === null ? null : (up ? diff >= 0 : diff <= 0);
          return <View key={label as string} style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, color: c.text}}>{label as string}</Text><Text style={{color: c.text, fontWeight: '700', marginRight: 8}}>{money(n)}</Text><Text style={{color: good === null ? c.muted : good ? GOOD : BAD, fontSize: 12, width: 70, textAlign: 'right'}}>{diff === null ? '—' : (diff > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(diff)) + '%'}</Text></View>;
        })}
      </Card_>
      <Card_>
        <Title text="Receitas × despesas · 6 meses" />
        <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{height: 150}}>
          {w ? <Svg width={w} height={150}>
            <Line x1={0} x2={w} y1={130} y2={130} stroke={c.line} />
            {t6.map((m, i) => { const bw = w / t6.length, x = i * bw + bw * 0.18, h1 = m.income / max * 120, h2 = m.expense / max * 120; return <React.Fragment key={m.month}><Rect x={x} y={130 - h1} width={bw * 0.3} height={h1} rx={3} fill={GOOD} /><Rect x={x + bw * 0.33} y={130 - h2} width={bw * 0.3} height={h2} rx={3} fill={BAD} /></React.Fragment>; })}
          </Svg> : null}
        </View>
        <View style={{flexDirection: 'row'}}>{t6.map(m => <Text key={m.month} style={{flex: 1, textAlign: 'center', fontSize: 10, color: m.month === month ? c.text : c.muted, fontWeight: m.month === month ? '700' : '400'}}>{monthLabel(m.month).slice(0, 3)}</Text>)}</View>
        <View style={{flexDirection: 'row', gap: 14, justifyContent: 'center'}}><Text style={{color: GOOD, fontSize: 12}}>● Receitas</Text><Text style={{color: BAD, fontSize: 12}}>● Despesas</Text></View>
      </Card_>
      {bal.length > 1 ? (
        <Card_>
          <Title text="Evolução do saldo no mês" />
          <PriceChart lines={[{id: 'saldo', color: c.accent, points: bal}]} height={160} window="all" mode="price" />
        </Card_>
      ) : null}
      {/* 0.3.160: evolucao do guardado, ao lado da do saldo */}
      {saved.length > 1 ? (
        <Card_>
          <Title text="Evolução do guardado no mês" />
          <PriceChart lines={[{id: 'guardado', color: GUARD, points: saved}]} height={160} window="all" mode="price" />
          <Text style={{color: c.muted, fontSize: 12}}>De {money(saved[0].v)} no início a {money(saved[saved.length - 1].v)} hoje.</Text>
        </Card_>
      ) : null}
    </>
  );
}

// ============================ CONTAS E CARTÕES ============================
function ManageSheet({api, d, onClose, reload, onFinished}: {api: SofiaApi; d: Data; onClose: () => void; reload: () => Promise<void>; onFinished?: () => void}) {
  const c = useTheme(), [edit, setEdit] = useState<{type: 'account'; item: Account | null} | {type: 'card'; item: Card | null} | null>(null);
  const [setup, setSetup] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{paddingTop: 40, paddingBottom: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line}}>
          <IconButton name="back" label="Voltar" onPress={onClose} /><Text style={{flex: 1, fontSize: 17, fontWeight: '700', color: c.text}}>Contas e cartões</Text>
        </View>
        {setup ? <Onboarding api={api} onDone={reload} onClose={() => setSetup(false)} onFinished={() => { setSetup(false); onFinished ? onFinished() : onClose(); }} existing={{account: d.accounts.find(a => !a.archived) || null, reserve: reserveOf(d.goals), fixed: d.txs.filter(t => t.manualDue && t.recurrence === 'monthly' && !t.virtual && t.kind === 'expense' && t.entity?.state !== 'archived')}} /> :
        <ScrollView contentContainerStyle={{padding: 18, gap: 14}}>
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
    try { const r = await api.financeImportPreview(file.text, target.type, target.id); setPreview(r.items); setChosen(new Set(r.items.filter(i => !i.duplicate && !i.skip).map(i => i.import_id))); }
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
            {file && target && !preview ? <Button title="Analisar extrato" loading={busy} onPress={() => void analyze()} /> : null}
            {preview ? (
              <View style={{gap: 6}}>
                <Text style={{fontSize: 12, color: c.muted, fontWeight: '700'}}>3. Confira ({chosenItems.length} de {preview.length} marcados · {money(Math.abs(sum))} {sum >= 0 ? 'de entrada' : 'de saída'})</Text>
                <View><ScrollView nestedScrollEnabled>
                  {preview.map(i => <Pressable key={i.import_id} disabled={!!i.skip} onPress={() => toggle(i.import_id)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.line, opacity: i.skip ? 0.45 : 1}}>
                    <View style={{width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: chosen.has(i.import_id) ? c.accent : c.line, backgroundColor: chosen.has(i.import_id) ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center'}}>{chosen.has(i.import_id) ? <Text style={{color: c.onAccent, fontSize: 13, fontWeight: '800'}}>✓</Text> : null}</View>
                    <View style={{flex: 1}}><Text style={{color: c.text}} numberOfLines={1}>{i.desc}</Text><Text style={{fontSize: 11, color: c.muted}}>{i.date.split('-').reverse().join('/')}{i.category ? ' · ' + i.category : ''}{i.duplicate ? ' · já importado' : ''}{i.skip ? ' · ' + i.skip : ''}</Text></View>
                    <Text style={{fontWeight: '700', color: i.kind === 'income' ? '#2fc58b' : c.text}}>{i.kind === 'income' ? '+' : '-'}{money(i.amount)}</Text>
                  </Pressable>)}
                </ScrollView></View>
                <Button title={'Importar ' + chosenItems.length + (chosenItems.length === 1 ? ' lançamento' : ' lançamentos')} loading={busy} disabled={!chosenItems.length} onPress={() => void confirm()} />
              </View>
            ) : null}
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
          </>
        )}
      </View>
    </Sheet>
  );
}
