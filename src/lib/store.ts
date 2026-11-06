/**
 * Estado de la app + bloqueo con PIN.
 * Mientras está desbloqueada, la clave vive solo en memoria. Cada cambio se cifra y se guarda de inmediato.
 */
import { useSyncExternalStore } from 'react';
import { CYCLE_LENGTH, DEFAULT_TRIGGERS, MAX_HABITS, NEW_HABIT } from './config';
import { KDF_ITERATIONS, deriveKey, fromB64, randomBytes, seal, unseal, type Sealed } from './crypto';
import type { ISODate } from './dates';
import { sanitizeState, slugId } from './sanitize';
import type { AppState, Habit, Mark, Settings } from './types';
import { deleteVault, readVault, requestPersistence, writeVault } from './vault';

export type Phase = 'loading' | 'setup' | 'locked' | 'unlocked';

interface Snapshot {
  phase: Phase;
  state: AppState | null;
}

let snap: Snapshot = { phase: 'loading', state: null };
let key: CryptoKey | null = null;
let salt: Uint8Array<ArrayBuffer> = new Uint8Array(16);
let iter = KDF_ITERATIONS;
let writing: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const errorListeners = new Set<(m: string) => void>();

function emit() {
  for (const l of listeners) l();
}

function set(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  emit();
}

export function useStore(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
    () => snap,
  );
}

export function getState(): AppState | null {
  return snap.state;
}

export function onSaveError(cb: (m: string) => void): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

/** Cifra el estado actual y lo guarda. Las escrituras se encadenan para respetar el orden. */
function persist(): Promise<void> {
  writing = writing.then(async () => {
    const st = snap.state;
    if (!key || !st) return;
    try {
      await writeVault(await seal(key, salt, iter, st));
    } catch {
      for (const l of errorListeners) l('No se pudo guardar. Revisa el espacio del teléfono.');
    }
  });
  return writing;
}

function commit(next: AppState) {
  set({ state: next });
  void persist();
}

/** Espera a que terminen las escrituras pendientes (para respaldos y pruebas). */
export function flush(): Promise<void> {
  return writing;
}

export async function initStore(): Promise<void> {
  const v = await readVault();
  set({ phase: v ? 'locked' : 'setup', state: null });
}

export async function createVault(pin: string, state: AppState): Promise<void> {
  salt = randomBytes(16);
  iter = KDF_ITERATIONS;
  key = await deriveKey(pin, salt, iter);
  set({ phase: 'unlocked', state });
  await persist();
  void requestPersistence();
}

/** Devuelve true si el PIN es correcto. */
export async function unlock(pin: string): Promise<boolean> {
  const v = await readVault();
  if (!v) {
    set({ phase: 'setup' });
    return false;
  }
  const k = await deriveKey(pin, fromB64(v.salt), v.iter);
  let raw: unknown;
  try {
    raw = await unseal(k, v);
  } catch {
    return false;
  }
  const state = sanitizeState(raw);
  if (!state) return false;
  key = k;
  salt = fromB64(v.salt);
  iter = v.iter;
  set({ phase: 'unlocked', state });
  return true;
}

/** Comprueba el PIN actual sin cambiar el estado. */
export async function verifyPin(pin: string): Promise<boolean> {
  const v = await readVault();
  if (!v) return false;
  try {
    await unseal(await deriveKey(pin, fromB64(v.salt), v.iter), v);
    return true;
  } catch {
    return false;
  }
}

export function lock() {
  if (snap.phase !== 'unlocked') return;
  key = null;
  set({ phase: 'locked', state: null });
}

export async function changePin(newPin: string): Promise<void> {
  if (!snap.state) return;
  await writing;
  salt = randomBytes(16);
  iter = KDF_ITERATIONS;
  key = await deriveKey(newPin, salt, iter);
  await persist();
}

/** El respaldo cifrado actual (con el PIN actual). */
export async function currentSealed(): Promise<Sealed | null> {
  if (!key || !snap.state) return null;
  await writing;
  return seal(key, salt, iter, snap.state);
}

export async function wipeAll(): Promise<void> {
  await writing;
  key = null;
  await deleteVault();
  set({ phase: 'setup', state: null });
}

/** Restaura un respaldo ya abierto: queda protegido con el PIN actual. */
export function replaceState(next: AppState) {
  commit(next);
}

export function initialState(opts: { startDate: ISODate; habits: Habit[]; triggers?: string[]; theme?: Settings['theme'] }): AppState {
  return {
    schema: 1,
    settings: {
      startDate: opts.startDate,
      cycleLength: CYCLE_LENGTH,
      habits: opts.habits,
      triggers: opts.triggers?.length ? opts.triggers : [...DEFAULT_TRIGGERS],
      theme: opts.theme ?? 'system',
      autoLockMinutes: 1,
      createdAt: new Date().toISOString(),
    },
    days: {},
    rewards: {},
  };
}

