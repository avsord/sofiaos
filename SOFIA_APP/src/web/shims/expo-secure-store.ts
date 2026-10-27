/** Web: o Keystore do Android vira o armazenamento do navegador (so para este site, neste navegador). */
const key = (k: string) => 'sofia.secure.' + k;
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export async function getItemAsync(k: string): Promise<string | null> { try { return store()?.getItem(key(k)) ?? null; } catch { return null; } }
export async function setItemAsync(k: string, v: string): Promise<void> { try { store()?.setItem(key(k), v); } catch { /* cheio ou bloqueado */ } }
export async function deleteItemAsync(k: string): Promise<void> { try { store()?.removeItem(key(k)); } catch { /* ignore */ } }
export function getItem(k: string): string | null { try { return store()?.getItem(key(k)) ?? null; } catch { return null; } }
export function setItem(k: string, v: string): void { try { store()?.setItem(key(k), v); } catch { /* ignore */ } }
export async function isAvailableAsync() { return !!store(); }
export const AFTER_FIRST_UNLOCK = 0; export const WHEN_UNLOCKED = 1; export const ALWAYS = 2;
