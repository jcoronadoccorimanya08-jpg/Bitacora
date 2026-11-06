import type { ISODate } from './dates';

export type Mark = 'ok' | 'fail';

export interface Habit {
  /** Identificador estable: el historial se guarda con este id aunque cambie el nombre. */
  id: string;
  name: string;
  /** Pregunta del día, p. ej. "¿Día limpio?" */
  q: string;
  /** Texto del botón de cumplir, p. ej. "Limpio" */
  ok: string;
  /** Texto del botón de caída, p. ej. "Caí" */
  fail: string;
  /** Frase propia (intención de implementación). */
  phrase: string;
}

export type Theme = 'system' | 'dark' | 'light';

export interface Settings {
  startDate: ISODate;
  cycleLength: number;
  habits: Habit[];
  triggers: string[];
  theme: Theme;
  /** Minutos fuera de la app antes de pedir el PIN otra vez (0 = al salir). */
  autoLockMinutes: number;
  createdAt: string;
  lastBackupAt?: string;
}

export interface DayRecord {
  states: Record<string, Mark>;
  triggers: Record<string, string[]>;
  updatedAt?: string;
}

export interface Reward {
  text: string;
  claimedAt?: string;
}

export interface AppState {
  schema: 1;
  settings: Settings;
  days: Record<ISODate, DayRecord>;
  /** Premios por escalón ('1' = día 7, '2' = día 14, …). */
  rewards: Record<string, Reward>;
}
