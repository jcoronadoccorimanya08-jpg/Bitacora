import type { ChestOutcome, Habit, Milestone } from './types';

export const APP_NAME = 'Bitácora';
export const CYCLE_LENGTH = 90;
/** Cada cuántos días de racha hay un escalón. */
export const STEP = 7;
export const MAX_HABITS = 6;
export const MAX_TRIGGERS = 14;
export const AUTOLOCK_OPTIONS = [0, 1, 5] as const;
/** Minutos del temporizador de urgencia: el antojo pasa. */
export const URGE_MINUTES = 10;

export const DEFAULT_TRIGGERS = [
  'Noche con el celular',
  'Estrés',
  'Aburrimiento',
  'Cansancio',
  'Soledad',
  'Fiesta o reunión',
  'Amigos',
  'Ansiedad',
];

export type HabitTemplate = Omit<Habit, 'id'>;

export const NEW_HABIT: HabitTemplate = { name: '', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: '' };

/** Sugerencias genéricas. Lo personal se carga desde un archivo o texto propio, nunca desde el código. */
export const HABIT_SUGGESTIONS: HabitTemplate[] = [
  { name: 'Procrastinación', q: '¿Empecé mi tarea principal sin posponerla?', ok: 'Cumplí', fail: 'Postergué', phrase: 'Dos minutos. Solo empiezo.' },
  { name: 'Cigarro', q: '¿Día sin fumar?', ok: 'Limpio', fail: 'Caí', phrase: 'No fumo.', value: { kind: 'bs', amount: 10 } },
  { name: 'Alcohol', q: '¿Día sin alcohol?', ok: 'Limpio', fail: 'Caí', phrase: 'Ya lo decidí antes de llegar.', value: { kind: 'bs', amount: 20 } },
  { name: 'Comer con pantallas', q: '¿Comí sin series ni videos?', ok: 'Sin pantalla', fail: 'Con pantalla', phrase: 'La serie es premio, no acompañante.', value: { kind: 'horas', amount: 1 } },
  { name: 'Redes sociales', q: '¿Usé redes solo en mi horario?', ok: 'Cumplí', fail: 'Me pasé', phrase: 'Primero lo importante.', value: { kind: 'horas', amount: 1 } },
  { name: 'Comida chatarra', q: '¿Día sin comida chatarra?', ok: 'Limpio', fail: 'Caí', phrase: 'Como para rendir.' },
  { name: 'Azúcar', q: '¿Día sin azúcar añadida?', ok: 'Limpio', fail: 'Caí', phrase: 'El antojo pasa en diez minutos.' },
  { name: 'Videojuegos', q: '¿Jugué solo en mi horario?', ok: 'Cumplí', fail: 'Me pasé', phrase: 'Juego cuando terminé, no para no empezar.', value: { kind: 'horas', amount: 1 } },
];

/** Escalones con premio por defecto (se cambian en la app o con tu archivo de configuración). */
export const DEFAULT_MILESTONES: Milestone[] = [
  { day: 7, name: 'Tu comida favorita', price: 100 },
  { day: 14, name: 'Una salida rica', price: 120 },
  { day: 28, name: 'Un viaje corto', price: 200 },
  { day: 56, name: 'Algo grande para ti', price: 400 },
];

export const CHEST_LABEL: Record<ChestOutcome, string> = {
  bs20: '+20 Bs a tu ahorro',
  bs50: '+50 Bs a tu ahorro',
  wildcard: 'Un comodín',
  series: 'Una noche de series (sin comer frente a la pantalla)',
};
