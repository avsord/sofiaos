/** 0.3.201: avisos do compromisso como no Google Agenda (varios, em minutos antes). */
export const REMINDER_PRESETS = [5, 10, 120, 1440, 2880, 5760];
export const REMINDER_UNITS = [{value: 1, label: 'minutos'}, {value: 60, label: 'horas'}, {value: 1440, label: 'dias'}, {value: 10080, label: 'semanas'}] as const;
const MAX = 40320; // 4 semanas, o limite do Google

/** Lista de avisos do registro: reminders_json manda; se nao houver, usa o remind_minutes antigo. */
export function reminderOffsets(data: Record<string, unknown> | undefined | null): number[] {
  const d = data || {};
  let list: unknown = [];
  try { list = JSON.parse(String(d.reminders_json || '[]')); } catch { list = []; }
  const clean = (Array.isArray(list) ? list : []).map(Number).filter(n => Number.isFinite(n) && n >= 0).map(n => Math.min(MAX, Math.round(n)));
  if (clean.length) return [...new Set(clean)].sort((a, b) => a - b).slice(0, 5);
  const legacy = d.remind_minutes;
  if (legacy === '' || legacy === null || legacy === undefined) return [];
  const n = Number(legacy);
  return Number.isFinite(n) && n >= 0 ? [Math.min(MAX, Math.round(n))] : [];
}
/** Grava os dois campos: a lista e o legado (o menor), para tudo que ainda le remind_minutes. */
export function reminderFields(list: number[]): {reminders_json: string; remind_minutes: number | ''} {
  const clean = [...new Set(list.map(n => Math.min(MAX, Math.max(0, Math.round(n)))))].sort((a, b) => a - b).slice(0, 5);
  return {reminders_json: JSON.stringify(clean), remind_minutes: clean.length ? clean[0] : ''};
}
export function reminderLabel(min: number): string {
  if (min === 0) return 'No horário';
  const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many) + ' antes';
  if (min % 10080 === 0) return plural(min / 10080, 'semana', 'semanas');
  if (min % 1440 === 0) return plural(min / 1440, 'dia', 'dias');
  if (min % 60 === 0) return plural(min / 60, 'hora', 'horas');
  return plural(min, 'minuto', 'minutos');
}
