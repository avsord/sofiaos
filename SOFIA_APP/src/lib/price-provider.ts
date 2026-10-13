/** Recognition is broader than collection support: unsupported ML URLs must NOT
 * fall back to WebView. This does not grant any backend network permission. */
export function isMercadoLivreUrl(input: string): boolean {
  const raw = String(input || '').trim();
  if (/^(?:meli|mercadolivre|mercadolibre):/i.test(raw)) return true;
  if (/^intent:/i.test(raw) && /(?:com\.mercadolibre|mercadoli(?:vre|bre)\.com)/i.test(raw)) return true;
  const text = raw.match(/https?:\/\/[^\s<>"']+/i)?.[0] || raw;
  try { return /(^|\.)mercadoli(vre|bre)\.com(\.br)?$/i.test(new URL(/^https?:/i.test(text) ? text : 'https://' + text).hostname); }
  catch { return false; }
}
