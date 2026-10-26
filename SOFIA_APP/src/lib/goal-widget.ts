import {useState} from 'react';
import type {GoalNumbers} from '../components/GoalProgress';
import {GOAL_WIDGET_PATH} from './startup-snapshot';
/** 0.3.240: guarda o ultimo estado da Meta da Inicio para o PRIMEIRO quadro ja vir pronto, sem atrasar a abertura.
 * Mesmo padrao do widget do Price Tracker: leitura sincrona no estado inicial, gravacao so quando algo mudou. */
type Store = {cached<T>(path: string): T | undefined | null; rememberLocal(path: string, value: unknown): void};
export type GoalWidgetCache = {v: 1; goal: Omit<GoalNumbers, 'today'> | null; hidden: boolean};
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export function validStoredGoal(x: any): Omit<GoalNumbers, 'today'> | null {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.name !== 'string' || x.name.length > 120 || !num(x.saved) || !num(x.target) || x.target <= 0 || !num(x.monthly) || typeof x.deadline !== 'string' || x.deadline.length > 40) return null;
  return {name: x.name, saved: x.saved, target: x.target, monthly: x.monthly, deadline: x.deadline};
}
/** known=false: nunca gravado (ou formato antigo/corrompido). known=true com goal=null: o dono NAO tem meta (nao pisca nada). */
export function readGoalWidget(api: Store, today = ''): {known: boolean; goal: GoalNumbers | null; hidden: boolean} {
  const raw: any = api.cached(GOAL_WIDGET_PATH);
  if (!raw || raw.v !== 1) return {known: false, goal: null, hidden: false};
  const g = raw.goal === null ? null : validStoredGoal(raw.goal);
  if (raw.goal !== null && !g) return {known: false, goal: null, hidden: false};
  return {known: true, goal: g ? {...g, today} : null, hidden: raw.hidden === true};
}
/** Mesmos numeros? ('today' muda todo dia e nao conta.) Usado para NAO redesenhar quando a leitura nova e igual. */
export function sameGoal(a: GoalNumbers | null, b: GoalNumbers | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && a.saved === b.saved && a.target === b.target && a.monthly === b.monthly && a.deadline === b.deadline;
}
/** Para setG(prev => keepIfSame(prev, next)): se for igual, devolve o MESMO objeto e o React nem redesenha. */
export function keepIfSame(prev: GoalNumbers | null, next: GoalNumbers | null): GoalNumbers | null { return sameGoal(prev, next) ? prev : next; }
export function writeGoalWidget(api: Store, patch: {goal?: GoalNumbers | null; hidden?: boolean}) {
  const cur: any = api.cached(GOAL_WIDGET_PATH), ok = !!cur && cur.v === 1;
  const baseGoal = ok ? (cur.goal === null ? null : validStoredGoal(cur.goal)) : null;
  const base: GoalWidgetCache = {v: 1, goal: baseGoal, hidden: ok && cur.hidden === true};
  const next: GoalWidgetCache = {v: 1, goal: base.goal, hidden: base.hidden};
  if ('goal' in patch) { const g = patch.goal ? validStoredGoal(patch.goal) : null; if (patch.goal && !g) return; next.goal = g; }
  if ('hidden' in patch) next.hidden = patch.hidden === true;
  if (ok && JSON.stringify(next) === JSON.stringify({v: 1, goal: baseGoal, hidden: cur.hidden === true})) return;
  api.rememberLocal(GOAL_WIDGET_PATH, next);
}
/** Estado inicial da Meta: o ultimo conhecido, ja no primeiro quadro. */
export function useCachedGoal(api: Store, today: string) { return useState<GoalNumbers | null>(() => readGoalWidget(api, today).goal); }
