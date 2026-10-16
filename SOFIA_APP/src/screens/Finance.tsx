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
import {Button, IconButton, SofiaLogo} from '../components/UI';
import {PriceChart} from '../components/PriceChart';
import {Spinner, LoadingLines} from '../components/Loading';
import {money} from '../lib/monitoring';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, ACCOUNT_TYPES, FIN_COLORS, categoryOf, toAccount, toCard, toTx, toBudget, toGoal, monthOf, addMonths, monthLabel, todayISO,
  invoiceMonth, cardInvoices, cardUsed, installmentPlan, accountBalance, totalBalance, forecastBalance, monthTxs, monthSummary, byCategory, budgetProgress,
  trend, balanceSeries, upcoming, manualDues, transactionsForAccount, financeInsights, goalProgress, parseMoney, formatMoneyInput, finishMoneyInput, addDays,
} from '../lib/finance';
import type {Account, Card, Tx, TxKind, Budget, Goal, Invoice, Due, ReserveMove} from '../lib/finance';
import {moneySplit, reserveOf, reserveFor, toReserveMove} from '../lib/finance';
import {syncFinanceDueNotifications} from '../lib/finance-notifications';

const GOOD = '#2fc58b', BAD = '#ff6b7a', WARN = '#ffb547';
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
  return <View style={[{backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 12}, style]}>{children}</View>;
}
function Title({text, action, onAction}: {text: string; action?: string; onAction?: () => void}) {
  const c = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{flex: 1, fontSize: 16, fontWeight: '700', color: c.text}}>{text}</Text>{action ? <Pressable onPress={onAction}><Text style={{color: c.accent, fontWeight: '600', fontSize: 13}}>{action}</Text></Pressable> : null}</View>;
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
    void syncFinanceDueNotifications(d.txs, api.owner).then(w => {if(valid)setNotificationWarning(w);});
    return () => {valid=false;};
  },[active,api,d]);

  return (
    <InternalBackGesture enabled={active && !editing && !manage && !billEditor && !accountPicker} onBack={backFinance}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4}}>
          <IconButton name="back" label="Voltar à tela anterior" onPress={backFinance} />
          <View style={{flex: 1, paddingHorizontal: 4}}>
            <Text style={{fontSize: 24, fontWeight: '800', color: c.text}}>Finanças</Text>
          </View>
          <IconButton name="settings" label="Contas e cartões" onPress={() => setManage(true)} />
        </View>
        {/* 0.3.152: conta e mes na mesma linha, compactos (antes eram dois blocos grandes) */}
        <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6, gap: 8}}>
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
        <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
          <Chips scroll value={tab} onChange={navigateFinance} options={[{value: 'home' as Tab, label: 'Resumo'}, {value: 'bills' as Tab, label: 'Pendentes'}, {value: 'cards' as Tab, label: 'Cartões'}, {value: 'reports' as Tab, label: 'Relatórios'}]} />
        </View>

        {!d ? <View style={{flex: 1, padding: 16, gap: 14}}>{error ? <View style={{padding: 20, gap: 12}}><Text style={{color: c.danger}}>{error}</Text><Button title="Tentar de novo" secondary onPress={() => void reload()} /></View> : <View style={{gap: 6}}><View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}><Spinner size={16} stroke={1.8} /><Text style={{color: c.muted, fontSize: 13}}>Carregando suas finanças</Text></View><LoadingLines rows={5} /></View>}</View> : !d.accounts.length ? (
          <Onboarding api={api} onDone={reload} />
        ) : (
          <ScrollView contentContainerStyle={{padding: 16, paddingBottom: insets.bottom + 110, gap: 14}} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
            {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
            {tab === 'home' ? <HomeTab d={scoped || d} month={month} api={api} reload={reload} onTx={setEditing} onTab={navigateFinance} accountId={accountId} isPrimary={isPrimary} onBill={t => setBillEditor(t || 'new')} />
              : tab === 'bills' ? <PendingTab d={scoped || d} api={api} month={month} accountId={accountId} warning={notificationWarning} onBill={setBillEditor} reload={reload} />
              : tab === 'cards' ? <CardsTab d={scoped || d} api={api} reload={reload} onTx={setEditing} onManage={() => setManage(true)} />
              : <ReportsTab d={scoped || d} month={month} />}
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
        {manage && d ? <ManageSheet api={api} d={d} onClose={() => setManage(false)} reload={reload} /> : null}
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
  );
}

