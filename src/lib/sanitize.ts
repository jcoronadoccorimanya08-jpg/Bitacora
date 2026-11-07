/** Validación de datos descifrados, respaldos y archivos de configuración. */
import { CYCLE_LENGTH, DEFAULT_TRIGGERS, MAX_HABITS, MAX_TRIGGERS, NEW_HABIT } from './config';
import { isValidISODate } from './dates';
import type { AppState, Chest, ChestOutcome, DayRecord, GrandPrize, Habit, HabitValue, Mark, Milestone, Settings, Theme } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max) : null);
const num = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : def;

export function slugId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'habito';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

function habitValue(v: unknown): HabitValue | undefined {
  if (!isObj(v)) return undefined;
  const kind = v.kind === 'bs' || v.kind === 'horas' || v.kind === 'dias' ? v.kind : null;
  if (!kind) return undefined;
  const value: HabitValue = { kind, amount: Math.round(num(v.amount, 0, 10000, 0) * 100) / 100 };
  const label = str(v.label, 40);
  if (label) value.label = label;
  return value;
}

export function sanitizeHabits(v: unknown): Habit[] {
  if (!Array.isArray(v)) return [];
  const out: Habit[] = [];
  const taken = new Set<string>();
  for (const item of v) {
    if (!isObj(item)) continue;
    const name = str(item.name, 60);
    if (!name) continue;
    let id = str(item.id, 40);
    if (!id || taken.has(id)) id = slugId(name, taken);
    else taken.add(id);
    const h: Habit = {
      id,
      name,
      q: str(item.q, 120) || NEW_HABIT.q,
      ok: str(item.ok, 24) || NEW_HABIT.ok,
      fail: str(item.fail ?? item.f, 24) || NEW_HABIT.fail,
      phrase: str(item.phrase ?? item.fr, 160) ?? '',
    };
    const value = habitValue(item.value);
    if (value) h.value = value;
    out.push(h);
    if (out.length >= MAX_HABITS) break;
  }
  return out;
}

export function sanitizeTriggers(v: unknown): string[] {
  if (!Array.isArray(v)) return [...DEFAULT_TRIGGERS];
  const out: string[] = [];
  for (const t of v) {
    const s = str(t, 40);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= MAX_TRIGGERS) break;
  }
  return out;
}

export function sanitizeMilestones(v: unknown): Milestone[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: Milestone[] = [];
  for (const m of v) {
    if (!isObj(m)) continue;
    const day = Math.round(num(m.day, 1, 365, 0));
    const name = str(m.name, 60);
    if (!day || day % 7 !== 0 || !name || seen.has(day)) continue;
    seen.add(day);
    out.push({ day, name, price: Math.round(num(m.price, 0, 100000, 0)) });
  }
  return out.sort((a, b) => a.day - b.day);
}

export function sanitizeGrand(v: unknown): GrandPrize | null {
  if (!isObj(v)) return null;
  const name = str(v.name, 60);
  if (!name) return null;
  const g: GrandPrize = { name };
  if (typeof v.price === 'number') g.price = Math.round(num(v.price, 0, 100000, 0));
  if (isValidISODate(v.date)) g.date = v.date;
  return g;
}

function sanitizeSettings(v: unknown): Settings | null {
  if (!isObj(v) || !isValidISODate(v.startDate)) return null;
  const habits = sanitizeHabits(v.habits);
  if (!habits.length) return null;
  const theme: Theme = v.theme === 'dark' || v.theme === 'light' ? v.theme : 'system';
  const s: Settings = {
    startDate: v.startDate,
    cycleLength: Math.round(num(v.cycleLength, 7, 365, CYCLE_LENGTH)),
    habits,
    triggers: sanitizeTriggers(v.triggers),
    milestones: sanitizeMilestones(v.milestones),
    grand: sanitizeGrand(v.grand),
    partyBonus: Math.round(num(v.partyBonus, 0, 10000, 0)),
    theme,
    autoLockMinutes: Math.round(num(v.autoLockMinutes, 0, 60, 1)),
    createdAt: str(v.createdAt, 40) ?? new Date().toISOString(),
  };
  const lb = str(v.lastBackupAt, 40);
  if (lb) s.lastBackupAt = lb;
  return s;
}

const OUTCOMES: ChestOutcome[] = ['bs20', 'bs50', 'wildcard', 'series'];

export function sanitizeState(raw: unknown): AppState | null {
  if (!isObj(raw) || raw.schema !== 2) return null;
  const settings = sanitizeSettings(raw.settings);
  if (!settings) return null;
  const state: AppState = { schema: 2, settings, days: {}, claims: {}, chests: {}, urges: Math.round(num(raw.urges, 0, 100000, 0)) };
  if (isObj(raw.days)) {
    for (const [date, rec] of Object.entries(raw.days)) {
      if (!isValidISODate(date) || !isObj(rec)) continue;
      const day: DayRecord = { states: {}, triggers: {} };
      if (isObj(rec.states)) for (const [k, m] of Object.entries(rec.states)) if (m === 'ok' || m === 'fail') day.states[k.slice(0, 40)] = m as Mark;
      if (isObj(rec.triggers)) {
        for (const [k, list] of Object.entries(rec.triggers)) {
          if (!Array.isArray(list)) continue;
          const clean = list.map((t) => str(t, 40)).filter((t): t is string => Boolean(t));
          if (clean.length) day.triggers[k.slice(0, 40)] = [...new Set(clean)];
        }
      }
      if (rec.party === true) day.party = true;
      if (rec.wildcard === true) day.wildcard = true;
      const u = str(rec.updatedAt, 40);
      if (u) day.updatedAt = u;
      state.days[date] = day;
    }
  }
  if (isObj(raw.claims)) {
    for (const [k, c] of Object.entries(raw.claims)) {
      if (!/^(\d{1,3}|grand)$/.test(k) || !isObj(c)) continue;
      state.claims[k] = { claimedAt: str(c.claimedAt, 40) ?? '', price: Math.round(num(c.price, 0, 100000, 0)) };
    }
  }
  if (isObj(raw.chests)) {
    for (const [k, c] of Object.entries(raw.chests)) {
      if (!/^\d{1,3}[ab]?$/.test(k) || !isObj(c) || !OUTCOMES.includes(c.outcome as ChestOutcome)) continue;
      const chest: Chest = { outcome: c.outcome as ChestOutcome, openedAt: str(c.openedAt, 40) ?? '' };
      state.chests[k] = chest;
    }
  }
  return state;
}
