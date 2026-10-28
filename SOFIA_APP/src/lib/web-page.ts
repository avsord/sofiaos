/** 0.3.260 (rodada premium, fase 2): o site se comporta como site.
 * - Teclado rola a tela: Page Down/Up, espaco, Home e End rolam a area principal (antes so a rodinha, e so em cima dela).
 * - Imprimir: a pagina sai inteira (sem menu nem barras), em vez de cortada dentro das caixas que rolam.
 * - Clique com o botao direito faz o mesmo que "segurar" no celular: ver rightClick() abaixo, ligado em cada lugar. */
let installed = false;
const typing = (el: Element | null) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);
function mainScroller(): HTMLElement | null {
  const cx = window.innerWidth * 0.6, cy = window.innerHeight * 0.5;
  let el = document.elementFromPoint(cx, cy) as HTMLElement | null;
  while (el && el !== document.body) {
    const st = getComputedStyle(el);
    if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}
export function installWebPage() {
  if (installed || typeof document === 'undefined' || typeof window === 'undefined') return; installed = true;
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const keys: Record<string, number> = {PageDown: 0.85, PageUp: -0.85, ' ': e.shiftKey ? -0.85 : 0.85};
    const sc = (k: string) => mainScroller();
    if (e.key in keys) { const s = sc(e.key); if (!s) return; e.preventDefault(); s.scrollBy({top: s.clientHeight * keys[e.key], behavior: 'smooth'}); }
    else if (e.key === 'Home' || e.key === 'End') { const s = sc(e.key); if (!s) return; e.preventDefault(); s.scrollTo({top: e.key === 'Home' ? 0 : s.scrollHeight, behavior: 'smooth'}); }
  });
  const st = document.createElement('style'); st.id = 'sofia-print';
  st.textContent = '@media print{html,body,#root{height:auto!important;overflow:visible!important}*{overflow:visible!important;max-height:none!important}[data-print-hide],[aria-label="Menu"],[aria-label="Barra lateral"],nav{display:none!important}}';
  document.head.appendChild(st);
}

/** Clique direito no site = "segurar" no celular. Uso: <Pressable onLongPress={fn} {...rightClick(fn)}>. No app nao faz nada. */
export function rightClick(fn: () => void): Record<string, unknown> {
  if (typeof document === 'undefined') return {};
  return {onContextMenu: (e: {preventDefault?: () => void}) => { e?.preventDefault?.(); fn(); }};
}
