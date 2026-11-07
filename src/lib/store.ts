/**
 * Estado de Bitácora + bloqueo con patrón y huella.
 * Mientras la app está abierta, la llave de los datos vive solo en memoria. Cada cambio se cifra y se guarda al instante.
 */
import { useSyncExternalStore } from 'react';
import { biometricSupport, prfWithBiometric, registerBiometric } from './biometric';
import { APP_NAME, CYCLE_LENGTH, DEFAULT_MILESTONES, DEFAULT_TRIGGERS, MAX_HABITS, NEW_HABIT } from './config';
import {
  KDF_ITERATIONS,
  decryptBytes,
  decryptJSON,
  deriveKey,
  encryptBytes,
  encryptJSON,
  fromB64,
  importDataKey,
  keyFromPrf,
  newDataKey,
  randomBytes,
  toB64,
} from './crypto';
import type { ISODate } from './dates';
import { chestFromRoll } from './rewards';
import { sanitizeState, slugId } from './sanitize';
import type { Accent, AppState, Chest, DayRecord, GrandPrize, Habit, HabitValue, Mark, Milestone, Mood, Settings, TextSize } from './types';
import { deleteVault, readVault, removeLegacyVault, requestPersistence, writeVault, type LockRecord, type VaultRecord } from './vault';

export type Phase = 'loading' | 'setup' | 'locked' | 'unlocked';

interface Snapshot {
  phase: Phase;
  state: AppState | null;
  hasBio: boolean;
}

let snap: Snapshot = { phase: 'loading', state: null, hasBio: false };
let dkRaw: Uint8Array<ArrayBuffer> | null = null;
let dataKey: CryptoKey | null = null;
let lockRec: LockRecord | null = null;
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

function persist(): Promise<void> {
  writing = writing.then(async () => {
    const st = snap.state;
    if (!dataKey || !st || !lockRec) return;
    try {
      await writeVault({ v: 2, savedAt: Date.now(), lock: lockRec, data: await encryptJSON(dataKey, st) });
    } catch {
      for (const l of errorListeners) l('No se pudo guardar. Revisa el espacio del teléfono.');
    }
  });
  return writing;
}

export function flush(): Promise<void> {
  return writing;
}

function commit(next: AppState) {
  set({ state: next });
  void persist();
}

// ---------- Bóveda ----------

export async function initStore(): Promise<void> {
  removeLegacyVault();
  const v = await readVault();
  lockRec = v?.lock ?? null;
  set({ phase: v ? 'locked' : 'setup', state: null, hasBio: Boolean(v?.lock.bio) });
}

async function patternLock(pattern: string, raw: Uint8Array<ArrayBuffer>) {
  const salt = randomBytes(16);
  const kek = await deriveKey(pattern, salt, KDF_ITERATIONS);
  return { iter: KDF_ITERATIONS, salt: toB64(salt), wrapped: await encryptBytes(kek, raw) };
}

async function openWith(raw: Uint8Array<ArrayBuffer>, record: Pick<VaultRecord, 'data'>): Promise<AppState | null> {
  const key = await importDataKey(raw);
  const state = sanitizeState(await decryptJSON(key, record.data));
  if (!state) return null;
  dkRaw = raw;
  dataKey = key;
  return state;
}

async function unwrapWithPattern(lock: LockRecord, pattern: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return await decryptBytes(await deriveKey(pattern, fromB64(lock.pattern.salt), lock.pattern.iter), lock.pattern.wrapped);
  } catch {
    return null;
  }
}

export async function createVault(pattern: string, state: AppState): Promise<void> {
  const raw = newDataKey();
  dkRaw = raw;
  dataKey = await importDataKey(raw);
  lockRec = { pattern: await patternLock(pattern, raw) };
  set({ phase: 'unlocked', state, hasBio: false });
  await persist();
  void requestPersistence();
}

export async function unlockWithPattern(pattern: string): Promise<boolean> {
  const v = await readVault();
  if (!v) {
    set({ phase: 'setup' });
    return false;
  }
  const raw = await unwrapWithPattern(v.lock, pattern);
  if (!raw) return false;
  const state = await openWith(raw, v);
  if (!state) return false;
  lockRec = v.lock;
  set({ phase: 'unlocked', state, hasBio: Boolean(v.lock.bio) });
  return true;
}

export async function unlockWithBiometric(): Promise<'ok' | 'fail' | 'unavailable'> {
  const v = await readVault();
  const bio = v?.lock.bio;
  if (!v || !bio) return 'unavailable';
  try {
    const prf = await prfWithBiometric(bio.credId, bio.prfSalt);
    const state = await openWith(await decryptBytes(await keyFromPrf(prf), bio.wrapped), v);
    if (!state) return 'fail';
    lockRec = v.lock;
    set({ phase: 'unlocked', state, hasBio: true });
    return 'ok';
  } catch {
    return 'fail';
  }
}

