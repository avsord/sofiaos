/** 0.3.201: busca que acha mesmo com letra errada, faltando ou sobrando ("duda" acha "Tomar duda",
 * "dentsta" acha "Dentista", "remedio" acha "Remédio"). */
export function fold(s: string): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Distancia de edicao (Damerau: troca de duas letras vizinhas conta 1), com corte para nao gastar a toa. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
const allowed = (len: number) => len <= 3 ? 0 : len <= 5 ? 1 : 2;
/** Pontuacao 0..1 de quanto o texto combina com a busca (0 = nao combina). Cada palavra da busca precisa
 * achar uma palavra do texto: igual, comeco de palavra, ou com poucas letras erradas. */
export function fuzzyScore(text: string, query: string): number {
  const q = fold(query); if (!q) return 1;
  const t = fold(text); if (!t) return 0;
  if (t.includes(q)) return 1;
  const words = t.split(' '), parts = q.split(' ');
  let total = 0;
  for (const p of parts) {
    let best = 0;
    for (const w of words) {
      if (w === p || w.startsWith(p)) { best = 1; break; }
      if (w.includes(p) && p.length >= 3) { best = Math.max(best, 0.9); continue; }
      const lim = allowed(p.length);
      if (!lim) continue;
      const cut = w.slice(0, p.length + 1), dist = Math.min(editDistance(p, w, lim), editDistance(p, cut, lim), editDistance(p, w.slice(0, p.length), lim));
      if (dist <= lim) best = Math.max(best, 0.8 - dist * 0.15);
    }
    if (!best) return 0;
    total += best;
  }
  return total / parts.length;
}
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!fold(query)) return items;
  return items.map(item => ({item, score: fuzzyScore(text(item), query)})).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.item);
}
