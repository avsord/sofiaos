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
import {Data, uid, saveEntity, Chips, Card_, Title} from './core';
import {DueRow, CLOSED_MSG, isClosedMonth, startSeriesNextMonth, syncIncomeReserve, Segmented, FixedDupCard} from './Home';
// ============================ PRIMEIRO USO ============================
/** 0.3.161: passo a passo da primeira configuracao. Tudo opcional menos a conta; "Pular" em
 * qualquer passo vai direto para o app. Reaberto depois em Contas e cartoes, ja preenchido. */
export function Onboarding({api, onDone, existing, onClose, onFinished}: {api: SofiaApi; onDone: () => Promise<void>; existing?: {account: Account | null; reserve: Goal | null; fixed?: Tx[]; salary?: Tx | null} | null; onClose?: () => void; onFinished?: () => void}) {
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
        const data: Record<string, unknown> = {role: 'reserve', saved: money0(saved), monthly_plan: money0(plan), color: c.good, account_id: account.id,
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
        <View style={{flex: 1}}><Text style={{color: billEditing === i ? c.accent : c.text, fontWeight: '500'}}>{b.title}</Text><Text style={{color: c.muted, fontSize: 11}}>dia {b.day || 1}{Number(b.parcels) > 1 ? ' · parcela ' + (Math.max(1, Number(b.at) || 1)) + ' de ' + Math.round(Number(b.parcels)) : ''}{billEditing === i ? ' · editando' : ''}</Text></View>
        <Text style={{color: c.text, fontWeight: '600'}}>{money(money0(b.amount))}</Text>
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
      <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Conta</Text><Text style={{color: c.text, fontWeight: '600'}}>{name || 'Conta principal'} · {money(money0(balance))}</Text></View>
      {cycleDay ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Recebe</Text><Text style={{color: c.text, fontWeight: '600'}}>{money0(salary) > 0 ? money(money0(salary)) + ' · ' : ''}todo dia {cycleDay}</Text></View> : null}
      {bills.length ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Contas fixas</Text><Text style={{color: c.text, fontWeight: '600'}}>{bills.length} · {money(fixedTotal)}</Text></View> : null}
      {money0(saved) > 0 ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Guardado</Text><Text style={{color: c.text, fontWeight: '600'}}>{money(money0(saved))}</Text></View> : null}
      {money0(plan) > 0 ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Aporte</Text><Text style={{color: c.text, fontWeight: '600'}}>{money(money0(plan))} por mês</Text></View> : null}
      {money0(goalValue) > 0 ? <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.muted, fontSize: 12}}>Meta</Text><Text style={{color: c.text, fontWeight: '600'}}>{money(money0(goalValue))}{goalMonth ? ' até ' + goalMonth.split('-').reverse().join('/') : ''}</Text></View> : null}
      <View style={{height: 1, backgroundColor: c.line}} />
      <View style={{flexDirection: 'row'}}><Text style={{flex: 1, color: c.text, fontWeight: '600', fontSize: 12}}>Saldo deste ciclo</Text><Text style={{color: c.good, fontWeight: '700'}}>{money(ceiling)}</Text></View>
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
        <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>{current.title}</Text>
        <Text style={{fontSize: 13, color: c.muted, lineHeight: 20}}>{current.hint}</Text>
      </View>
      {current.body}
      {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
      {last && existing ? <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{tap('Nada foi alterado ainda. Só ao tocar em “Substituir configuração” estes dados passam a valer; se sair agora, tudo continua como estava.')}</Text> : null}
      <Button title={last ? (existing ? 'Substituir configuração' : 'Começar a usar') : 'Continuar'} loading={busy} disabled={step === 0 && !name.trim()}
        onPress={() => last ? confirmFinish() : setStep(s => s + 1)} />
      <View style={{flexDirection: 'row', justifyContent: 'center', gap: 18}}>
        {step > 0 ? <Pressable accessibilityRole="button" onPress={() => setStep(s => s - 1)}><Text style={{color: c.accent, fontSize: 13, fontWeight: '600'}}>Voltar</Text></Pressable> : null}
        {!last ? <Pressable accessibilityRole="button" onPress={() => setStep(steps.length - 1)}><Text style={{color: c.muted, fontSize: 13}}>{step === 0 ? 'Pular: só a conta. O resto a Sofia cadastra pelos seus prints' : 'Pular o resto'}</Text></Pressable> : null}
        {existing && onClose ? <Pressable accessibilityRole="button" onPress={onClose}><Text style={{color: c.muted, fontSize: 13}}>Cancelar</Text></Pressable> : null}
      </View>
    </ScrollView>
  );
}
export function Field({label, value, onChange, placeholder, numeric = false, big = false}: {label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; big?: boolean}) {
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
export function ReserveHistorySheet({api, reserve, moves, show, onClose, reload, startEdit = null}: {startEdit?: ReserveMove | null; api: SofiaApi; reserve: Goal; moves: ReserveMove[]; show: (v: number) => string; onClose: () => void; reload: () => Promise<void>}) {
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
      <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>{reserveMoveLabel(edit)}</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>Ao salvar, o dinheiro guardado e o aporte do mês são recalculados com o novo valor.</Text>
      {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
      {input('Valor', amount, setAmount, true)}
      <DateTimeField label="Data" value={date} onChange={v => setDate(v || date)} dateOnly allowClear={false} />
      {input('Observação (opcional)', note, setNote)}
      {edit.direction === 'out' ? <View style={{gap: 8}}>
        <Text style={{color: c.muted, fontSize: 12}}>Essa retirada</Text>
        {([[false, 'Recompor este mês'], [true, 'Retirada planejada']] as const).map(([v, label]) =>
          <Pressable key={label} accessibilityRole="button" accessibilityState={{selected: planned === v}} onPress={() => setPlanned(v)}
            style={{padding: 12, borderRadius: 14, borderWidth: 1, borderColor: planned === v ? c.accent : c.line, backgroundColor: planned === v ? c.accentSoft : 'transparent'}}>
            <Text style={{color: planned === v ? c.accent : c.text, fontWeight: '600', fontSize: 14}}>{label}</Text>
          </Pressable>)}
      </View> : null}
      <Button title="Salvar" loading={busy} onPress={() => void save()} />
      <Pressable accessibilityRole="button" onPress={remove} disabled={busy}><Text style={{color: c.danger, fontWeight: '600', textAlign: 'center'}}>Apagar movimento</Text></Pressable>
    </ScrollView>
  </Sheet>;
  return <Sheet visible onClose={onClose} label="Fechar histórico da reserva">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 16, paddingBottom: 18}}>
      <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>Histórico da reserva</Text>
      <Text style={{color: c.muted, fontSize: 12, lineHeight: 18}}>{tap('Toque em um movimento para corrigir o valor, a data ou apagá-lo.')}</Text>
      {months.length ? months.map(m => <View key={m.month} style={{gap: 8}}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8}}>
          <Text style={{flex: 1, color: c.text, fontWeight: '700', fontSize: 16}}>{monthLabel(m.month)}</Text>
          <Text style={{color: m.net >= 0 ? c.good : c.danger, fontWeight: '700', fontSize: 14}}>{m.net >= 0 ? '+' : '−'}{show(Math.abs(m.net))}</Text>
        </View>
        <Text style={{color: c.muted, fontSize: 12}}>Entrou {show(m.in)} · Saiu {show(m.out)}</Text>
        <View style={{backgroundColor: c.input, borderRadius: 16, paddingHorizontal: 14}}>
          {m.items.map((it, i) => <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={'Editar ' + reserveMoveLabel(it) + ' de ' + show(it.amount)} onPress={() => open(it)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line}}>
            <View style={{flex: 1, gap: 2}}>
              <Text style={{color: c.text, fontSize: 14, fontWeight: '500'}}>{reserveMoveLabel(it)}</Text>
              <Text style={{color: c.muted, fontSize: 11}}>{it.date.slice(8, 10) + '/' + it.date.slice(5, 7)}{it.note ? ' · ' + it.note : ''}</Text>
            </View>
            <Text style={{color: it.direction === 'in' ? c.good : c.danger, fontWeight: '700', fontSize: 16}}>{it.direction === 'in' ? '+' : '−'}{show(it.amount)}</Text>
            <Text style={{color: c.muted, fontSize: 13}}>›</Text>
          </Pressable>)}
        </View>
      </View>) : <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Ainda não há movimentos. Cada aporte e cada retirada aparece aqui, por mês, com o que entrou e o que saiu.</Text>}
      {Number(reserve.saved) > 0 ? <Text style={{color: c.muted, fontSize: 12}}>Valor inicial informado: {show(Number(reserve.saved))}</Text> : null}
    </ScrollView>
  </Sheet>;
}

