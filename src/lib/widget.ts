/**
 * Puente con el widget de Android (app «Rachas»). Solo funciona cuando Bitácora se abre desde esa app:
 * Chrome le entrega a la página un canal (postMessage con un MessagePort) y por ahí le mandamos un resumen
 * de SOLO números, sin nombres de hábitos ni premios (el widget de Bitácora es discreto). Si no hay app nativa,
 * no pasa nada.
 */
import { useSyncExternalStore } from 'react';
import { badgeBlocks, earnedTiers } from './badges';
import { STEP } from './config';
import { addDays, maxDate, minDate, rangeDates, type ISODate } from './dates';
import { cycleEnd, cyclePhase, cycleWeeks, dayNumber, dayPct, habitRuns, isClean, lastPlayableDay, markOf, nextMilestone, savings, streakStats } from './engine';
import { steps } from './rewards';
import type { Accent, AppState } from './types';

export interface WidgetDay {
  d: ISODate;
  /** Porcentaje limpio del día (0–100). */
  p: number;
  /** Día limpio. */
  w: boolean;
}

/** Lo que muestra el widget en un día (solo números). */
export interface WidgetFrame {
  today: ISODate;
  dayNumber: number;
  cycleLength: number;
  /** Inicio del ciclo. */
  start: ISODate;
  streak: number;
  best: number;
  todayPct: number;
  todayWon: boolean;
  /** Ya marcaste todos tus hábitos hoy (o usaste un comodín). */
  todayDone: boolean;
  /** Últimos 14 días del ciclo (hasta hoy). */
  days: WidgetDay[];
  /** La semana del ciclo en la que estás: número, inicio, días y días limpios. */
  week: { n: number; start: ISODate; len: number; won: number } | null;
  /** Ahorro (Bs) y horas recuperadas, sin decir de qué. */
  savedBs: number;
  horas: number;
  /** Días de racha que faltan para el próximo escalón, y si es premio o cofre (sin el nombre). */
  nextStep: number | null;
  nextKind: 'premio' | 'cofre' | null;
  /** Cada cuántos días de racha hay un escalón. */
  step: number;
  /** Insignias ganadas en el ciclo (1 = Bronce … 6 = Leyenda). */
  badges: number;
  /**
   * Cada hábito, en el orden de la app y SIN nombre: días seguidos en «ok» (s), % de días limpios (p)
   * y cómo va hoy (t: 0 sin marcar, 1 ok, 2 caída). En el widget se reconoce por su color y su lugar.
   */
  habits: WidgetHabit[];
}

export interface WidgetHabit {
  s: number;
  p: number;
  t: 0 | 1 | 2;
}

export interface WidgetPayload extends WidgetFrame {
  v: 1;
  app: 'bitacora';
  /** Color elegido en Ajustes → Apariencia. */
  accent: Accent;
  /** Modo prueba: el widget lo muestra tal cual, marcado como prueba. */
  test?: true;
  /** Mañana y pasado mañana tal como se verían sin abrir la app: así el widget cambia de día solo. */
  ahead: WidgetFrame[];
}

export function buildWidgetFrame(state: AppState, today: ISODate): WidgetFrame {
  const s = state.settings;
  const phase = cyclePhase(s, today);
  const active = phase === 'active';
  const ref = lastPlayableDay(s, today);
  const st = streakStats(s, state.days, today);
  const days =
    phase === 'before'
      ? []
      : rangeDates(maxDate(s.startDate, addDays(ref, -13)), minDate(ref, cycleEnd(s))).map((d) => ({ d, p: Math.round(dayPct(state.days, d, s.habits)), w: isClean(state.days, d, s.habits) }));
  const weeks = cycleWeeks(s);
  const wk = phase === 'before' ? weeks[0] : weeks.find((w) => ref >= w.start && ref <= w.end);
  const sv = savings(s, state.days, today);
  const next = nextMilestone(st.run, s.cycleLength);
  const stepInfo = next ? steps(s, st.best).find((x) => x.day === next) : undefined;
  return {
    today,
    dayNumber: phase === 'before' ? 0 : Math.min(s.cycleLength, dayNumber(s.startDate, today)),
    cycleLength: s.cycleLength,
    start: s.startDate,
    streak: st.run,
    best: st.best,
    todayPct: active ? Math.round(dayPct(state.days, today, s.habits)) : 0,
    todayWon: active && isClean(state.days, today, s.habits),
    todayDone: active && (Boolean(state.days[today]?.wildcard) || s.habits.every((h) => markOf(state.days, today, h.id) !== undefined)),
    days,
    week: wk
      ? {
          n: wk.index,
          start: wk.start,
          len: rangeDates(wk.start, wk.end).length,
          won: today < wk.start ? 0 : rangeDates(wk.start, minDate(ref, wk.end)).filter((d) => isClean(state.days, d, s.habits)).length,
        }
      : null,
    savedBs: sv.bs,
    horas: sv.horas,
    nextStep: next === null ? null : next - st.run,
    nextKind: stepInfo ? (stepInfo.kind === 'prize' ? 'premio' : 'cofre') : null,
    step: STEP,
    badges: earnedTiers(badgeBlocks(s, state.days, today)).length,
    habits: habitRuns(s, state.days, today).map((r) => ({ s: r.run, p: r.pct, t: r.today === 'ok' ? 1 : r.today === 'fail' ? 2 : 0 })),
  };
}

