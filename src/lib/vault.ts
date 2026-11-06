/**
 * Guarda el estado cifrado. Doble copia: localStorage (sincrónico, no se pierde si cierras de golpe)
 * e IndexedDB (copia principal). Al abrir se usa la más reciente.
 */
import { createStore, del, get, set } from 'idb-keyval';
import { isSealed, type Sealed } from './crypto';

const KEY = 'vault';
const LS_KEY = 'bitacora.vault';
const store = typeof indexedDB !== 'undefined' ? createStore('bitacora', 'vault') : null;

interface Envelope {
  savedAt: number;
  sealed: Sealed;
}

function readEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const env = raw as Partial<Envelope>;
  if (!isSealed(env.sealed)) return null;
  return { savedAt: typeof env.savedAt === 'number' ? env.savedAt : 0, sealed: env.sealed };
}

export async function readVault(): Promise<Sealed | null> {
  const found: Envelope[] = [];
  try {
    if (store) {
      const env = readEnvelope(await get(KEY, store));
      if (env) found.push(env);
    }
  } catch {
    /* se usa la otra copia */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    const env = raw ? readEnvelope(JSON.parse(raw)) : null;
    if (env) found.push(env);
  } catch {
    /* se usa la otra copia */
  }
  found.sort((a, b) => b.savedAt - a.savedAt);
  return found[0]?.sealed ?? null;
}

export async function writeVault(sealed: Sealed): Promise<void> {
  const env: Envelope = { savedAt: Date.now(), sealed };
  let ok = false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(env));
    ok = true;
  } catch {
    /* queda IndexedDB */
  }
  if (store) {
    try {
      await set(KEY, env, store);
      ok = true;
    } catch {
      /* queda localStorage */
    }
  }
  if (!ok) throw new Error('No se pudo guardar');
}

export async function deleteVault(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* nada */
  }
  if (store) await del(KEY, store).catch(() => undefined);
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
