import type { ISODate } from './dates';

export type Mark = 'ok' | 'fail';

/** Lo que ganas por cada día limpio de un hábito: plata (Bs), tiempo (horas) o días (por ejemplo, «mente clara»). */
export interface HabitValue {
  kind: 'bs' | 'horas' | 'dias';
  amount: number;
  /** Etiqueta para los días, por ejemplo «Mente clara». */
  label?: string;
}

export interface Habit {
  /** Identificador estable: el historial se guarda con este id aunque cambie el nombre. */
  id: string;
  name: string;
  q: string;
  ok: string;
  fail: string;
  phrase: string;
  value?: HabitValue;
}

/** Premio de un escalón de la racha (día 7, 14, …). */
export interface Milestone {
  day: number;
  name: string;
  price: number;
}

/** Tu gran premio, el que ves todos los días arriba. */
export interface GrandPrize {
  name: string;
  price?: number;
  date?: ISODate;
  /** Semanas victoriosas (con Val Q) necesarias para reclamarlo; sin este campo, no hay condición. */
  weeks?: number;
}

export type Theme = 'system' | 'dark' | 'light';

export interface Settings {
  startDate: ISODate;
  cycleLength: number;
  habits: Habit[];
  triggers: string[];
  milestones: Milestone[];
  grand: GrandPrize | null;
  /** Bs que sumas cuando tocas «Dije no a una fiesta» (0 = botón oculto). */
  partyBonus: number;
  theme: Theme;
  autoLockMinutes: number;
  createdAt: string;
  lastBackupAt?: string;
}

/** Ánimo del día: 1 = muy mal … 5 = muy bien. */
export type Mood = 1 | 2 | 3 | 4 | 5;

export interface DayRecord {
  states: Record<string, Mark>;
  triggers: Record<string, string[]>;
  /** Dijiste no a una fiesta ese día. */
  party?: boolean;
  /** Día salvado con un comodín: cuenta como limpio para la racha. */
  wildcard?: boolean;
  mood?: Mood;
  updatedAt?: string;
}

export type ChestOutcome = 'bs20' | 'bs50' | 'wildcard' | 'series';

export interface Chest {
  outcome: ChestOutcome;
  openedAt: string;
}

export interface AppState {
  schema: 2;
  settings: Settings;
  days: Record<ISODate, DayRecord>;
  /** Premios reclamados, por día del escalón ('7', '14', …). */
  claims: Record<string, { claimedAt: string; price: number }>;
  /** Cofres abiertos, por clave ('35', '84a', '84b', …). */
  chests: Record<string, Chest>;
  /** Antojos superados con el botón de urgencia. */
  urges: number;
}
