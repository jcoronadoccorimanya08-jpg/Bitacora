/** Escalones de la racha: premios con precio pagados con tu ahorro, cofres y comodines. */
import { STEP } from './config';
import { diffDays, type ISODate } from './dates';
import { cycleEnd, milestones, savings } from './engine';
import type { AppState, ChestOutcome, Milestone, Settings } from './types';

export const CHEST_BONUS: Record<ChestOutcome, number> = { bs20: 20, bs50: 50, wildcard: 0, series: 0 };

export function chestFromRoll(roll: number): ChestOutcome {
  if (roll < 0.35) return 'bs20';
  if (roll < 0.55) return 'bs50';
  if (roll < 0.8) return 'wildcard';
  return 'series';
}

export type Step =
  | { day: number; kind: 'prize'; prize: Milestone; earned: boolean; claimed: boolean }
  | { day: number; kind: 'chest'; keys: string[]; earned: boolean };

/** Cada escalón (7, 14, … 84): si tiene premio en tu lista, es premio; si no, es cofre (el último, cofre doble). */
export function steps(s: Settings, best: number): Step[] {
  const ms = milestones(s.cycleLength);
  return ms.map((day, i) => {
    const prize = s.milestones.find((m) => m.day === day);
    const earned = best >= day;
    if (prize) return { day, kind: 'prize', prize, earned, claimed: false };
    const last = i === ms.length - 1;
    return { day, kind: 'chest', keys: last ? [`${day}a`, `${day}b`] : [String(day)], earned };
  });
}

export function withClaims(list: Step[], state: Pick<AppState, 'claims'>): Step[] {
  return list.map((st) => (st.kind === 'prize' ? { ...st, claimed: Boolean(state.claims[String(st.day)]) } : st));
}

export function pendingChests(list: Step[], state: Pick<AppState, 'chests'>): string[] {
  return list.flatMap((st) => (st.kind === 'chest' && st.earned ? st.keys.filter((k) => !state.chests[k]) : []));
}

export function chestBonus(state: Pick<AppState, 'chests'>): number {
  return Object.values(state.chests).reduce((sum, c) => sum + CHEST_BONUS[c.outcome], 0);
}

export function spent(state: Pick<AppState, 'claims'>): number {
  return Object.values(state.claims).reduce((sum, c) => sum + c.price, 0);
}

export function wildcards(state: Pick<AppState, 'chests' | 'days'>) {
  const earned = Object.values(state.chests).filter((c) => c.outcome === 'wildcard').length;
  const used = Object.values(state.days).filter((d) => d.wildcard).length;
  return { earned, used, available: Math.max(0, earned - used) };
}

/** Siguiente escalón con premio que todavía no alcanzas. */
export function nextPrize(list: Step[]): Extract<Step, { kind: 'prize' }> | null {
  return (list.find((st) => st.kind === 'prize' && !st.earned) as Extract<Step, { kind: 'prize' }> | undefined) ?? null;
}

/** Lo que tienes para tus premios: tu ahorro + bonos de cofres − premios reclamados. */
export interface Wallet {
  saved: number;
  bonus: number;
  spent: number;
  balance: number;
}

export function wallet(s: Settings, state: Pick<AppState, 'days' | 'claims' | 'chests'>, today: ISODate): Wallet {
  const saved = savings(s, state.days, today).bs;
  const bonus = chestBonus(state);
  const used = spent(state);
  return { saved, bonus, spent: used, balance: saved + bonus - used };
}

export type GrandStatus =
  | { kind: 'none' }
  | { kind: 'claimed'; claimedAt: string }
  | { kind: 'available'; target: ISODate }
  | { kind: 'locked'; target: ISODate; daysLeft: number };

/** El gran premio se reclama desde su fecha; si no tiene, desde el último día del ciclo (día 90). */
export function grandStatus(s: Settings, state: Pick<AppState, 'claims'>, today: ISODate): GrandStatus {
  if (!s.grand) return { kind: 'none' };
  const c = state.claims.grand;
  if (c) return { kind: 'claimed', claimedAt: c.claimedAt };
  const target = s.grand.date ?? cycleEnd(s);
  if (today >= target) return { kind: 'available', target };
  return { kind: 'locked', target, daysLeft: diffDays(today, target) };
}

/** Escalones con premio ganados y sin reclamar. */
export function claimable(list: Step[]): Extract<Step, { kind: 'prize' }>[] {
  return list.filter((st): st is Extract<Step, { kind: 'prize' }> => st.kind === 'prize' && st.earned && !st.claimed);
}

export { STEP };
