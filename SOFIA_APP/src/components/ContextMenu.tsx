import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Icon, type IconName} from './Icon';
/** 0.3.263 (computador): menu do botao direito (Editar, Duplicar, Apagar...) aberto junto do ponteiro. No celular nao existe:
 * la essas acoes continuam no "segurar" e nos botoes de cada tela. */
export type MenuItem = {label: string; icon?: IconName; danger?: boolean; run: () => void};
type Open = {x: number; y: number; items: MenuItem[]} | null;
let setter: ((v: Open) => void) | null = null;
export function openContextMenu(x: number, y: number, items: MenuItem[]) { if (setter && items.length) setter({x, y, items}); }
/** Props para pôr num Pressable: clique direito abre o menu com estas acoes (so no site). */
export function contextMenu(items: () => MenuItem[]): Record<string, unknown> {
  if (typeof document === 'undefined') return {};
  return {onContextMenu: (e: any) => { e?.preventDefault?.(); e?.stopPropagation?.(); const ne = e?.nativeEvent || e; openContextMenu(ne.clientX ?? ne.pageX ?? 0, ne.clientY ?? ne.pageY ?? 0, items()); }};
}
export function ContextMenuHost() {
  const c = useTheme(), [open, setOpen] = useState<Open>(null);
  useEffect(() => { setter = setOpen; return () => { if (setter === setOpen) setter = null; }; }, []);
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [open]);
  if (!open) return null;
  const W = 220, vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800, H = open.items.length * 38 + 12;
  const left = Math.max(8, Math.min(open.x, vw - W - 8)), top = open.y + H > vh - 8 ? Math.max(8, open.y - H) : open.y;
  return <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999}}>
    <Pressable accessibilityLabel="Fechar menu" onPress={() => setOpen(null)} {...({onContextMenu: (e: any) => { e.preventDefault(); setOpen(null); }} as any)} style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}} />
    <View testID="context-menu" accessibilityRole="menu" style={{position: 'absolute', left, top, width: W, paddingVertical: 6, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, boxShadow: '0 10px 30px rgba(20,14,40,0.18)'} as any}>
      {open.items.map((it, i) => <Pressable key={i} accessibilityRole="menuitem" onPress={() => { setOpen(null); setTimeout(it.run, 0); }} style={{flexDirection: 'row', alignItems: 'center', gap: 10, height: 38, paddingHorizontal: 12, marginHorizontal: 4, borderRadius: 8}}>
        {it.icon ? <Icon name={it.icon} size={16} color={it.danger ? c.danger : c.muted} /> : <View style={{width: 16}} />}
        <Text style={{color: it.danger ? c.danger : c.text, fontSize: 14}}>{it.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
