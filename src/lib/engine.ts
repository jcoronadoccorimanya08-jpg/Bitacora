/**
 * Reglas de la racha. Solo funciones puras; las pruebas están en tests/engine.test.ts.
 *
 * - Un día es LIMPIO cuando todos los hábitos están en "ok".
 * - Una caída suelta (un día no limpio) NO rompe la racha: solo no suma.
 * - Dos días seguidos sin día limpio reinician la racha a 0.
 * - Hoy, mientras no esté completo y no tenga caídas, todavía no cuenta.
 * - Un día pasado sin marcar cuenta como no limpio.
 * - Escalón cada 7 días de racha (7, 14, 21… hasta el final del ciclo), cada uno con su premio.
 */
import { STEP } from './config';
import { addDays, diffDays, maxDate, minDate, rangeDates, weekday, type ISODate } from './dates';
import type { DayRecord, Habit, Mark, Settings } from './types';

export type Days = Record<ISODate, DayRecord>;
type Cycle = Pick<Settings, 'startDate' | 'cycleLength'>;

export type CyclePhase = 'before' | 'active' | 'finished';
export type DayState = 'clean' | 'fail' | 'partial' | 'empty' | 'future' | 'outside';

export function cycleEnd(s: Cycle): ISODate {
  return addDays(s.startDate, s.cycleLength - 1);
}

export function dayNumber(start: ISODate, date: ISODate): number {
  return diffDays(start, date) + 1;
}

export function cyclePhase(s: Cycle, today: ISODate): CyclePhase {
  if (today < s.startDate) return 'before';
  if (today > cycleEnd(s)) return 'finished';
  return 'active';
}

export function lastPlayableDay(s: Cycle, today: ISODate): ISODate {
  return minDate(today, cycleEnd(s));
}

export function isEditable(s: Cycle, date: ISODate, today: ISODate): boolean {
  return date >= s.startDate && date <= lastPlayableDay(s, today);
}

export function markOf(days: Days, date: ISODate, habitId: string): Mark | undefined {
  return days[date]?.states?.[habitId];
}

export function okCount(days: Days, date: ISODate, habits: Habit[]): number {
  return habits.filter((h) => markOf(days, date, h.id) === 'ok').length;
}

export function hasFail(days: Days, date: ISODate, habits: Habit[]): boolean {
  return habits.some((h) => markOf(days, date, h.id) === 'fail');
}

export function isClean(days: Days, date: ISODate, habits: Habit[]): boolean {
  return habits.length > 0 && okCount(days, date, habits) === habits.length;
}

export function dayState(s: Cycle, days: Days, habits: Habit[], date: ISODate, today: ISODate): DayState {
  if (date < s.startDate || date > cycleEnd(s)) return 'outside';
  if (date > today) return 'future';
  if (isClean(days, date, habits)) return 'clean';
  if (hasFail(days, date, habits)) return 'fail';
  return okCount(days, date, habits) > 0 ? 'partial' : 'empty';
}

export interface StreakStats {
  /** Racha actual (días limpios que cuentan). */
  run: number;
  best: number;
  /** Días seguidos sin día limpio al final (0, o 1 = "hoy no se negocia"). */
  misses: number;
}

export function streakStats(s: Settings, days: Days, today: ISODate): StreakStats {
  const ref = lastPlayableDay(s, today);
  let run = 0;
  let best = 0;
  let misses = 0;
  if (ref < s.startDate) return { run, best, misses };
  const H = s.habits.length;
  for (const d of rangeDates(s.startDate, ref)) {
    const n = okCount(days, d, s.habits);
    if (d === today && n < H && !hasFail(days, d, s.habits)) continue; // hoy todavía se puede completar
    if (H > 0 && n === H) {
      run++;
      misses = 0;
    } else {
      misses++;
      if (misses >= 2) run = 0;
    }
    if (run > best) best = run;
  }
  return { run, best, misses };
}

/** Escalones del ciclo: 7, 14, … hasta cycleLength. */
export function milestones(cycleLength: number): number[] {
  const out: number[] = [];
  for (let m = STEP; m <= cycleLength; m += STEP) out.push(m);
  return out;
}

export function nextMilestone(run: number, cycleLength: number): number | null {
  return milestones(cycleLength).find((m) => m > run) ?? null;
}

/** Un premio k (día 7·k) se gana cuando la mejor racha llega a 7·k. */
export function isEarned(k: number, best: number): boolean {
  return best >= STEP * k;
}

/** Filas de premios visibles: al menos 4, y siempre dos más que lo alcanzado. */
export function rewardRows(best: number, cycleLength: number): number {
  return Math.min(milestones(cycleLength).length, Math.max(4, Math.floor(best / STEP) + 2));
}

/** Días que cuentan para porcentajes: los pasados, y hoy solo si ya tiene algo marcado. */
export function countedDays(s: Settings, days: Days, today: ISODate): ISODate[] {
  const ref = lastPlayableDay(s, today);
  if (ref < s.startDate) return [];
  const list = rangeDates(s.startDate, ref);
  if (ref === today && !s.habits.some((h) => markOf(days, today, h.id))) list.pop();
  return list;
}

export interface HabitStat {
  habit: Habit;
  ok: number;
  fail: number;
  counted: number;
  pct: number;
}

export function habitStats(s: Settings, days: Days, dates: ISODate[]): HabitStat[] {
  return s.habits.map((habit) => {
    const ok = dates.filter((d) => markOf(days, d, habit.id) === 'ok').length;
    const fail = dates.filter((d) => markOf(days, d, habit.id) === 'fail').length;
    return { habit, ok, fail, counted: dates.length, pct: dates.length ? Math.round((ok / dates.length) * 100) : 0 };
  });
}

/** Disparadores ordenados por frecuencia en un rango de fechas. */
export function triggerCounts(days: Days, dates: ISODate[]): [string, number][] {
  const count: Record<string, number> = {};
  for (const d of dates) {
    const t = days[d]?.triggers ?? {};
    for (const list of Object.values(t)) for (const x of list) count[x] = (count[x] ?? 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Caídas por día de la semana, de lunes a domingo. */
export function fallsByWeekday(s: Settings, days: Days, dates: ISODate[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dates) {
    const n = s.habits.filter((h) => markOf(days, d, h.id) === 'fail').length;
    const idx = (weekday(d) + 6) % 7; // lunes = 0
    out[idx] = (out[idx] ?? 0) + n;
  }
  return out;
}

export function lastDays(s: Cycle, today: ISODate, n: number): ISODate[] {
  const ref = lastPlayableDay(s, today);
  if (ref < s.startDate) return [];
  return rangeDates(maxDate(s.startDate, addDays(ref, -(n - 1))), ref);
}

export function cleanDaysIn(days: Days, dates: ISODate[], habits: Habit[]): number {
  return dates.filter((d) => isClean(days, d, habits)).length;
}
