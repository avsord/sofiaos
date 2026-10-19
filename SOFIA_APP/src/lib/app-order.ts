/** 0.3.201: ordem dos apps escolhida pela pessoa (guardada no celular). Apps novos entram no fim. */
export const APP_ORDER_KEY = 'sofia.apps.order.v1';
export function orderApps<T extends {id: string}>(items: T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...items].map((item, i) => ({item, i})).sort((a, b) => (pos.has(a.item.id) ? pos.get(a.item.id)! : 1e6 + a.i) - (pos.has(b.item.id) ? pos.get(b.item.id)! : 1e6 + b.i)).map(x => x.item);
}
export function moveApp(ids: string[], id: string, delta: number): string[] {
  const next = [...ids], i = next.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return ids;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
