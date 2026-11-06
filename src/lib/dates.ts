/**
 * Fechas de calendario como texto 'YYYY-MM-DD'.
 * "Hoy" se calcula siempre en la hora de La Paz, sin importar la zona horaria del teléfono.
 * La aritmética de días se hace en UTC puro, así que no la afectan zonas horarias ni cambios de hora.
 */
export const TIME_ZONE = 'America/La_Paz';

export type ISODate = string;

const DAY_MS = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayISO(now: Date = new Date()): ISODate {
  const parts = partsFormatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Fecha (en La Paz) de un instante guardado como ISO, p. ej. la hora de un respaldo. */
export function localDateOf(isoTimestamp: string): ISODate {
  const t = new Date(isoTimestamp);
  return Number.isNaN(t.getTime()) ? isoTimestamp.slice(0, 10) : todayISO(t);
}

/** "1 día", "3 días" */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  return fromUTCms(ms) === value;
}

export function toUTCms(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function fromUTCms(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTCms(toUTCms(date) + n * DAY_MS);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTCms(to) - toUTCms(from)) / DAY_MS);
}

/** 0 = domingo … 6 = sábado */
export function weekday(date: ISODate): number {
  return new Date(toUTCms(date)).getUTCDay();
}

/** El siguiente lunes estrictamente posterior a `date`. */
export function nextMonday(date: ISODate): ISODate {
  const offset = (8 - weekday(date)) % 7 || 7;
  return addDays(date, offset);
}

export function rangeDates(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function split(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

/** "viernes 6 de noviembre" */
export function formatLong(date: ISODate): string {
  const { m, d } = split(date);
  return `${DIAS[weekday(date)]} ${d} de ${MESES[m - 1]}`;
}

/** "6 nov" */
export function formatShort(date: ISODate): string {
  const { m, d } = split(date);
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/** "6/11" */
export function formatNumeric(date: ISODate): string {
  const { m, d } = split(date);
  return `${d}/${m}`;
}

export function weekdayShort(date: ISODate): string {
  return DIAS_CORTOS[weekday(date)] ?? '';
}

export function weekdayInitial(date: ISODate): string {
  return (DIAS[weekday(date)] ?? '').charAt(0).toUpperCase();
}

/** "6–12 nov" o "28 nov – 4 dic" */
export function formatRange(from: ISODate, to: ISODate): string {
  const a = split(from);
  const b = split(to);
  if (a.m === b.m) return `${a.d}–${b.d} ${MESES_CORTOS[b.m - 1]}`;
  return `${formatShort(from)} – ${formatShort(to)}`;
}
