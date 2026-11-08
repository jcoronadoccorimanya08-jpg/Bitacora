/**
 * Semana victoriosa: Bitácora y Val Q viven en el mismo sitio y se pasan SOLO el porcentaje de cada semana
 * (números por fecha de inicio de la semana; nunca nombres de hábitos ni nada más). Si el promedio de las dos
 * llega a 80 %, la semana es victoriosa. Funciones puras, salvo leer y escribir ese registro.
 */
import { isValidISODate, type ISODate } from './dates';
import { cycleWeeks, weeklyPcts, type Days } from './engine';
import type { Settings } from './types';

export const VICTORY_PCT = 80;
const EPS = 1e-9;
export const SELF_KEY = 'bitacora.semanas';
export const OTHER_KEY = 'val-quirurgico.semanas';
export const OTHER_NAME = 'Val Q';

let testing = false;

/** En modo prueba las semanas se guardan aparte («.prueba»), para no mezclarlas con las reales. */
export function setTeamTest(on: boolean): void {
  testing = on;
}

function keyFor(key: string): string {
  return testing ? `${key}.prueba` : key;
}

export interface WeekShare {
  v: 1;
  /** Inicio del ciclo de la app que publica. */
  start: ISODate;
  /** Porcentaje (0–100) de cada semana que ya empezó, por fecha de inicio. */
  weeks: Record<ISODate, number>;
  /** El gran premio compartido ya se reclamó. */
  grandClaimed?: boolean;
  at: string;
}

export function parseShare(raw: string | null): WeekShare | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || o.v !== 1 || !isValidISODate(o.start) || typeof o.weeks !== 'object' || o.weeks === null) return null;
    const weeks: Record<ISODate, number> = {};
    for (const [k, v] of Object.entries(o.weeks as Record<string, unknown>)) {
      if (isValidISODate(k) && typeof v === 'number' && Number.isFinite(v)) weeks[k] = Math.max(0, Math.min(100, v));
    }
    const share: WeekShare = { v: 1, start: o.start, weeks, at: typeof o.at === 'string' ? o.at.slice(0, 40) : '' };
    if (o.grandClaimed === true) share.grandClaimed = true;
    return share;
  } catch {
    return null;
  }
}

/** Lo que publicó la otra app (o null si todavía no la abriste en este teléfono). */
export function readShare(key = OTHER_KEY): WeekShare | null {
  try {
    return parseShare(localStorage.getItem(keyFor(key)));
  } catch {
    return null;
  }
}

/** Publica tus porcentajes semanales. Solo escribe si algo cambió. */
export function writeShare(share: Omit<WeekShare, 'v' | 'at'>): void {
  try {
    const prev = parseShare(localStorage.getItem(keyFor(SELF_KEY)));
    const same =
      prev &&
      prev.start === share.start &&
      Boolean(prev.grandClaimed) === Boolean(share.grandClaimed) &&
      JSON.stringify(prev.weeks) === JSON.stringify(share.weeks);
    if (same) return;
    const rec: WeekShare = { v: 1, ...share, at: new Date().toISOString() };
    if (!rec.grandClaimed) delete rec.grandClaimed;
    localStorage.setItem(keyFor(SELF_KEY), JSON.stringify(rec));
  } catch {
    /* sin almacenamiento: la semana victoriosa se calcula cuando vuelva a haber */
  }
}

export interface WeekRange {
  index: number;
  start: ISODate;
  end: ISODate;
}

export interface TeamWeek extends WeekRange {
  own: number | null;
  other: number | null;
  /** Promedio de las dos apps (null si falta alguna). */
  avg: number | null;
  /** La semana ya se puede cerrar (hoy es su último día o ya pasó). */
  done: boolean;
  victory: boolean;
}

export function teamWeeks(weeks: WeekRange[], own: Record<ISODate, number>, other: Record<ISODate, number> | null, today: ISODate): TeamWeek[] {
  return weeks.map((w) => {
    const a = today >= w.start ? (own[w.start] ?? null) : null;
    const b = today >= w.start && other ? (other[w.start] ?? null) : null;
    const avg = a !== null && b !== null ? (a + b) / 2 : null;
    const done = today >= w.end;
    return { ...w, own: a, other: b, avg, done, victory: done && avg !== null && avg >= VICTORY_PCT - EPS };
  });
}

export function victoryCount(list: TeamWeek[]): number {
  return list.filter((w) => w.victory).length;
}

/** Si la otra app tiene otro inicio de ciclo, las semanas no coinciden. */
export function sameStart(own: ISODate, other: WeekShare | null): boolean {
  return !other || other.start === own;
}

/** Tus semanas junto a las de la otra app, leídas de este teléfono. */
export function teamFor(s: Settings, days: Days, today: ISODate) {
  const other = readShare();
  const aligned = sameStart(s.startDate, other);
  const list = teamWeeks(cycleWeeks(s), weeklyPcts(s, days, today), other && aligned ? other.weeks : null, today);
  return { other, aligned, list, victories: victoryCount(list) };
}

export type Team = ReturnType<typeof teamFor>;
