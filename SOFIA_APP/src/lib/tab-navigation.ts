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
  let selected: Tab = tabIndex(initial)>=0?initial:'chat';
  let dragging = false;
  let touching = false, releasedAt = 0;
  return {
    current: () => selected,
    isDragging: () => dragging,
    select(next: Tab) { dragging = false; touching = false; if (tabIndex(next) >= 0) selected = next; },
    beginDrag() { dragging = true; touching = true; releasedAt = 0; },
    release(time=0) { touching = false; releasedAt = time; },
    canFinish(time=0) { return dragging && !touching && (!time || !releasedAt || time>=releasedAt); },
    cancelDrag() { dragging = false; touching = false; },
    finishDrag(offset: number, width: number,time=0): Tab | null {
      if (!dragging || touching || (time && releasedAt && time<releasedAt)) return null;
      if(width<=0||Math.abs(offset-Math.round(offset/width)*width)>1) return null;
      dragging = false;
      const next = tabAtOffset(offset, width);
      if (!next || next === selected) return null;
      selected = next;
      return next;
    }
  };
}

/** For the fixed tab bar only: never use touch-down navigation in scrollable rows. */
export function createImmediateMenuPress(activate: () => void) {
  let activatedOnDown = false;
  return {
    pressIn() { activatedOnDown = true; activate(); },
    press() {
      const wasActivated = activatedOnDown;
      activatedOnDown = false;
      if (!wasActivated) activate(); // Keyboard / accessibility activation without touch-down.
    },
    cancel() { activatedOnDown = false; },
    accessibilityActivate() { activatedOnDown = false; activate(); }
  };
}