/** Cuántos días adelantados se mandan (por si no abres la app): mañana y pasado mañana. */
export const AHEAD_DAYS = 2;

export function buildWidgetPayload(state: AppState, today: ISODate, opts: { test?: boolean } = {}): WidgetPayload {
  const payload: WidgetPayload = {
    v: 1,
    app: 'bitacora',
    ...buildWidgetFrame(state, today),
    accent: state.settings.accent ?? 'verde',
    // En modo prueba la fecha es simulada: el widget no la cambia solo.
    ahead: opts.test ? [] : Array.from({ length: AHEAD_DAYS }, (_, i) => buildWidgetFrame(state, addDays(today, i + 1))),
  };
  if (opts.test) payload.test = true;
  return payload;
}

// ---------- Canal con la app «Rachas» ----------

/** Paquete de la app nativa «Rachas». */
const APP_PACKAGE = 'io.github.jcoronadoccorimanya08.rachas';

/**
 * ¿El origen es el de Chrome hablando en nombre de la app «Rachas»? Chrome actual lo manda como
 * «android-app://<sitio>» (el origen solo guarda el sitio, sin el paquete); versiones anteriores, como
 * «android-app://<sitio>/<paquete>» o «android-app://<paquete>». Chrome solo abre este canal a una app que
 * assetlinks.json verifica para este sitio, y ahí solo está Rachas. Una página web no puede fingir este origen.
 */
export function isRachasOrigin(origin: string, self: string): boolean {
  if (origin === self) return true;
  if (!origin.startsWith('android-app://')) return false;
  const parts = origin.slice('android-app://'.length).split(/[/?#]/);
  let host = '';
  try {
    host = new URL(self).host;
  } catch {
    /* sin sitio propio */
  }
  return parts.includes(APP_PACKAGE) || (host !== '' && parts[0] === host);
}

/** El primer mensaje del canal: lo manda Chrome (sin ventana de origen), con un solo puerto y con el origen de Rachas. */
export function isRachasChannel(e: { origin: string; source: unknown; ports: readonly unknown[] | null }, self: string): boolean {
  return e.source === null && !!e.ports && e.ports.length === 1 && isRachasOrigin(e.origin, self);
}

/** off: no hay app nativa · connecting: llegó el canal · ready: la app respondió · saved: el widget guardó tu resumen. */
export type BridgeStatus = 'off' | 'connecting' | 'ready' | 'saved';

let port: MessagePort | null = null;
let last: string | null = null;
let started = false;
let status: BridgeStatus = 'off';
const listeners = new Set<() => void>();

function setStatus(next: BridgeStatus) {
  if (status === next) return;
  status = next;
  for (const f of listeners) f();
}

/** Estado del canal con el widget, para mostrarlo en Ajustes. */
export function useBridgeStatus(): BridgeStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => 'off',
  );
}

/** Escucha el canal de la app nativa. Se llama al cargar la página, antes de que Chrome entregue el puerto. */
export function initWidgetBridge(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('message', (e: MessageEvent) => {
    if (!isRachasChannel(e, window.location.origin)) return;
    port = e.ports[0]!;
    port.onmessage = (m: MessageEvent) => {
      const text = typeof m.data === 'string' ? m.data : '';
      if (text.startsWith('rachas:ok')) {
        setStatus('saved');
      } else if (text.startsWith('rachas:')) {
        // «hola»: la app ya escucha. Lo que se mandó antes pudo perderse, así que se manda otra vez.
        if (status !== 'saved') setStatus('ready');
        if (last) sendRaw(last);
      }
    };
    setStatus('connecting');
    if (last) sendRaw(last);
  });
}

/** Paquete con el que Chrome abre la app desde «Rachas» (document.referrer). */
const RACHAS_REFERRER = `android-app://${APP_PACKAGE}`;

export type WidgetHintKind = 'outside' | 'failed' | null;

/**
 * ¿Avisar que el widget no se actualiza? Solo en Android, abierta como app, si pasados unos segundos no llegó
 * el canal: «outside» si se abrió sin pasar por Rachas (por ejemplo, con el ícono que instaló Chrome),
 * «failed» si se abrió desde Rachas y aun así no conectó.
 */
export function widgetHint(o: { android: boolean; standalone: boolean; waited: boolean; status: BridgeStatus; referrer: string }): WidgetHintKind {
  if (!o.android || !o.standalone || !o.waited || o.status !== 'off') return null;
  return o.referrer.startsWith(RACHAS_REFERRER) ? 'failed' : 'outside';
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
