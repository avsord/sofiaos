import type {Tab} from './types';

/** Only the six main menus participate in horizontal paging. */
export const TAB_ORDER: readonly Tab[] = ['home','chat','pages','agenda','apps','profile'];
export function tabIndex(tab: Tab): number { return TAB_ORDER.indexOf(tab); }
export function tabAtOffset(offset: number, width: number): Tab | null {
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) return null;
  const index = Math.max(0, Math.min(TAB_ORDER.length - 1, Math.round(offset / width)));
  return TAB_ORDER[index];
}
/** A native scroll event from before a menu tap must never undo that tap. */
export function createPagerSelection(initial: Tab = 'chat') {
  let selected: Tab = initial;
  let dragging = false;
  return {
    current: () => selected,
    select(next: Tab) { dragging = false; if (tabIndex(next) >= 0) selected = next; },
    beginDrag() { dragging = true; },
    cancelDrag() { dragging = false; },
    finishDrag(offset: number, width: number): Tab | null {
      if (!dragging) return null;
      dragging = false;
      const next = tabAtOffset(offset, width);
      if (!next || next === selected) return null;
      selected = next;
      return next;
    }
  };
}
