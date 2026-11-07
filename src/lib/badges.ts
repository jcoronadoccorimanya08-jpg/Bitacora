/**
 * Insignias cada 2 semanas: Bronce, Plata, Oro, Platino, Diamante y Leyenda.
 * Cada bloque de 2 semanas se gana si tu promedio limpio de esos 14 días llega a 80 %. Cada bloque ganado sube
 * un nivel; un bloque perdido no te quita nada. Funciones puras, con pruebas en tests/badges.test.ts.
 */
import { diffDays, minDate, rangeDates, type ISODate } from './dates';
import { cycleWeeks, dayPct, type Days } from './engine';
import type { Settings } from './types';

export const TIERS = ['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Leyenda'] as const;
export type Tier = (typeof TIERS)[number];
export const BADGE_PCT = 80;
const EPS = 1e-9;

export type BlockStatus = 'earned' | 'open' | 'missed' | 'future';

export interface BadgeBlock {
  index: number;
  weeks: [number, number];
  start: ISODate;
  end: ISODate;
  status: BlockStatus;
  /** Tu promedio limpio de los días que ya pasaron del bloque. */
  pct: number;
}

export function badgeBlocks(s: Settings, days: Days, today: ISODate): BadgeBlock[] {
  const weeks = cycleWeeks(s).filter((w) => diffDays(w.start, w.end) === 6);
  const out: BadgeBlock[] = [];
  for (let i = 0; i + 1 < weeks.length && out.length < TIERS.length; i += 2) {
    const a = weeks[i]!;
    const b = weeks[i + 1]!;
    const base = { index: out.length + 1, weeks: [a.index, b.index] as [number, number], start: a.start, end: b.end };
    if (today < a.start) {
      out.push({ ...base, status: 'future', pct: 0 });
      continue;
    }
    const played = rangeDates(a.start, minDate(today, b.end));
    const sum = played.reduce((acc, d) => acc + dayPct(days, d, s.habits), 0);
    const total = 14;
    // Lo máximo que todavía puedes sumar: completar hoy y los días que faltan.
    const todayPct = today <= b.end ? dayPct(days, today, s.habits) : 100;
    const potential = today <= b.end ? 100 - todayPct + diffDays(today, b.end) * 100 : 0;
    const status = sum / total >= BADGE_PCT - EPS ? 'earned' : (sum + potential) / total >= BADGE_PCT - EPS ? 'open' : 'missed';
    out.push({ ...base, status, pct: sum / played.length });
  }
  return out;
}

export function earnedTiers(blocks: BadgeBlock[]): Tier[] {
  return blocks.filter((b) => b.status === 'earned').map((_, i) => TIERS[i]!);
}
