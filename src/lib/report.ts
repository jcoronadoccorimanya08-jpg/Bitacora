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
  nextMilestone,
  savings,
  streakStats,
  triggerCounts,
} from './engine';
import { grandStatus, nextPrize, steps, wallet, withClaims } from './rewards';
import type { AppState } from './types';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** «Bs 120 · 4 h · 6 días de mente clara» (solo lo que tenga valor). */
export function savingsLine(state: AppState, today: ISODate): string {
  const sv = savings(state.settings, state.days, today);
  const parts = [`Bs ${sv.bs}`];
  if (sv.horas > 0 || state.settings.habits.some((h) => h.value?.kind === 'horas')) parts.push(`${formatHours(sv.horas)} recuperadas`);
  for (const d of sv.dias) parts.push(`${d.days} ${d.days === 1 ? 'día' : 'días'} de ${d.label.toLowerCase()}`);
  return parts.join(' · ');
}

export function formatHours(h: number): string {
  return `${String(h).replace('.', ',')}\u00a0h`;
}

/** Resumen en texto para pegarlo en Claude. Contiene datos sensibles: se comparte solo si el usuario quiere. */
/** `victories`: semanas victoriosas con Val Q (las calcula la pantalla con lo que hay en el teléfono). */
export function buildReport(state: AppState, today: ISODate, victories = 0): string {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const phase = cyclePhase(s, today);
  const day = phase === 'before' ? 0 : Math.min(s.cycleLength, dayNumber(s.startDate, today));
  const week = lastDays(s, today, 7);
  const list = withClaims(steps(s, st.best), state);
  const prize = nextPrize(list);
  const sv = savings(s, state.days, today);
  const w = wallet(s, state, today);
  const lines: string[] = [];

  lines.push(`REPORTE · Bitácora · día ${day}/${s.cycleLength} · ${today}`);
  const next = nextMilestone(st.run, s.cycleLength);
  lines.push(`Racha: ${st.run} días · mejor ${st.best}${next ? ` · próximo escalón: día ${next}` : ''}`);
  if (st.misses === 1) lines.push('Ayer no fue un día limpio: hoy decide si la racha sigue.');
  if (s.habits.some((h) => h.value) || s.partyBonus > 0)
    lines.push(`Ahorro: ${savingsLine(state, today)}${sv.parties ? ` · ${sv.parties} ${sv.parties === 1 ? 'fiesta rechazada' : 'fiestas rechazadas'}` : ''} · disponible Bs ${w.balance}`);
  if (state.urges) lines.push(`Antojos superados con el botón de urgencia: ${state.urges}`);

  if (week.length) {
    lines.push(`Últimos ${week.length} días: ${cleanDaysIn(state.days, week, s.habits)} días limpios`);
    for (const h of habitStats(s, state.days, week)) lines.push(`- ${h.habit.name}: ${h.ok}/${week.length} ok · ${h.fail} caídas`);
    const trig = triggerCounts(state.days, week).slice(0, 4);
    lines.push(`Disparadores (7 días): ${trig.length ? trig.map(([t, n]) => `${t} (${n})`).join(', ') : 'ninguno'}`);
    const byDay = fallsByWeekday(s, state.days, week);
    if (byDay.some((n) => n > 0)) lines.push(`Caídas por día: ${byDay.map((n, i) => `${DIAS[i]} ${n}`).join(', ')}`);
    lines.push(
      `Detalle: ${week
        .map((d) => `${formatNumeric(d)} ${state.days[d]?.wildcard ? '★' : s.habits.map((h) => (markOf(state.days, d, h.id) === 'ok' ? '✓' : markOf(state.days, d, h.id) === 'fail' ? '✗' : '·')).join('')}`)
        .join(' | ')}`,
    );
  }

  if (prize) lines.push(`Próximo premio (día ${prize.day}): ${prize.prize.name} · Bs ${prize.prize.price}`);
  const g = grandStatus(s, state, today, victories);
  if (s.grand && g.kind !== 'none') {
    const status = g.kind === 'claimed' ? 'reclamado' : g.kind === 'available' ? 'disponible' : g.daysLeft > 0 ? `faltan ${g.daysLeft} días` : 'bloqueado';
    const weeks = g.kind === 'available' || g.kind === 'locked' ? (g.required ? ` · ${g.victories} de ${g.required} semanas victoriosas` : '') : '';
    lines.push(`Gran premio: ${s.grand.name}${s.grand.price ? ` (Bs ${s.grand.price})` : ''} · ${status}${weeks}`);
  }
  if (phase === 'finished') lines.push(`Ciclo terminado el ${cycleEnd(s)}.`);
  return lines.join('\n');
}
