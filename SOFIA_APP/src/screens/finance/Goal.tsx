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
import {Bundle, toData, financeWindow, loadAll, readCache, Card_} from './core';
import {Chevron} from './Home';
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
export const FOLD_KEY = 'sofia_fin_folds_v1';
export let foldMemory: Record<string, boolean> | null = null;
// 0.3.227: as secoes dos Relatorios so desenham depois de saber se estavam abertas ou fechadas (antes abriam e,
// um instante depois, fechavam - a Meta piscava ao aparecer). A escolha ja e lida ao abrir Financas.
export let foldLoading: Promise<void> | null = null;
export function preloadFolds(): Promise<void> { if (foldMemory) return Promise.resolve(); if (!foldLoading) foldLoading = SecureStore.getItemAsync(FOLD_KEY).then(v => { try { foldMemory = JSON.parse(v || '{}') || {}; } catch { foldMemory = {}; } }).catch(() => { foldMemory = {}; }); return foldLoading; }
export function Fold({id, title, children}: {id: string; title: string; children: React.ReactNode}) {
  const c = useTheme(), [open, setOpen] = useState<boolean | null>(foldMemory ? (foldMemory[id] ?? true) : null);
  useEffect(() => { if (open !== null) return; let alive = true; void preloadFolds().then(() => { if (alive) setOpen(foldMemory?.[id] ?? true); }); return () => { alive = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => { const next = !(open ?? true); setOpen(next); foldMemory = {...(foldMemory || {}), [id]: next}; void SecureStore.setItemAsync(FOLD_KEY, JSON.stringify(foldMemory)).catch(() => {}); };
  return <Card_>
    <Pressable accessibilityRole="button" accessibilityState={{expanded: !!open}} accessibilityLabel={(open ? 'Fechar ' : 'Abrir ') + title} onPress={toggle} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <Text style={{flex: 1, color: c.text, fontWeight: '700', fontSize: 16}}>{title}</Text>
      <Chevron open={!!open} />
    </Pressable>
    {open ? children : null}
  </Card_>;
}