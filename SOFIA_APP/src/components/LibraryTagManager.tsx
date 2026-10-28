import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {useTheme} from '../lib/theme';
import {Button, forms} from './UI';
import {Sheet} from './Sheet';
import {appAlert} from '../lib/app-alert';
import {errorText} from '../lib/chat-model';
import type {SofiaApi} from '../lib/api';
import type {Entity} from '../lib/types';
import {libraryRating, libraryTags, libraryTopic, normalizeLibraryTag as norm} from '../lib/library-filters';
import {hasTag, removeTagFromValue, renameTagInValue, tagOptions, type TagOption} from '../lib/library-tags';
/** 0.3.242: arrumar as etiquetas de um tipo da Biblioteca: renomear, juntar (renomear para uma que ja existe) e apagar.
 * Muda TODOS os itens do tipo (busca a lista inteira, nao so o que esta na tela). Apagar a etiqueta nao apaga os itens. */
export function LibraryTagManager({api, kind, fieldKey, facet, onClose, onChanged}: {api: SofiaApi; kind: string; fieldKey?: string; facet: string; onClose: () => void; onChanged: () => void}) {
  const c = useTheme(), [records, setRecords] = useState<Entity[] | null>(null), [editing, setEditing] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const valueOf = (r: Entity) => fieldKey ? String(r.data?.[fieldKey] || '') : libraryTopic(r);
  async function loadAll() { const all: Entity[] = []; for (let offset = 0; ; offset += 100) { const r = await api.entities(kind, '', offset); all.push(...r.items); if (r.items.length < 100) break; } return all; }
  useEffect(() => { let alive = true; void loadAll().then(a => { if (alive) setRecords(a); }).catch(e => { if (alive) setError(errorText(e)); }); return () => { alive = false; }; }, [api, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const options: TagOption[] = records ? tagOptions(records) : [];
  async function apply(tag: string, next: (v: string) => string, doing: string) {
    if (!records) return;
    const targets = records.filter(r => hasTag(valueOf(r), tag)); setError('');
    try {
      for (let i = 0; i < targets.length; i++) {
        setBusy(doing + ' ' + (i + 1) + ' de ' + targets.length + '…');
        const r = targets[i], v = next(valueOf(r));
        await api.saveEntity(fieldKey ? {...r, data: {...r.data, [fieldKey]: v}} : {...r, tags: libraryTags(r.tags || [], libraryRating(r), v)});
      }
      setRecords(await loadAll()); setEditing(''); onChanged();
    } catch (e) { setError(errorText(e) + ' Parte dos itens pode ter mudado; a lista foi recarregada.'); try { setRecords(await loadAll()); } catch { /* fica a lista antiga */ } onChanged(); }
    finally { setBusy(''); }
  }
  function rename(from: string) {
    const to = name.trim().replace(/\s+/g, ' ');
    if (!to || norm(to) === norm(from)) { if (to && to !== from) void apply(from, v => renameTagInValue(v, from, to), 'Renomeando'); else setEditing(''); return; }
    const other = options.find(o => norm(o.label) === norm(to));
    if (other) appAlert('Juntar etiquetas?', '“' + from + '” vai virar “' + other.label + '”. Os itens das duas ficam juntos numa só.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Juntar', onPress: () => void apply(from, v => renameTagInValue(v, from, other.label), 'Juntando')}]);
    else void apply(from, v => renameTagInValue(v, from, to), 'Renomeando');
  }
  const remove = (o: TagOption) => appAlert('Apagar a etiqueta “' + o.label + '”?', 'Ela sai de ' + o.count + (o.count === 1 ? ' item' : ' itens') + '. Os itens continuam na Biblioteca.', [{text: 'Cancelar', style: 'cancel'}, {text: 'Apagar', style: 'destructive', onPress: () => void apply(o.label, v => removeTagFromValue(v, o.label), 'Atualizando')}]);
  return <Sheet visible onClose={() => { if (!busy) onClose(); }} label="Fechar etiquetas">
    <Text style={{color: c.text, fontSize: 24, fontWeight: '600'}}>{facet}</Text>
    <Text style={{color: c.muted, fontSize: 13, marginTop: 4, marginBottom: 12}}>Renomeie, junte (renomeando para uma que já existe) ou apague. Muda em todos os itens deste tipo.</Text>
    {error ? <Text style={{color: c.danger, marginBottom: 8}}>{error}</Text> : null}
    {busy ? <Text style={{color: c.accent, marginBottom: 8}}>{busy}</Text> : null}
    {records === null && !error ? <Text style={{color: c.muted}}>Carregando etiquetas…</Text> : null}
    {records && !options.length ? <Text style={{color: c.muted}}>Nenhuma etiqueta neste tipo ainda.</Text> : null}
    <ScrollView keyboardShouldPersistTaps="always" style={{maxHeight: 420}} contentContainerStyle={{gap: 10, paddingBottom: 12}}>
      {options.map(o => editing === o.label ? <View key={o.label} style={{gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.accent}}>
        <TextInput accessibilityLabel={'Novo nome para ' + o.label} autoFocus value={name} onChangeText={setName} onSubmitEditing={() => rename(o.label)} style={[forms.input, {borderColor: c.line, color: c.text, backgroundColor: c.surface}]} />
        <View style={{flexDirection: 'row', gap: 8}}><View style={{flex: 1}}><Button title="Salvar nome" disabled={!!busy} onPress={() => rename(o.label)} /></View><View style={{flex: 1}}><Button title="Cancelar" secondary disabled={!!busy} onPress={() => setEditing('')} /></View></View>
      </View> : <View key={o.label} style={{flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line}}>
        <Text style={{flex: 1, color: c.text, fontWeight: '500'}}>{o.label} <Text style={{color: c.muted, fontWeight: '400'}}>· {o.count}</Text></Text>
        <Pressable accessibilityRole="button" accessibilityLabel={'Renomear ' + o.label} disabled={!!busy} onPress={() => { setEditing(o.label); setName(o.label); }} hitSlop={8}><Text style={{color: c.accent, fontWeight: '600'}}>Renomear</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={'Apagar ' + o.label} disabled={!!busy} onPress={() => remove(o)} hitSlop={8}><Text style={{color: c.danger, fontWeight: '600'}}>Apagar</Text></Pressable>
      </View>)}
    </ScrollView>
  </Sheet>;
}
