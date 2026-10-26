import type {Entity} from './types';
import {libraryFacets, normalizeLibraryTag as norm} from './library-filters';
/** 0.3.242: etiquetas (categorias) da Biblioteca. Guardadas no MESMO lugar e formato de antes ("Terror, Suspense"),
 * entao tudo que ja estava cadastrado vira etiqueta sem conversao. "Terror", "terror " e "térror" sao a mesma etiqueta. */
export type TagOption = {label: string; count: number};
/** "Terror, suspense; Terror" -> ["Terror", "suspense"] (a primeira grafia vence). */
export function splitTags(value: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of String(value || '').split(/[,;/|]/)) { const t = raw.trim().replace(/\s+/g, ' '); if (t && !seen.has(norm(t))) seen.set(norm(t), t); }
  return [...seen.values()];
}
export const joinTags = (tags: string[]) => splitTags(tags.join(',')).join(', ');
/** Etiquetas do tipo, com quantos itens usam cada uma, em ordem alfabetica. */
export function tagOptions(records: Partial<Entity>[]): TagOption[] {
  const map = new Map<string, TagOption>();
  for (const r of records) for (const label of libraryFacets(r)) { const k = norm(label), o = map.get(k); if (o) o.count++; else map.set(k, {label, count: 1}); }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
/** O que mostrar enquanto a pessoa digita: a que ja existe (igual) e as parecidas. So oferece criar se nao houver igual. */
export function suggestTags(typed: string, options: TagOption[], limit = 6): {exact: string | null; matches: string[]; canCreate: boolean} {
  const q = norm(typed);
  if (!q) return {exact: null, matches: [], canCreate: false};
  const exact = options.find(o => norm(o.label) === q)?.label || null;
  const matches = options.filter(o => norm(o.label) !== q && norm(o.label).includes(q)).slice(0, limit).map(o => o.label);
  return {exact, matches, canCreate: !exact};
}
/** Adiciona usando a grafia que ja existe ("terror" vira "Terror"); nunca duplica. */
export function addTag(current: string[], typed: string, options: TagOption[]): string[] {
  const t = String(typed || '').trim().replace(/\s+/g, ' ');
  if (!t) return current;
  const label = options.find(o => norm(o.label) === norm(t))?.label || t;
  return current.some(c => norm(c) === norm(label)) ? current : [...current, label];
}
export const toggleTag = (current: string[], label: string) => current.some(c => norm(c) === norm(label)) ? current.filter(c => norm(c) !== norm(label)) : [...current, label];
/** Renomear; se o novo nome ja existe, as duas viram uma so (juntar). */
export function renameTagInValue(value: string, from: string, to: string): string {
  const name = String(to || '').trim().replace(/\s+/g, ' ');
  if (!name) return removeTagFromValue(value, from);
  return joinTags(splitTags(value).map(t => norm(t) === norm(from) ? name : t));
}
export const removeTagFromValue = (value: string, tag: string) => joinTags(splitTags(value).filter(t => norm(t) !== norm(tag)));
export const hasTag = (value: string, tag: string) => splitTags(value).some(t => norm(t) === norm(tag));