export function ReserveSheet({api, kind, reserve, split, onClose, onDone, accountId = ''}: {accountId?: string; api: SofiaApi; kind: 'setup' | 'in' | 'out' | 'plan' | 'goal' | 'adjust'; reserve: Goal | null; split: ReturnType<typeof moneySplit> | null; onClose: () => void; onDone: () => Promise<void>}) {
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
        await api.saveEntity({kind: 'fin_goal', title: name.trim() || 'Dinheiro guardado', content: '', area: 'Pessoal', privacy: 'private', state: 'active', tags: [], data: {role: 'reserve', saved, ...planFields, ...goalFields, monthly_plan: monthly, color: c.good, account_id: accountId || ''}});
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
      <Text style={{fontSize: 20, fontWeight: '700', color: c.text}}>{title}</Text>
      {error ? <Text style={{color: c.danger}}>{error}</Text> : null}
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
        {reserve?.target ? <Pressable accessibilityRole="button" onPress={() => { setGoalValue(''); setGoalMonth(''); }}><Text style={{color: c.danger, fontSize: 13, fontWeight: '600'}}>Tirar a meta</Text></Pressable> : null}
      </> : kind === 'plan' ? <>
        <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>É quanto você pretende guardar por mês, e quando. O saldo só muda quando você registra o aporte em “Guardar dinheiro”. O que faltar não passa para o mês seguinte.</Text>
        {input('Aportes de (por mês)', plan, setPlan, 'Ex.: 4.000')}
        {planEditor}
        {goalEditor}
        {reserve ? <Pressable accessibilityRole="button" onPress={() => { setPlan(''); setRepeatDays('0'); }}><Text style={{color: c.danger, fontSize: 13, fontWeight: '600'}}>Parar os aportes</Text></Pressable> : null}
      </> : <>
        {kind === 'in' && split ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Sai do saldo geral ({money(split.daily)}) e passa a ser guardado. Não é despesa nem receita.{split.realized > 0 ? ' Você já guardou ' + money(split.realized) + ' neste mês.' : ''}</Text> : null}
        {kind === 'in' && split && (parseMoney(amount) ?? 0) > split.daily ? <Text style={{color: c.danger, fontSize: 12}}>Esse valor é maior que o saldo geral e o deixaria negativo.</Text> : null}
        {kind === 'out' && split ? <Text style={{color: c.muted, fontSize: 13, lineHeight: 19}}>Hoje guardado: {money(split.saved)}. A retirada devolve o valor ao saldo geral.</Text> : null}
        {input('Valor', amount, setAmount, 'Ex.: 500')}
        {kind === 'out' ? <View style={{gap: 8}}>
          <Text style={{color: c.muted, fontSize: 12}}>Essa retirada</Text>
          {([[false, 'Recompor este mês', 'Soma ao que falta guardar neste mês.'], [true, 'Retirada planejada', 'Sai do guardado e não precisa ser recomposta.']] as const).map(([v, label, hint]) =>
            <Pressable key={label} accessibilityRole="button" accessibilityState={{selected: plannedOut === v}} onPress={() => setPlannedOut(v)}
              style={{padding: 12, borderRadius: 14, borderWidth: 1, borderColor: plannedOut === v ? c.accent : c.line, backgroundColor: plannedOut === v ? c.accentSoft : 'transparent', gap: 2}}>
              <Text style={{color: plannedOut === v ? c.accent : c.text, fontWeight: '600', fontSize: 14}}>{label}</Text>
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
export function PendingTab({d,api,month,accountId,warning,onBill,reload,isPrimary=true,onAporte,onNew,onMonth,side:sideProp,onSide}: {side?:'pagar'|'receber';onSide?:(v:'pagar'|'receber')=>void;onMonth?:(m:string)=>void;onNew:(flow:'expense'|'income')=>void;d:Data;api:SofiaApi;month:string;accountId:string;warning:string;onBill:(t:Tx|'new',scope?:'month'|'series')=>void;reload:()=>Promise<void>;isPrimary?:boolean;onAporte?:()=>void}) {
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
    return <Pressable accessibilityRole="button" onPress={()=>onMonth(nextMonth)} style={{paddingVertical:6}}><Text style={{color:c.accent,fontSize:12,fontWeight:'600'}}>Em {monthLabel(nextMonth).split(' ')[0].toLowerCase()}: {rows.length} {kind==='receber'?'a receber':'a pagar'} · {money(rows.reduce((s,r)=>s+r.amount,0))} ›</Text></Pressable>;};
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
          <Text style={{fontSize:18,fontWeight:'700',color:c.text}}>{side==='pagar'?'Contas a pagar':'Contas a receber'}</Text>
          <Text style={{fontSize:12,color:c.muted}}>{sideOpen.length} em aberto em {monthLabel(month).split(' ')[0].toLowerCase()} · {money(sideOpen.reduce((s,r)=>s+r.amount,0))}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={side==='pagar'?'Nova conta a pagar':'Nova conta a receber'} onPress={()=>onNew(side==='pagar'?'expense':'income')} style={{backgroundColor:c.accent,paddingHorizontal:13,paddingVertical:11,borderRadius:12}}>
          <Text style={{color:c.onAccent,fontSize:13,fontWeight:'700'}}>＋ Nova</Text>
        </Pressable>
      </View>
      {warning ? <Text style={{fontSize:12,color:c.warn}}>{warning}</Text> : null}
    </Card_>
    {fx.bills.length||upcomingFx.length ? <Card_>
      <Title text={side==='pagar'?'Contas fixas':'Receitas fixas'} />
      <Text style={{fontSize:12,color:c.muted,lineHeight:18}}>{side==='pagar'?'As contas marcadas como “Todo mês”':'As receitas marcadas como “Todo mês” (ex.: salário)'}, em {range.label}.</Text>
      {/* 0.3.192: tocar numa conta fixa abre a edicao dela (nome, valor, dia, parcelas, avisos) - vale para todos os meses */}
      {fx.bills.map(b=>{const original=d.txs.find(t=>!t.virtual&&t.id===(b.tx.seriesId||b.tx.id))||(!b.tx.virtual?b.tx:null);
        return <Pressable key={b.id+b.date} accessibilityRole="button" accessibilityLabel={'Editar '+b.title} disabled={!original} onPress={()=>original&&onBill(original,'series')} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9,borderTopWidth:1,borderColor:c.line,opacity:pressed?0.6:1})}>
        <View style={{flex:1,gap:2}}>
          <Text style={{color:c.text,fontSize:14,fontWeight:'500'}}>{b.title}</Text>
          <Text style={{color:c.muted,fontSize:11}}>dia {b.day}{b.cardId?' · 💳 '+(d.cards.find(x=>x.id===b.cardId)?.name||'cartão')+(b.paid?' · paga com a fatura':' · na fatura'):' · '+(side==='pagar'?(b.paid?'paga':'a pagar'):(b.paid?'recebida':'a receber'))}{b.installments?' · parcela '+b.index+' de '+b.installments+(b.left?' · faltam '+b.left:' · última'):''}</Text>
        </View>
        <Text style={{color:b.paid?c.muted:c.text,fontWeight:'600',fontSize:14,textDecorationLine:b.paid?'line-through':'none'}}>{money(b.amount)}</Text>
        {original?<Text style={{color:c.muted,fontSize:16}}>›</Text>:null}
      </Pressable>;})}
      {/* 0.3.230: a fixa que comeca depois aparece igual as outras (sem botao); so diz de quando e */}
      {upcomingFx.map(t=>{const n=Math.round(Number(t.entity?.data?.installments)||0),from=monthLabel(monthOf(t.date)).split(' ')[0].toLowerCase(),to=n>1?monthLabel(addMonths(monthOf(t.date),n-Math.max(1,Math.round(Number(t.entity?.data?.installment)||1)))).split(' ')[0].toLowerCase():'';
        return <Pressable key={'u'+t.id} accessibilityRole="button" accessibilityLabel={'Editar '+t.desc} onPress={()=>onBill(t,'series')} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12,borderTopWidth:1,borderColor:c.line,opacity:pressed?0.7:1})}>
        <View style={{flex:1,gap:2}}>
          <Text style={{color:c.text,fontSize:14,fontWeight:'500'}}>{t.desc}</Text>
          <Text style={{color:c.muted,fontSize:11}}>dia {Number(t.date.slice(8,10))} · {side==='pagar'?'a pagar':'a receber'} · {to?'de '+from+' a '+to:'a partir de '+from}</Text>
        </View>
        <Text style={{color:c.text,fontWeight:'600',fontSize:14}}>{money(t.amount)}</Text>
        <Text style={{color:c.muted,fontSize:16}}>›</Text>
      </Pressable>;})}
      <Text style={{color:c.muted,fontSize:11}}>{tap('Toque numa conta para mudar nome, valor, dia, parcelas ou avisos. Vale para todos os meses.')}</Text>
      <View style={{borderTopWidth:1,borderColor:c.line,paddingTop:12,gap:6}}>
        <View style={{flexDirection:'row'}}><Text style={{flex:1,color:c.text,fontWeight:'600'}}>Total do mês</Text><Text style={{color:c.text,fontWeight:'700'}}>{money(fx.total)}</Text></View>
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
export function BillEditor({api,tx,accountId,onClose,onSaved,onOptimistic,scope='series',initialFlow='expense',hasReserve=false,finance,initialCard=''}:{onOptimistic?:(t:Tx,replaceId:string|null)=>void;initialCard?:string;finance?:Data;hasReserve?:boolean;api:SofiaApi;tx:Tx|null;accountId:string;onClose:()=>void;onSaved:(saved?:{id:string;kind:string;date:string;title:string})=>void;scope?:'month'|'series';initialFlow?:'expense'|'income'}) {
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
      <Text style={{fontSize:20,fontWeight:'700',color:c.text}}>{monthOnly?'Editar só '+monthLabel(monthOf(tx!.date)).split(' ')[0].toLowerCase():existing?'Editar vencimento':'Novo vencimento'}</Text>
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
      {error?<Text style={{color:c.danger,fontSize:13}}>{error}</Text>:null}
      <Button title={flow==='income'?'Salvar recebimento':'Salvar vencimento'} loading={busy} onPress={()=>void save()} />
      {existing?<Pressable accessibilityRole="button" accessibilityLabel="Excluir vencimento" onPress={erase} style={{alignItems:'center',paddingVertical:12}}>
        <Text style={{color:c.danger,fontWeight:'600'}}>Excluir vencimento</Text></Pressable>:null}
    </ScrollView>
  </Sheet>;
}
