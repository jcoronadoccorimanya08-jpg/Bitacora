/**
 * Puente con el widget de Android (app «Rachas»). Solo funciona cuando Bitácora se abre desde esa app:
 * la app nativa abre un canal (postMessage con un MessagePort) y aquí le mandamos un resumen de SOLO números,
 * sin nombres de hábitos ni premios (el widget de Bitácora es discreto). Si no hay app nativa, no pasa nada.
 */
import { addDays, maxDate, minDate, rangeDates, type ISODate } from './dates';
import { cycleEnd, cyclePhase, dayNumber, dayPct, isClean, lastPlayableDay, nextMilestone, savings, streakStats } from './engine';
import { steps } from './rewards';
import type { Accent, AppState } from './types';

export interface WidgetDay {
  d: ISODate;
  /** Porcentaje limpio del día (0–100). */
  p: number;
  /** Día limpio. */
  w: boolean;
}

export interface WidgetPayload {
  v: 1;
  app: 'bitacora';
  today: ISODate;
  dayNumber: number;
  cycleLength: number;
  streak: number;
  best: number;
  todayPct: number;
  todayWon: boolean;
  /** Últimos 14 días del ciclo (hasta hoy). */
  days: WidgetDay[];
  /** Ahorro (Bs) y horas recuperadas, sin decir de qué. */
  savedBs: number;
  horas: number;
  /** Días de racha que faltan para el próximo escalón, y si es premio o cofre (sin el nombre). */
  nextStep: number | null;
  nextKind: 'premio' | 'cofre' | null;
  /** Color elegido en Ajustes → Apariencia. */
  accent: Accent;
}

export function buildWidgetPayload(state: AppState, today: ISODate): WidgetPayload {
  const s = state.settings;
  const phase = cyclePhase(s, today);
  const ref = lastPlayableDay(s, today);
  const st = streakStats(s, state.days, today);
  const days =
    phase === 'before'
      ? []
      : rangeDates(maxDate(s.startDate, addDays(ref, -13)), minDate(ref, cycleEnd(s))).map((d) => ({ d, p: Math.round(dayPct(state.days, d, s.habits)), w: isClean(state.days, d, s.habits) }));
  return {
    v: 1,
    app: 'bitacora',
    today,
    dayNumber: phase === 'before' ? 0 : Math.min(s.cycleLength, dayNumber(s.startDate, today)),
    cycleLength: s.cycleLength,
    streak: st.run,
    best: st.best,
    todayPct: phase === 'active' ? Math.round(dayPct(state.days, today, s.habits)) : 0,
    todayWon: phase === 'active' && isClean(state.days, today, s.habits),
    days,
    ...nextAndSavings(state, today, st.run, st.best),
    accent: s.accent ?? 'verde',
  };
}

function nextAndSavings(state: AppState, today: ISODate, run: number, best: number) {
  const s = state.settings;
  const sv = savings(s, state.days, today);
  const next = nextMilestone(run, s.cycleLength);
  const step = next ? steps(s, best).find((x) => x.day === next) : undefined;
  return {
    savedBs: sv.bs,
    horas: sv.horas,
    nextStep: next === null ? null : next - run,
    nextKind: step ? (step.kind === 'prize' ? ('premio' as const) : ('cofre' as const)) : null,
  };
}

/** Paquete de la app nativa «Rachas» (por si Chrome identifica el canal con el origen de la app). */
const APP_ORIGIN = 'android-app://io.github.jcoronadoccorimanya08.rachas';

let port: MessagePort | null = null;
let last: string | null = null;

/** Escucha el canal de la app nativa. Solo acepta mensajes de nuestro propio origen (la app verificada lo usa). */
export function initWidgetBridge(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('message', (e: MessageEvent) => {
    const trusted = e.origin === window.location.origin || e.origin.startsWith(APP_ORIGIN);
    if (!trusted || !e.ports || e.ports.length !== 1) return;
    port = e.ports[0]!;
    if (last) sendRaw(last);
  });
}

function sendRaw(msg: string) {
  try {
    port?.postMessage(msg);
  } catch {
    port = null;
  }
}

export function sendWidget(payload: WidgetPayload): void {
  last = JSON.stringify(payload);
  sendRaw(last);
}
