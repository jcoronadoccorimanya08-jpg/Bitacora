/**
 * Guarda la bóveda cifrada de Bitácora. Doble copia: localStorage (sincrónica: no se pierde si cierras de golpe)
 * e IndexedDB (copia principal). Al abrir se usa la más reciente.
 */
import { createStore, del, get, set } from 'idb-keyval';
import { isWrapped, type Wrapped } from './crypto';

const KEY = 'vault';
const LS_KEY = 'bitacora.vault2';
const store = typeof indexedDB !== 'undefined' ? createStore('bitacora-v2', 'vault') : null;

export interface PatternLock {
  iter: number;
  salt: string;
  wrapped: Wrapped;
}

export interface BioLock {
  credId: string;
  prfSalt: string;
  wrapped: Wrapped;
}

export interface LockRecord {
  pattern: PatternLock;
  bio?: BioLock;
}

export interface VaultRecord {
  v: 2;
  savedAt: number;
  lock: LockRecord;
  data: Wrapped;
}

export function isVaultRecord(v: unknown): v is VaultRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<VaultRecord>;
  const p = r.lock?.pattern;
  return r.v === 2 && isWrapped(r.data) && !!p && typeof p.iter === 'number' && typeof p.salt === 'string' && isWrapped(p.wrapped);
}

export async function readVault(): Promise<VaultRecord | null> {
  const found: VaultRecord[] = [];
  try {
    if (store) {
      const v = await get(KEY, store);
      if (isVaultRecord(v)) found.push(v);
    }
  } catch {
    /* se usa la otra copia */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (isVaultRecord(v)) found.push(v);
  } catch {
    /* se usa la otra copia */
  }
  found.sort((a, b) => b.savedAt - a.savedAt);
  return found[0] ?? null;
}

export async function writeVault(record: VaultRecord): Promise<void> {
  let ok = false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(record));
    ok = true;
  } catch {
    /* queda IndexedDB */
  }
  if (store) {
    try {
      await set(KEY, record, store);
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

/** La versión anterior usaba un PIN. Empezamos de cero: se elimina esa bóveda. */
export function removeLegacyVault(): void {
  try {
    localStorage.removeItem('bitacora.vault');
  } catch {
    /* nada */
  }
  try {
    indexedDB?.deleteDatabase('bitacora');
  } catch {
    /* nada */
  }
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
