import React, {useMemo, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {forms} from './UI';
import {addTag, joinTags, splitTags, suggestTags, toggleTag, type TagOption} from '../lib/library-tags';
/** 0.3.242: etiquetas da Biblioteca para TOCAR. Mostra as que ja existem no tipo; ao digitar, oferece a igual que ja
 * existe ("terror" -> "Terror") e as parecidas; so cria uma nova se nao houver igual. Varias por item. */
export function TagPicker({label, value, options, onChange, maxLength = 1000, placeholder = 'Nova etiqueta'}: {label: string; value: string; options: TagOption[]; onChange: (v: string) => void; maxLength?: number; placeholder?: string}) {
  const c = useTheme(), [typed, setTyped] = useState(''), [warn, setWarn] = useState('');
  const selected = splitTags(value);
  const sel = new Set(selected.map(s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')));
  const isSel = (l: string) => sel.has(l.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR'));
  const all = useMemo(() => { const extra = selected.filter(s => !options.some(o => o.label.localeCompare(s, 'pt-BR', {sensitivity: 'base'}) === 0)).map(s => ({label: s, count: 0})); return [...options, ...extra]; }, [options, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = suggestTags(typed, all);
  const commit = (next: string[]) => { const v = joinTags(next); if (v.length > maxLength) { setWarn('Limite de etiquetas atingido neste tipo. Tire uma antes de pôr outra.'); return false; } setWarn(''); onChange(v); return true; };
  const add = (t: string) => { if (commit(addTag(selected, t, all))) setTyped(''); };
  const chip = (l: string, on: boolean, onPress: () => void, extra = '') => <Pressable key={l + extra} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={(on ? 'Tirar etiqueta ' : 'Pôr etiqueta ') + l} onPress={onPress}
    style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface}}>
    <Text style={{color: on ? c.accent : c.text, fontWeight: on ? '700' : '500', fontSize: 13}}>{(on ? '✓ ' : '') + l + extra}</Text></Pressable>;
  return <View style={{gap: 8}}>
    <Text style={[forms.label, {color: c.muted}]}>{label}</Text>
    {all.length ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{all.map(o => chip(o.label, isSel(o.label), () => commit(toggleTag(selected, o.label))))}</View> : null}
    <TextInput accessibilityLabel={'Nova etiqueta em ' + label} value={typed} onChangeText={setTyped} onSubmitEditing={() => add(s.exact || typed)} placeholder={placeholder} placeholderTextColor={c.muted} returnKeyType="done" blurOnSubmit={false}
      style={[forms.input, {borderColor: c.line, color: c.text, backgroundColor: c.surface}]} />
    {typed.trim() ? <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
      {s.exact ? chip(s.exact, isSel(s.exact), () => add(s.exact!), ' · já existe') : null}
      {s.matches.map(m => chip(m, isSel(m), () => add(m)))}
      {s.canCreate ? <Pressable accessibilityRole="button" accessibilityLabel={'Criar etiqueta ' + typed.trim()} onPress={() => add(typed)} style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent}}>
        <Text style={{color: c.accent, fontWeight: '600', fontSize: 13}}>+ Criar “{typed.trim()}”</Text></Pressable> : null}
    </View> : null}
    {warn ? <Text style={{color: c.danger, fontSize: 12}}>{warn}</Text> : null}
  </View>;
}