function update(fn: (s: AppState) => AppState) {
  if (!snap.state) return;
  commit(fn(snap.state));
}

function updateSettings(fn: (s: Settings) => Settings) {
  update((st) => ({ ...st, settings: fn(st.settings) }));
}

export const actions = {
  /** Marca ok/fail; tocar de nuevo la misma opción la desmarca. Al marcar ok se limpian los disparadores. */
  mark(date: ISODate, habitId: string, value: Mark) {
    update((st) => {
      const prev = st.days[date] ?? { states: {}, triggers: {} };
      const states = { ...prev.states };
      const triggers = { ...prev.triggers };
      if (states[habitId] === value) {
        delete states[habitId];
        delete triggers[habitId];
      } else {
        states[habitId] = value;
        if (value === 'ok') delete triggers[habitId];
      }
      return { ...st, days: { ...st.days, [date]: { states, triggers, updatedAt: new Date().toISOString() } } };
    });
  },

  toggleTrigger(date: ISODate, habitId: string, trigger: string) {
    update((st) => {
      const prev = st.days[date] ?? { states: {}, triggers: {} };
      const list = prev.triggers[habitId] ?? [];
      const next = list.includes(trigger) ? list.filter((t) => t !== trigger) : [...list, trigger];
      const triggers = { ...prev.triggers, [habitId]: next };
      if (!next.length) delete triggers[habitId];
      return { ...st, days: { ...st.days, [date]: { ...prev, triggers, updatedAt: new Date().toISOString() } } };
    });
  },

  setRewardText(k: number, text: string) {
    update((st) => ({ ...st, rewards: { ...st.rewards, [String(k)]: { ...(st.rewards[String(k)] ?? { text: '' }), text: text.slice(0, 80) } } }));
  },

  claimReward(k: number) {
    update((st) => ({
      ...st,
      rewards: { ...st.rewards, [String(k)]: { ...(st.rewards[String(k)] ?? { text: '' }), claimedAt: new Date().toISOString() } },
    }));
  },

  setStartDate(startDate: ISODate) {
    updateSettings((s) => ({ ...s, startDate }));
  },

  restartCycle(startDate: ISODate) {
    update((st) => ({ ...st, settings: { ...st.settings, startDate }, rewards: {} }));
  },

  setTheme(theme: Settings['theme']) {
    updateSettings((s) => ({ ...s, theme }));
  },

  setAutoLock(minutes: number) {
    updateSettings((s) => ({ ...s, autoLockMinutes: minutes }));
  },

  updateHabit(id: string, patch: Partial<Omit<Habit, 'id'>>) {
    updateSettings((s) => ({
      ...s,
      habits: s.habits.map((h) => (h.id === id ? { ...h, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v).slice(0, k === 'phrase' ? 160 : k === 'q' ? 120 : 60)])) } : h)),
    }));
  },

  addHabit(name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    updateSettings((s) => {
      if (s.habits.length >= MAX_HABITS) return s;
      const id = slugId(clean, new Set(s.habits.map((h) => h.id)));
      return { ...s, habits: [...s.habits, { ...NEW_HABIT, id, name: clean }] };
    });
  },

  removeHabit(id: string) {
    updateSettings((s) => (s.habits.length <= 1 ? s : { ...s, habits: s.habits.filter((h) => h.id !== id) }));
  },

  moveHabit(id: string, dir: -1 | 1) {
    updateSettings((s) => {
      const i = s.habits.findIndex((h) => h.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.habits.length) return s;
      const habits = [...s.habits];
      [habits[i], habits[j]] = [habits[j]!, habits[i]!];
      return { ...s, habits };
    });
  },

  addTrigger(t: string) {
    const clean = t.trim().slice(0, 40);
    if (!clean) return;
    updateSettings((s) => (s.triggers.includes(clean) ? s : { ...s, triggers: [...s.triggers, clean] }));
  },

  removeTrigger(t: string) {
    updateSettings((s) => ({ ...s, triggers: s.triggers.filter((x) => x !== t) }));
  },

  /** Reemplaza hábitos y disparadores (por ejemplo, desde un archivo de configuración). El historial se conserva. */
  applyConfig(habits: Habit[], triggers: string[]) {
    if (!habits.length) return;
    updateSettings((s) => ({ ...s, habits: habits.slice(0, MAX_HABITS), triggers }));
  },

  markBackup() {
    updateSettings((s) => ({ ...s, lastBackupAt: new Date().toISOString() }));
  },
};