export async function verifyPattern(pattern: string): Promise<boolean> {
  const v = await readVault();
  return Boolean(v && (await unwrapWithPattern(v.lock, pattern)));
}

export async function changePattern(pattern: string): Promise<void> {
  if (!dkRaw || !lockRec) return;
  await writing;
  lockRec = { ...lockRec, pattern: await patternLock(pattern, dkRaw) };
  await persist();
}

export { biometricSupport };

export async function enableBiometric(): Promise<void> {
  if (!dkRaw || !lockRec) throw new Error('LOCKED');
  const reg = await registerBiometric(APP_NAME);
  const wrapped = await encryptBytes(await keyFromPrf(reg.prfOutput), dkRaw);
  lockRec = { ...lockRec, bio: { credId: reg.credId, prfSalt: reg.prfSalt, wrapped } };
  set({ hasBio: true });
  await persist();
}

export async function disableBiometric(): Promise<void> {
  if (!lockRec) return;
  const { bio: _bio, ...rest } = lockRec;
  void _bio;
  lockRec = rest;
  set({ hasBio: false });
  await persist();
}

export function lock() {
  if (snap.phase !== 'unlocked') return;
  dkRaw = null;
  dataKey = null;
  set({ phase: 'locked', state: null });
}

export async function wipeAll(): Promise<void> {
  await writing;
  dkRaw = null;
  dataKey = null;
  lockRec = null;
  await deleteVault();
  set({ phase: 'setup', state: null, hasBio: false });
}

// ---------- Respaldo ----------

export async function currentBackup(): Promise<Omit<VaultRecord, 'savedAt'> | null> {
  if (!dataKey || !lockRec || !snap.state) return null;
  await writing;
  return { v: 2, lock: { pattern: lockRec.pattern }, data: await encryptJSON(dataKey, snap.state) };
}

export async function openBackup(record: Pick<VaultRecord, 'lock' | 'data'>, pattern: string): Promise<AppState | null> {
  const raw = await unwrapWithPattern(record.lock, pattern);
  if (!raw) return null;
  try {
    return sanitizeState(await decryptJSON(await importDataKey(raw), record.data));
  } catch {
    return null;
  }
}

export function replaceState(next: AppState) {
  commit(next);
}

// ---------- Estado inicial ----------

export interface InitialOptions {
  startDate: ISODate;
  habits: Habit[];
  triggers?: string[];
  milestones?: Milestone[];
  grand?: GrandPrize | null;
  partyBonus?: number;
}

export function initialState(o: InitialOptions): AppState {
  const settings: Settings = {
    startDate: o.startDate,
    cycleLength: CYCLE_LENGTH,
    habits: o.habits,
    triggers: o.triggers?.length ? o.triggers : [...DEFAULT_TRIGGERS],
    milestones: o.milestones?.length ? o.milestones : structuredClone(DEFAULT_MILESTONES),
    grand: o.grand ?? null,
    partyBonus: o.partyBonus ?? 0,
    theme: 'system',
    autoLockMinutes: 1,
    createdAt: new Date().toISOString(),
  };
  return { schema: 2, settings, days: {}, claims: {}, chests: {}, urges: 0 };
}

// ---------- Acciones ----------

function update(fn: (s: AppState) => AppState) {
  if (!snap.state) return;
  commit(fn(snap.state));
}
function updateSettings(fn: (s: Settings) => Settings) {
  update((st) => ({ ...st, settings: fn(st.settings) }));
}
function dayOf(st: AppState, date: ISODate): DayRecord {
  return st.days[date] ?? { states: {}, triggers: {} };
}