// ============================ PRIMEIRO USO ============================
function Onboarding({api, onDone}: {api: SofiaApi; onDone: () => Promise<void>}) {
  const c = useTheme(), [name, setName] = useState('Conta principal'), [balance, setBalance] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function create() {
    const v = balance.trim() ? parseMoney(balance) : 0;
    if (v === null) { setError('Saldo inválido. Exemplo: 1.250,00'); return; }
    setBusy(true);
    try { await saveEntity(api, 'fin_account', name.trim() || 'Conta principal', {account_type: 'corrente', initial_balance: String(v), color: FIN_COLORS[0], include_total: true}); await onDone(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <ScrollView contentContainerStyle={{padding: 22, gap: 16}}>
      <View style={{alignItems: 'center', gap: 10, paddingVertical: 20}}>
        <View style={{width: 84, height: 84, borderRadius: 42, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'}}><Icon name="wallet" size={40} color={c.accent} /></View>
        <Text style={{fontSize: 21, fontWeight: '800', color: c.text, textAlign: 'center'}}>Controle seu dinheiro em um lugar só</Text>
        <Text style={{fontSize: 14, color: c.muted, textAlign: 'center', lineHeight: 21}}>Contas, cartões com fatura, contas a pagar, orçamento por categoria, objetivos e relatórios. Comece pela conta que você mais usa.</Text>
      </View>
      <Field label="Nome da conta" value={name} onChange={setName} />
      <Field label="Saldo de hoje (R$)" value={balance} onChange={setBalance} placeholder="0,00" numeric />
      {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
      <Button title="Criar conta e começar" loading={busy} onPress={() => void create()} />
      <Text style={{fontSize: 12, color: c.muted, textAlign: 'center'}}>Depois você adiciona outras contas e cartões em ⚙ no topo.</Text>
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
function ReserveSheet({api, kind, reserve, split, onClose, onDone, accountId = ''}: {accountId?: string; api: SofiaApi; kind: 'setup' | 'in' | 'out' | 'plan'; reserve: Goal | null; split: ReturnType<typeof moneySplit> | null; onClose: () => void; onDone: () => Promise<void>}) {
  const c = useTheme();
  const [name, setName] = useState(reserve?.name || 'Dinheiro guardado'), [amount, setAmount] = useState(''), [plan, setPlan] = useState(reserve?.entity?.data?.monthly_plan ? finishMoneyInput(String(reserve.entity.data.monthly_plan).replace('.', ',')) : ''), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const title = kind === 'setup' ? 'Separar o dinheiro guardado' : kind === 'in' ? 'Guardar dinheiro' : kind === 'out' ? 'Retirar da reserva' : 'Ajustar aporte mensal';
  async function save() {
    setBusy(true); setError('');
    try {
      if (kind === 'setup') {
        const saved = parseMoney(amount) ?? 0, monthly = parseMoney(plan) ?? 0;
        if (saved < 0 || monthly < 0) throw Error('Use valores positivos.');
        await api.saveEntity({kind: 'fin_goal', title: name.trim() || 'Dinheiro guardado', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {role: 'reserve', saved, monthly_plan: monthly, target: '', deadline: '', color: GOOD, account_id: accountId || ''}});
      } else if (kind === 'plan' && reserve) {
        const monthly = parseMoney(plan) ?? 0;
        await api.saveEntity({...reserve.entity, data: {...reserve.entity.data, monthly_plan: monthly}});
      } else if (reserve) {
        const v = parseMoney(amount);
        if (!v || v <= 0) throw Error('Informe o valor.');
        await api.saveEntity({kind: 'fin_reserve_move', title: kind === 'in' ? 'Guardado na reserva' : 'Retirada da reserva', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {goal_id: reserve.id, direction: kind, amount: v, date: todayISO(), note: note.trim()}});
      }
      await onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function confirmOut() { Alert.alert('Retirar da reserva?', 'Esse valor deixa de ser dinheiro guardado e passa para o dia a dia. É uma retirada consciente, registrada no histórico.', [{text: 'Cancelar'}, {text: 'Retirar', style: 'destructive', onPress: () => void save()}]); }
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
  return <Sheet visible onClose={onClose} label={'Fechar ' + title}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 14, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '800', color: c.text}}>{title}</Text>
      {error ? <Text style={{color: BAD}}>{error}</Text> : null}
      {kind === 'setup' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Informe o dinheiro que já está guardado nas suas contas. Ele não é somado de novo: a Sofia só passa a separá-lo do dinheiro para o dia a dia.</Text>
        {input('Nome', name, setName, 'Dinheiro guardado')}
        {input('Já guardado hoje', amount, setAmount, 'Ex.: 15.000')}
        {input('Aporte mensal planejado (opcional)', plan, setPlan, 'Ex.: 4.000')}
      </> : kind === 'plan' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>É a intenção do mês. O guardado só aumenta quando você registrar o aporte em “Guardar dinheiro”.</Text>
        {input('Aporte mensal planejado', plan, setPlan, 'Ex.: 4.000')}
      </> : <>
        {kind === 'in' && split ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Sai do dia a dia ({money(split.daily)}) e passa a ser guardado. Não é despesa nem receita: o total não muda.{split.missing > 0 ? ' Faltam ' + money(split.missing) + ' para o aporte do mês.' : ''}</Text> : null}
        {kind === 'out' && split ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Hoje guardado: {money(split.saved)}. A retirada passa o valor para o dia a dia.</Text> : null}
        {input('Valor', amount, setAmount, kind === 'in' && split && split.missing > 0 ? String(split.missing).replace('.', ',') : 'Ex.: 500')}
        {input('Observação (opcional)', note, setNote)}
      </>}
      <Button title={kind === 'out' ? 'Retirar' : 'Salvar'} loading={busy} onPress={() => kind === 'out' ? confirmOut() : void save()} />
    </ScrollView>
  </Sheet>;
}

// ============================ PENDENTES MANUAIS ============================
function PendingTab({d,api,month,accountId,warning,onBill,reload}: {d:Data;api:SofiaApi;month:string;accountId:string;warning:string;onBill:(t:Tx|'new')=>void;reload:()=>Promise<void>}) {
  const c=useTheme(),today=todayISO(),list=useMemo(()=>manualDues(d.txs,accountId,today,120),[d,accountId,today]);
  const total=list.reduce((sum,row)=>sum+row.amount,0);
  return <>
    <Card_>
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
        <View style={{flex:1,gap:5}}><Text style={{fontSize:17,fontWeight:'800',color:c.text}}>A pagar e a receber</Text>
        <Text style={{fontSize:12,color:c.muted,lineHeight:18}}>Cadastre cada vencimento manualmente. Compras e extratos não criam pendências.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cadastrar conta a pagar" onPress={()=>onBill('new')} style={{backgroundColor:c.accent,paddingHorizontal:13,paddingVertical:11,borderRadius:12}}>
          <Text style={{color:c.onAccent,fontSize:13,fontWeight:'800'}}>＋ Nova</Text>
        </Pressable>
      </View>
      <View style={{borderTopWidth:1,borderColor:c.line,paddingTop:12,flexDirection:'row',justifyContent:'space-between'}}>
        <Text style={{color:c.muted,fontSize:12}}>{list.length} pendentes cadastradas</Text>
        <Text style={{color:c.text,fontWeight:'800'}}>{money(total)}</Text>
      </View>
      {warning ? <Text style={{fontSize:12,color:WARN}}>{warning}</Text> : null}
    </Card_>
    <Card_>
      <Title text="A vencer e atrasadas" />
      {list.length ? list.map(due=><DueRow key={due.id} due={due} d={d} api={api} reload={reload} onTx={t=>onBill(t as Tx)} />)
        : <Text style={{color:c.muted,fontSize:13,lineHeight:20}}>Nenhum vencimento manual nos próximos 120 dias. Adicione boletos, contas ou dívidas com a data em que deseja ser lembrado.</Text>}
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
        paid:false,card_id:'',to_account_id:'',
        recurrence:tx?.virtual?'none':repeat,
        series_id:tx?.seriesId||'',
        import_id:existing?String(tx?.entity?.data?.import_id||''): 'sofia-pendencia:'+uid(),
      };
      await saveEntity(api,'fin_tx',name.trim(),data,existing?tx?.entity:undefined);
      onSaved();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  function erase() {
    if(!tx?.entity||tx.virtual)return;
    Alert.alert('Excluir vencimento?', 'Esse cadastro será apagado. Lançamentos já pagos de meses anteriores não serão excluídos.', [
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
function HomeTab({d, month, api, reload, onTx, onTab, accountId, isPrimary, onBill}: {d: Data; month: string; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void; onTab: (t: Tab) => void; accountId: string; isPrimary: boolean; onBill: (t?: Tx) => void}) {
  const c = useTheme(), today = todayISO();
  // Contas pesadas só quando os dados ou o mês mudam (não a cada toque, como esconder valores).
  const {s, total, forecast, dues} = useMemo(() => ({s: monthSummary(d.txs, month), total: totalBalance(d.accounts, d.txs), forecast: forecastBalance(d.accounts, d.txs, month, d.cards),
    dues: manualDues(d.txs, accountId, today, 10)}), [d, accountId, month, today]);
  const [hide, setHide] = useState(false), [reserveSheet, setReserveSheet] = useState<'setup' | 'in' | 'out' | 'plan' | null>(null);
  const show = (v: number) => hide ? 'R$ •••••' : money(v);
  // 0.3.151: cada conta tem o proprio guardado (a principal mantem a reserva antiga, sem conta).
  const reserve = reserveFor(d.goals, accountId, isPrimary);
  const tips = useMemo(() => financeInsights(d.txs, month), [d, month]);
  const split = useMemo(() => reserve ? moneySplit(reserve, d.moves || [], d.accounts, d.txs, d.cards, month, today, manualDues(d.txs,accountId,today,45)) : null, [reserve, d, accountId, month, today]);
  // Reserva em linha discreta no cartão original; o detalhamento dos valores fica sob demanda.
  const [reserveMenu, setReserveMenu] = useState(false);
  return (
    <>
      {reserveSheet ? <ReserveSheet accountId={accountId} api={api} kind={reserveSheet} reserve={reserve} split={split} onClose={() => setReserveSheet(null)} onDone={async () => { setReserveSheet(null); await reload(); }} /> : null}
      {accountId ? <Pressable accessibilityRole="button" accessibilityLabel="Gerenciar dinheiro guardado" onPress={() => split ? setReserveMenu(true) : setReserveSheet('setup')}
        style={{backgroundColor:'#e99334',borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:14,paddingHorizontal:20,paddingBottom:25,marginBottom:-19,flexDirection:'row',alignItems:'center',gap:10}}>
        <Icon name="shield" size={16} color="#3c270e" />
        <Text style={{color:'#3c270e',fontWeight:'700',fontSize:13,flex:1}}>Guardado</Text>
        {split && split.planned > 0 && split.missing > 0 ? <Text style={{color:'#3c270e',fontSize:11}}>faltam {show(split.missing)} no mês</Text> : null}
        <Text style={{color:'#3c270e',fontWeight:'800',fontSize:18}}>{split ? show(split.saved) : 'Configurar ›'}</Text>
      </Pressable> : null}
      <View style={{backgroundColor: c.accent, borderRadius: 24, padding: 18, gap: 14, elevation: 2}}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={{flex: 1, color: c.onAccent + 'cc', fontSize: 13}}>Saldo geral</Text>
          <Pressable accessibilityLabel={hide ? 'Mostrar valores' : 'Esconder valores'} onPress={() => setHide(h => !h)}><Icon name="eye" size={18} color={c.onAccent + 'cc'} /></Pressable>
        </View>
        <Text style={{color: c.onAccent, fontSize: 32, fontWeight: '800'}}>{show(total)}</Text>
        <Text style={{color: c.onAccent + 'cc', fontSize: 12}}>Previsto no fim de {monthLabel(month).split(' ')[0].toLowerCase()}: <Text style={{color: c.onAccent, fontWeight: '700'}}>{show(forecast)}</Text></Text>
        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 14, padding: 10}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↑ Receitas</Text><Text style={{color: c.onAccent, fontWeight: '800', fontSize: 16}}>{show(s.income)}</Text></View>
          <View style={{flex: 1, backgroundColor: c.onAccent + '22', borderRadius: 14, padding: 10}}><Text style={{color: c.onAccent + 'cc', fontSize: 11}}>↓ Despesas</Text><Text style={{color: c.onAccent, fontWeight: '800', fontSize: 16}}>{show(s.expense)}</Text></View>
        </View>

      </View>
      <Sheet visible={reserveMenu} onClose={() => setReserveMenu(false)} label="Fechar detalhes da reserva">
        <View style={{gap: 14, paddingBottom: 12}}>
          <Text style={{fontSize: 18, fontWeight: '800', color: c.text}}>Sua reserva</Text>
          {split ? <>
            <Text style={{fontSize: 29, fontWeight: '800', color: c.text}}>{show(split.saved)}</Text>
            <Text style={{fontSize: 12, lineHeight: 18, color: c.muted}}>Esse dinheiro está incluído no saldo geral. A separação organiza o que você pretende preservar, mas não bloqueia nem transfere valores no banco.</Text>
            <View style={{backgroundColor: c.input, borderRadius: 16, padding: 14, gap: 10}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Saldo geral nas contas</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(split.total)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Fora da reserva</Text><Text style={{color: split.daily < 0 ? BAD : c.text, fontWeight: '700'}}>{show(split.daily)}</Text></View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.muted, fontSize: 12}}>Despesas previstas do mês</Text><Text style={{color: c.text, fontWeight: '700'}}>{show(split.committed)}</Text></View>
              <View style={{height: 1, backgroundColor: c.line}} />
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: c.text, fontWeight: '700', fontSize: 12}}>Livre após despesas previstas</Text><Text style={{color: split.free < 0 ? BAD : GOOD, fontWeight: '800'}}>{show(split.free)}</Text></View>
            </View>
            {split.daily < 0 ? <Text style={{color: BAD, fontSize: 12}}>Sua reserva está maior que o saldo geral das contas. Confira os valores antes de gastar.</Text> : null}
          </> : null}
          {[['Guardar dinheiro', 'in'], ['Retirar da reserva', 'out'], ['Ajustar aporte mensal', 'plan']].map(([label, k]) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => { setReserveMenu(false); setReserveSheet(k as 'in' | 'out' | 'plan'); }}
              style={{paddingVertical: 13, borderBottomWidth: 1, borderColor: c.line}}>
              <Text style={{color: k === 'out' ? BAD : c.text, fontSize: 15, fontWeight: '600'}}>{label}  ›</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* 0.3.152: vencimentos proximos viram uma linha so (o detalhe fica em Pendentes); cartoes ficam na aba Cartoes */}
      {dues.length ? <Pressable accessibilityRole="button" accessibilityLabel="Ver pendentes" onPress={() => onTab('bills')}
        style={{flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: dues.some(x => x.late) ? BAD : c.line}}>
        <Text style={{fontSize: 16}}>⏰</Text>
        <Text style={{flex: 1, color: c.text, fontSize: 13}}>{dues.some(x => x.late) ? 'Há conta atrasada' : dues.length === 1 ? '1 vencimento nos próximos 10 dias' : dues.length + ' vencimentos nos próximos 10 dias'}</Text>
        <Text style={{color: c.text, fontWeight: '700', fontSize: 13}}>{show(dues.reduce((sum, x) => sum + x.amount, 0))}</Text><Text style={{color: c.muted}}>›</Text>
      </Pressable> : null}

      <View style={{gap: 10, paddingTop: 2}}>
        <TxTab d={d} month={month} accountFilter="" setAccountFilter={() => undefined} onTx={onTx} api={api} reload={reload} />
      </View>
      {/* 0.3.151: feedback curto da Sofia sobre o mes desta conta (o completo fica em Relatorios) */}
      {tips.length ? <Pressable accessibilityRole="button" accessibilityLabel="Ver a análise completa em Relatórios" onPress={() => onTab('reports')} style={{backgroundColor: c.surface, borderRadius: 18, padding: 14, gap: 6, borderWidth: 1, borderColor: c.line}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><SofiaLogo size={22} /><Text style={{flex: 1, color: c.text, fontWeight: '800', fontSize: 14}}>A Sofia sobre o seu mês</Text><Text style={{color: c.accent, fontSize: 12, fontWeight: '700'}}>Ver mais ›</Text></View>
        {tips.slice(0, 2).map((t, i) => <Text key={i} style={{color: t.tone === 'attention' ? WARN : t.tone === 'good' ? GOOD : c.muted, fontSize: 13, lineHeight: 19}}>{t.tone === 'good' ? '✓ ' : t.tone === 'attention' ? '! ' : '• '}<Text style={{color: c.text}}>{t.text}</Text></Text>)}
      </Pressable> : null}

    </>
  );
}
function DueRow({due, d, api, reload, onTx}: {due: Due; d: Data; api: SofiaApi; reload: () => Promise<void>; onTx: (t: Partial<Tx>) => void}) {
  const c = useTheme(), [busy, setBusy] = useState(false), [pick, setPick] = useState(false);
  const color = due.kind === 'receber' ? GOOD : due.late ? BAD : due.kind === 'fatura' ? c.accent : WARN;
  async function settle(accountId?: string) {
    setBusy(true);
    try {
      if (due.invoice) {
        const acc = accountId || due.invoice.card.accountId || d.accounts[0]?.id;
        await saveEntity(api, 'fin_tx', 'Fatura ' + due.invoice.card.name + ' ' + due.invoice.month.slice(5, 7) + '/' + due.invoice.month.slice(0, 4), {kind: 'card_payment', amount: due.amount, date: todayISO(), card_id: due.invoice.card.id, invoice_month: due.invoice.month, account_id: acc, paid: true, category: 'Fatura do cartão'});
      } else if (due.tx) await confirmTx(api, due.tx);
      await reload();
    } catch (e) { Alert.alert('Finanças', errorText(e)); } finally { setBusy(false); }
  }
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
      <View style={{width: 4, height: 34, borderRadius: 2, backgroundColor: color}} />
      <Pressable style={{flex: 1}} onPress={() => due.tx && onTx(due.tx)}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{due.title}</Text>
        <Text style={{fontSize: 11, color: due.late ? BAD : c.muted}}>{due.late ? 'Atrasado · ' : ''}{due.kind === 'receber' ? 'receber' : 'vence'} {dateBR(due.date)}{due.tx?.virtual ? ' · repetição' : ''}</Text>
      </Pressable>
      <Text style={{color: due.kind === 'receber' ? GOOD : c.text, fontWeight: '700'}}>{money(due.amount)}</Text>
      <Pressable disabled={busy} onPress={() => due.invoice && d.accounts.length > 1 ? setPick(true) : void settle()} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: color + '22'}}>
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
async function confirmTx(api: SofiaApi, t: Tx) {
  if (t.virtual) {
    const data: Record<string, any> = {kind: t.kind, amount: t.amount, date: t.date, category: t.category, account_id: t.accountId, paid: true, series_id: t.seriesId, recurrence: 'none'};
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
  const c = useTheme(), [kind, setKind] = useState<'all' | TxKind>('all'), [q, setQ] = useState(''), [status, setStatus] = useState<'all' | 'pending'>('all');
  const list = monthTxs(d.txs, month).filter(t => (!t.manualDue || t.paid) && (kind === 'all' || t.kind === kind) && (!accountFilter || t.accountId === accountFilter || t.toAccountId === accountFilter || t.cardId === accountFilter)
    && (status === 'all' || (!t.paid && !t.cardId)) && (!q.trim() || (t.desc + ' ' + t.category).toLowerCase().includes(q.trim().toLowerCase())));
  const days = useMemo(() => { const m = new Map<string, Tx[]>(); for (const t of list) { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date)!.push(t); } return [...m.entries()]; }, [list]);
  const sum = list.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0);
  const filterName = d.accounts.find(a => a.id === accountFilter)?.name || d.cards.find(x => x.id === accountFilter)?.name;
  const [importing, setImporting] = useState(false), [tools, setTools] = useState(false);
  return (
    <>
      {/* 0.3.152: historico direto sob os cartoes; busca, filtros e importacao ficam recolhidos */}
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
        <Text style={{flex: 1, fontSize: 18, fontWeight: '800', color: c.text}}>Histórico</Text>
        <IconButton name="filter" label={tools ? 'Esconder busca e filtros' : 'Buscar e filtrar'} onPress={() => setTools(v => !v)} />
        <IconButton name="plus" label="Importar extrato (OFX ou CSV)" onPress={() => setImporting(true)} />
      </View>
      {importing ? <ImportSheet api={api} d={d} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await reload(); }} /> : null}
      {tools || q || kind !== 'all' || status !== 'all' ? <View style={{gap: 10}}>
      <TextInput accessibilityLabel="Buscar lançamento" value={q} onChangeText={setQ} placeholder="Buscar por descrição ou categoria" placeholderTextColor={c.muted}
        style={{borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 12, color: c.text, backgroundColor: c.surface}} />
      <Chips scroll value={kind} onChange={setKind} options={[{value: 'all' as const, label: 'Todos'}, {value: 'expense' as const, label: 'Despesas'}, {value: 'income' as const, label: 'Receitas'}, {value: 'transfer' as const, label: 'Transferências'}, {value: 'card_payment' as const, label: 'Faturas'}]} />
      <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <Chips value={status} onChange={setStatus} options={[{value: 'all' as const, label: 'Tudo'}, {value: 'pending' as const, label: 'Só pendentes'}]} />
        {filterName ? <Pressable onPress={() => setAccountFilter('')} style={{paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: c.accentSoft}}><Text style={{color: c.accent, fontWeight: '600', fontSize: 12}}>{filterName} ✕</Text></Pressable> : null}
      </View>
      </View> : null}
      {list.length ? <Text style={{color: c.muted, fontSize: 12}}>{list.length} movimentações no mês · resultado {money(sum)}</Text> : null}
      {!days.length ? <Text style={{color: c.muted, textAlign: 'center', paddingVertical: 30}}>{q || kind !== 'all' || status !== 'all' ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento neste mês. Toque em ＋ para registrar.'}</Text> : days.map(([date, items]) => (
        <View key={date} style={{gap: 6}}>
          <Text style={{color: c.muted, fontSize: 12, fontWeight: '600'}}>{weekday(date)}</Text>
          <Card_ style={{padding: 8, gap: 0}}>{items.map((t, i) => <TxRow key={t.id} t={t} d={d} first={i === 0} onPress={() => onTx(t)} api={api} reload={reload} />)}</Card_>
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
    <Pressable onPress={onPress} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderTopWidth: first ? 0 : 1, borderColor: c.line, opacity: t.virtual ? 0.75 : 1}}>
      <Dot color={cat.color} icon={cat.icon} />
      <View style={{flex: 1}}>
        <Text numberOfLines={1} style={{color: c.text, fontWeight: '600'}}>{t.desc}</Text>
        <Text numberOfLines={1} style={{color: c.muted, fontSize: 11}}>{cat.name} · {source}{t.installments > 1 ? ' · ' + t.installment + '/' + t.installments : ''}{t.recurrence !== 'none' || t.virtual ? ' · 🔁' : ''}</Text>
      </View>
      <View style={{alignItems: 'flex-end', gap: 2}}>
        <Text style={{color, fontWeight: '700'}}>{t.kind === 'income' ? '+' : t.kind === 'transfer' ? '' : '−'}{money(t.amount)}</Text>
        {pending ? <Pressable onPress={() => void confirmTx(api, t).then(reload).catch(e => Alert.alert('Finanças', errorText(e)))}><Text style={{fontSize: 11, color: t.date < todayISO() ? BAD : WARN, fontWeight: '700'}}>{t.virtual ? 'previsto · confirmar' : t.kind === 'income' ? 'a receber · ✓' : 'a pagar · ✓'}</Text></Pressable> : null}
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
    const series = tx.seriesId;
    const others = series ? d.txs.filter(x => x.seriesId === series && x.id !== tx.id) : [];
    const del = async (all: boolean) => { try { await api.deleteEntity(tx.entity!.id); if (all) for (const o of others) if (o.entity && !o.paid) await api.deleteEntity(o.entity.id); onSaved(); } catch (e) { setError(errorText(e)); } };
    Alert.alert('Apagar lançamento?', others.length ? 'Este lançamento faz parte de uma série.' : 'Essa ação não pode ser desfeita.', others.length
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
            {editing ? <Pressable accessibilityLabel="Apagar lançamento" onPress={remove} style={{padding: 8}}><Icon name="trash" size={20} color={headText} /></Pressable> : null}
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
    catch (e) { Alert.alert('Finanças', errorText(e)); } finally { setBusy(false); }
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
      <ScrollView style={{maxHeight: 520}} contentContainerStyle={{gap: 12}}>
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
      <ScrollView style={{maxHeight: 560}} contentContainerStyle={{gap: 12}}>
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
function ReportsTab({d, month}: {d: Data; month: string}) {
  const c = useTheme(), [kind, setKind] = useState<'expense' | 'income'>('expense');
  const tips = useMemo(()=>financeInsights(d.txs,month),[d,month]);
  const cats = useMemo(() => byCategory(d.txs, month, kind), [d, month, kind]), total = cats.reduce((s, x) => s + x.total, 0);
  const {t6, s, prev, bal} = useMemo(() => ({t6: trend(d.txs, month, 6), s: monthSummary(d.txs, month), prev: monthSummary(d.txs, addMonths(month, -1)), bal: balanceSeries(d.accounts, d.txs, month)}), [d, month]);
  const max = Math.max(1, ...t6.flatMap(x => [x.income, x.expense]));
  const [w, setW] = useState(0);
  return (
    <>
      <Card_>
        <Title text="Análise da Sofia" />
        <Text style={{fontSize:12,color:c.muted,lineHeight:18}}>Sugestões baseadas somente nas entradas e saídas confirmadas da conta selecionada. Registros incompletos podem mudar a análise.</Text>
        {tips.map((tip,i)=><View key={i} style={{flexDirection:'row',gap:9,alignItems:'flex-start'}}>
          <View style={{width:7,height:7,borderRadius:4,marginTop:7,backgroundColor:tip.tone==='good'?GOOD:tip.tone==='attention'?WARN:c.muted}} />
          <Text style={{flex:1,color:c.text,fontSize:13,lineHeight:19}}>{tip.text}</Text>
        </View>)}
      </Card_>
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
    </>
  );
}

// ============================ CONTAS E CARTÕES ============================
function ManageSheet({api, d, onClose, reload}: {api: SofiaApi; d: Data; onClose: () => void; reload: () => Promise<void>}) {
  const c = useTheme(), [edit, setEdit] = useState<{type: 'account'; item: Account | null} | {type: 'card'; item: Card | null} | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <MotionModal visible animationType="slide" onRequestClose={onClose}>
      <View style={{flex: 1, backgroundColor: c.bg}}>
        <View style={{paddingTop: 40, paddingBottom: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line}}>
          <IconButton name="back" label="Voltar" onPress={onClose} /><Text style={{flex: 1, fontSize: 17, fontWeight: '700', color: c.text}}>Contas e cartões</Text>
        </View>
        <ScrollView contentContainerStyle={{padding: 18, gap: 14}}>
          <Card_>
            <Title text="Contas" action="+ Conta" onAction={() => setEdit({type: 'account', item: null})} />
            {d.accounts.map(a => <Pressable key={a.id} onPress={() => setEdit({type: 'account', item: a})} style={{flexDirection: 'row', alignItems: 'center', gap: 10, opacity: a.archived ? 0.5 : 1}}><View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: a.color}} /><Text style={{flex: 1, color: c.text}}>{a.name}{a.archived ? ' (arquivada)' : ''}</Text><Text style={{color: c.muted}}>{money(accountBalance(a, d.txs))}</Text></Pressable>)}
          </Card_>
          <Card_>
            <Title text="Cartões de crédito" action="+ Cartão" onAction={() => setEdit({type: 'card', item: null})} />
            {d.cards.filter(x=>!x.archived || showArchived).length ? d.cards.filter(x=>!x.archived || showArchived).map(x => <Pressable key={x.id} onPress={() => setEdit({type: 'card', item: x})} style={{flexDirection: 'row', alignItems: 'center', gap: 10, opacity: x.archived ? 0.5 : 1}}><View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: x.color}} /><Text style={{flex: 1, color: c.text}}>{x.name}</Text><Text style={{color: c.muted, fontSize: 12}}>{x.archived ? 'removido · ' : ''}fecha {x.closing} · vence {x.due}</Text></Pressable>) : <Text style={{color: c.muted}}>Nenhum cartão.</Text>}
            {d.cards.some(x=>x.archived)?<Pressable accessibilityRole="button" onPress={()=>setShowArchived(v=>!v)}><Text style={{color:c.accent,fontSize:12}}>{showArchived?'Ocultar cartões removidos':'Mostrar cartões removidos'}</Text></Pressable>:null}
          </Card_>
        </ScrollView>
      </View>
      {edit ? <AccountCardSheet api={api} d={d} edit={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void reload(); }} /> : null}
    </MotionModal>
  );
}
function AccountCardSheet({api, d, edit, onClose, onSaved}: {api: SofiaApi; d: Data; edit: {type: 'account'; item: Account | null} | {type: 'card'; item: Card | null}; onClose: () => void; onSaved: () => void}) {
  const c = useTheme(), isCard = edit.type === 'card', acc = edit.type === 'account' ? edit.item : null, card = edit.type === 'card' ? edit.item : null;
  const [name, setName] = useState(edit.item?.name || ''), [type, setType] = useState(acc?.type || 'corrente'), [initial, setInitial] = useState(acc ? finishMoneyInput(String(acc.entity.data.initial_balance || '0').replace('.', ',')) : '');
  const [include, setInclude] = useState(acc?.include ?? true), [color, setColor] = useState(edit.item?.color || FIN_COLORS[isCard ? 2 : d.accounts.length % FIN_COLORS.length]);
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
        await saveEntity(api, 'fin_account', name.trim(), {account_type: type, initial_balance: String(v), color, include_total: include}, acc?.entity);
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
      Alert.alert(mustArchive?'Remover cartão e preservar histórico?':'Excluir cartão?',
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
      <ScrollView style={{maxHeight: 600}} contentContainerStyle={{gap: 12}} keyboardShouldPersistTaps="handled">
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
                <View style={{maxHeight: 320}}><ScrollView nestedScrollEnabled>
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
