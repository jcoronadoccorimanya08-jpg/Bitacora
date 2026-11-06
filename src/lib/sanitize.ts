/** Validación de datos descifrados, respaldos y archivos de configuración. */
import { CYCLE_LENGTH, DEFAULT_TRIGGERS, MAX_HABITS, MAX_TRIGGERS, NEW_HABIT } from './config';
import { isValidISODate } from './dates';
import type { AppState, DayRecord, Habit, Mark, Reward, Settings, Theme } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.trim().slice(0, max) : null);

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
    out.push({
      id,
      name,
      q: str(item.q, 120) || NEW_HABIT.q,
      ok: str(item.ok, 24) || NEW_HABIT.ok,
      fail: str(item.fail ?? item.f, 24) || NEW_HABIT.fail,
      phrase: str(item.phrase ?? item.fr, 160) ?? '',
    });
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

function sanitizeSettings(v: unknown): Settings | null {
  if (!isObj(v) || !isValidISODate(v.startDate)) return null;
  const habits = sanitizeHabits(v.habits);
  if (!habits.length) return null;
  const theme: Theme = v.theme === 'dark' || v.theme === 'light' ? v.theme : 'system';
  const settings: Settings = {
    startDate: v.startDate,
    cycleLength: typeof v.cycleLength === 'number' && v.cycleLength >= 7 && v.cycleLength <= 365 ? Math.round(v.cycleLength) : CYCLE_LENGTH,
    habits,
    triggers: sanitizeTriggers(v.triggers),
    theme,
    autoLockMinutes: typeof v.autoLockMinutes === 'number' && v.autoLockMinutes >= 0 && v.autoLockMinutes <= 60 ? Math.round(v.autoLockMinutes) : 1,
    createdAt: str(v.createdAt, 40) ?? new Date().toISOString(),
  };
  const lb = str(v.lastBackupAt, 40);
  if (lb) settings.lastBackupAt = lb;
  return settings;
}

export function sanitizeState(raw: unknown): AppState | null {
  if (!isObj(raw) || raw.schema !== 1) return null;
  const settings = sanitizeSettings(raw.settings);
  if (!settings) return null;
  const state: AppState = { schema: 1, settings, days: {}, rewards: {} };
  if (isObj(raw.days)) {
    for (const [date, rec] of Object.entries(raw.days)) {
      if (!isValidISODate(date) || !isObj(rec)) continue;
      const day: DayRecord = { states: {}, triggers: {} };
      if (isObj(rec.states)) {
        for (const [k, m] of Object.entries(rec.states)) if (m === 'ok' || m === 'fail') day.states[k.slice(0, 40)] = m as Mark;
      }
      if (isObj(rec.triggers)) {
        for (const [k, list] of Object.entries(rec.triggers)) {
          if (!Array.isArray(list)) continue;
          const clean = list.map((t) => str(t, 40)).filter((t): t is string => Boolean(t));
          if (clean.length) day.triggers[k.slice(0, 40)] = [...new Set(clean)];
        }
      }
      const u = str(rec.updatedAt, 40);
      if (u) day.updatedAt = u;
      state.days[date] = day;
    }
  }
  if (isObj(raw.rewards)) {
    for (const [k, r] of Object.entries(raw.rewards)) {
      if (!/^\d{1,2}$/.test(k) || !isObj(r)) continue;
      const reward: Reward = { text: str(r.text, 80) ?? '' };
      const c = str(r.claimedAt, 40);
      if (c) reward.claimedAt = c;
      state.rewards[k] = reward;
    }
  }
  return state;
}
