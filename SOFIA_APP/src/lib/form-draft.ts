import {useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 0.3.168: guarda o que a pessoa esta digitando num formulario. Se ela sair do app (ou o app for
// encerrado pelo sistema) no meio do preenchimento, ao voltar o formulario volta como estava.
// O rascunho e apagado quando o registro e salvo, ou quando ela desiste de verdade.
const PREFIX = 'sofia.form.draft.v1:';

// 0.3.224: o rascunho guarda a hora; com mais de 6 h (ou no formato antigo, sem hora) ele nao volta mais - antes um
// cadastro abandonado reaparecia dias depois ao tocar em "Nova" e acabava salvo duas vezes.
const MAX_AGE = 6 * 60 * 60 * 1000;
export async function readFormDraft<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key); if (!raw) return null;
    const box = JSON.parse(raw) as {v?: T; at?: number};
    if (!box || typeof box !== 'object' || typeof box.at !== 'number' || !('v' in box) || Date.now() - box.at > MAX_AGE) { await AsyncStorage.removeItem(PREFIX + key); return null; }
    return box.v as T;
  } catch { return null; }
}
/** 0.3.224: apaga todos os rascunhos (ao redefinir um modulo, nada antigo volta). */
export async function clearAllFormDrafts(prefix = ''): Promise<void> {
  try { const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX + prefix)); if (keys.length) await AsyncStorage.multiRemove(keys); } catch { /* best-effort */ }
}
export async function clearFormDraft(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(PREFIX + key); } catch { /* rascunho e best-effort */ }
}
export async function writeFormDraft<T>(key: string, value: T): Promise<void> {
  try { await AsyncStorage.setItem(PREFIX + key, JSON.stringify({v: value, at: Date.now()})); } catch { /* idem */ }
}

/** Devolve [rascunho carregado, pronto, salvar, apagar]. Enquanto nao estiver pronto, nao grava
 * nada - senao o estado inicial vazio apagaria o rascunho recem-escrito. */
export function useFormDraft<T extends Record<string, unknown>>(key: string, value: T, enabled = true) {
  const [draft, setDraft] = useState<T | null>(null), [ready, setReady] = useState(false);
  const last = useRef('');
  useEffect(() => {
    let alive = true;
    if (!enabled) { setReady(true); return; }
    void readFormDraft<T>(key).then(found => { if (!alive) return; setDraft(found); setReady(true); });
    return () => { alive = false; };
  }, [key, enabled]);
  useEffect(() => {
    if (!ready || !enabled) return;
    const serialized = JSON.stringify(value);
    if (serialized === last.current) return;
    last.current = serialized;
    const empty = Object.values(value).every(v => v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length));
    const timer = setTimeout(() => { void (empty ? clearFormDraft(key) : writeFormDraft(key, value)); }, 400);
    return () => clearTimeout(timer);
  }, [key, value, ready, enabled]);
  return {draft, ready, clear: () => { last.current = ''; return clearFormDraft(key); }};
}
