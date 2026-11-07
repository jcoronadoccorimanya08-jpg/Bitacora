/** Historial de ciclos: al empezar un ciclo nuevo se guarda un resumen del que termina. Funciones puras. */
import { badgeBlocks, earnedTiers } from './badges';
import { minDate, type ISODate } from './dates';
import { cleanDaysIn, countedDays, cycleEnd, lastPlayableDay, savings, streakStats } from './engine';
import type { AppState, CycleSummary } from './types';

/** Resumen del ciclo actual hasta hoy (o null si todavía no empezó). */
export function summarizeCycle(state: AppState, today: ISODate): CycleSummary | null {
  const s = state.settings;
  if (today < s.startDate) return null;
  const counted = countedDays(s, state.days, today);
  const sv = savings(s, state.days, today);
  return {
    start: s.startDate,
    end: minDate(lastPlayableDay(s, today), cycleEnd(s)),
    days: counted.length,
    cleanDays: cleanDaysIn(state.days, counted, s.habits),
    bestStreak: streakStats(s, state.days, today).best,
    savedBs: sv.bs,
    horas: sv.horas,
    badges: earnedTiers(badgeBlocks(s, state.days, today)).length,
    prizes: Object.keys(state.claims).length,
    urges: state.urges,
    archivedAt: new Date().toISOString(),
  };
}