export const actions = {
  mark(date: ISODate, habitId: string, value: Mark) {
    update((st) => {
      const prev = dayOf(st, date);
      const states = { ...prev.states };
      const triggers = { ...prev.triggers };
      if (states[habitId] === value) {
        delete states[habitId];
        delete triggers[habitId];
      } else {
        states[habitId] = value;
        if (value === 'ok') delete triggers[habitId];
      }
      return { ...st, days: { ...st.days, [date]: { ...prev, states, triggers, updatedAt: new Date().toISOString() } } };
    });
  },

  toggleTrigger(date: ISODate, habitId: string, trigger: string) {
    update((st) => {
      const prev = dayOf(st, date);
      const list = prev.triggers[habitId] ?? [];
      const next = list.includes(trigger) ? list.filter((t) => t !== trigger) : [...list, trigger];
      const triggers = { ...prev.triggers, [habitId]: next };
      if (!next.length) delete triggers[habitId];
      return { ...st, days: { ...st.days, [date]: { ...prev, triggers, updatedAt: new Date().toISOString() } } };
    });
  },

  toggleParty(date: ISODate) {
    update((st) => {
      const prev = dayOf(st, date);
      const next = { ...prev, updatedAt: new Date().toISOString() };
      if (prev.party) delete next.party;
      else next.party = true;
      return { ...st, days: { ...st.days, [date]: next } };
    });
  },

  setMood(date: ISODate, mood: Mood | null) {
    update((st) => {
      const next = { ...dayOf(st, date), updatedAt: new Date().toISOString() };
      if (mood) next.mood = mood;
      else delete next.mood;
      return { ...st, days: { ...st.days, [date]: next } };
    });
  },

  useWildcard(date: ISODate) {
    update((st) => ({ ...st, days: { ...st.days, [date]: { ...dayOf(st, date), wildcard: true, updatedAt: new Date().toISOString() } } }));
  },

  removeWildcard(date: ISODate) {
    update((st) => {
      const prev = st.days[date];
      if (!prev) return st;
      const { wildcard: _w, ...rest } = prev;
      void _w;
      return { ...st, days: { ...st.days, [date]: rest } };
    });
  },

  /** Reclama un premio: el escalón ('7', '14', …) o el gran premio ('grand'). Su precio sale de tu ahorro. */
  claim(key: string, price: number) {
    update((st) => (st.claims[key] ? st : { ...st, claims: { ...st.claims, [key]: { claimedAt: new Date().toISOString(), price: Math.max(0, Math.round(price)) } } }));
  },

  openChest(key: string): Chest | null {
    const st = snap.state;
    if (!st || st.chests[key]) return null;
    const roll = crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
    const chest = { outcome: chestFromRoll(roll), openedAt: new Date().toISOString() };
    commit({ ...st, chests: { ...st.chests, [key]: chest } });
    return chest;
  },

  urgeDone() {
    update((st) => ({ ...st, urges: st.urges + 1 }));
  },

  setStartDate(startDate: ISODate) {
    updateSettings((s) => ({ ...s, startDate }));
  },

  restartCycle(startDate: ISODate) {
    update((st) => ({ ...st, settings: { ...st.settings, startDate }, claims: {}, chests: {} }));
  },

  setTheme(theme: Settings['theme']) {
    updateSettings((s) => ({ ...s, theme }));
  },

  setAccent(accent: Accent) {
    updateSettings((s) => {
      const next = { ...s };
      if (accent === 'verde') delete next.accent;
      else next.accent = accent;
      return next;
    });
  },

  setTextSize(size: TextSize) {
    updateSettings((s) => {
      const next = { ...s };
      if (size === 'normal') delete next.textSize;
      else next.textSize = size;
      return next;
    });
  },

  setAutoLock(minutes: number) {
    updateSettings((s) => ({ ...s, autoLockMinutes: minutes }));
  },

  setPartyBonus(bs: number) {
    updateSettings((s) => ({ ...s, partyBonus: Math.max(0, Math.round(bs)) }));
  },

  setGrand(grand: GrandPrize | null) {
    updateSettings((s) => ({ ...s, grand }));
  },

  setMilestone(day: number, prize: { name: string; price: number } | null) {
    updateSettings((s) => {
      const rest = s.milestones.filter((m) => m.day !== day);
      return { ...s, milestones: (prize ? [...rest, { day, ...prize }] : rest).sort((a, b) => a.day - b.day) };
    });
  },

  updateHabit(id: string, patch: Partial<Omit<Habit, 'id' | 'value'>>) {
    updateSettings((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  },

  setHabitValue(id: string, value: HabitValue | null) {
    updateSettings((s) => ({
      ...s,
      habits: s.habits.map((h) => {
        if (h.id !== id) return h;
        const next = { ...h };
        if (value) next.value = value;
        else delete next.value;
        return next;
      }),
    }));
  },

  addHabit(name: string) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    updateSettings((s) => {
      if (s.habits.length >= MAX_HABITS) return s;
      return { ...s, habits: [...s.habits, { ...NEW_HABIT, id: slugId(clean, new Set(s.habits.map((h) => h.id))), name: clean }] };
    });
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

  /** Aplica un archivo de configuración: hábitos, disparadores y premios. El historial se conserva. */
  applyConfig(c: { habits: Habit[]; triggers: string[]; milestones: Milestone[]; grand: GrandPrize | null; partyBonus: number }) {
    if (!c.habits.length) return;
    updateSettings((s) => ({
      ...s,
      habits: c.habits.slice(0, MAX_HABITS),
      triggers: c.triggers,
      milestones: c.milestones.length ? c.milestones : s.milestones,
      grand: c.grand ?? s.grand,
      partyBonus: c.partyBonus || s.partyBonus,
    }));
  },

  markBackup() {
    updateSettings((s) => ({ ...s, lastBackupAt: new Date().toISOString() }));
  },
};
