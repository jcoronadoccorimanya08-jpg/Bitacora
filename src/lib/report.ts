import { formatNumeric, type ISODate } from './dates';
import {
  cleanDaysIn,
  cycleEnd,
  cyclePhase,
  dayNumber,
  fallsByWeekday,
  habitStats,
  lastDays,
  markOf,
  milestones,
  nextMilestone,
  streakStats,
  triggerCounts,
} from './engine';
import type { AppState } from './types';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Resumen en texto para pegarlo en Claude. Contiene datos sensibles: se comparte solo si el usuario quiere. */
export function buildReport(state: AppState, today: ISODate): string {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const phase = cyclePhase(s, today);
  const day = phase === 'before' ? 0 : Math.min(s.cycleLength, dayNumber(s.startDate, today));
  const week = lastDays(s, today, 7);
  const lines: string[] = [];

  lines.push(`REPORTE · Bitácora · día ${day}/${s.cycleLength} · ${today}`);
  const next = nextMilestone(st.run, s.cycleLength);
  lines.push(`Racha: ${st.run} días · mejor ${st.best}${next ? ` · próximo escalón: día ${next}` : ''}`);
  if (st.misses === 1) lines.push('Ayer no fue un día limpio: hoy decide si la racha sigue.');

  if (week.length) {
    lines.push(`Últimos ${week.length} días: ${cleanDaysIn(state.days, week, s.habits)} días limpios`);
    for (const h of habitStats(s, state.days, week)) lines.push(`- ${h.habit.name}: ${h.ok}/${week.length} ok · ${h.fail} caídas`);
    const trig = triggerCounts(state.days, week).slice(0, 4);
    lines.push(`Disparadores (7 días): ${trig.length ? trig.map(([t, n]) => `${t} (${n})`).join(', ') : 'ninguno'}`);
    const byDay = fallsByWeekday(s, state.days, week);
    if (byDay.some((n) => n > 0)) lines.push(`Caídas por día: ${byDay.map((n, i) => `${DIAS[i]} ${n}`).join(', ')}`);
    lines.push(
      `Detalle: ${week
        .map((d) => `${formatNumeric(d)} ${s.habits.map((h) => (markOf(state.days, d, h.id) === 'ok' ? '✓' : markOf(state.days, d, h.id) === 'fail' ? '✗' : '·')).join('')}`)
        .join(' | ')}`,
    );
  }

  const ms = milestones(s.cycleLength);
  const k = ms.findIndex((m) => m > st.best) + 1;
  if (k > 0) lines.push(`Próximo premio (día ${ms[k - 1]}): ${state.rewards[String(k)]?.text?.trim() || 'sin definir'}`);
  if (phase === 'finished') lines.push(`Ciclo terminado el ${cycleEnd(s)}.`);
  return lines.join('\n');
}
