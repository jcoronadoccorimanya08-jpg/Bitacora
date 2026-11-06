import type { Habit } from './types';

export const APP_NAME = 'Bitácora';
export const CYCLE_LENGTH = 90;
/** Cada cuántos días de racha hay un escalón con premio. */
export const STEP = 7;
export const MAX_HABITS = 6;
export const MAX_TRIGGERS = 14;
export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const AUTOLOCK_OPTIONS = [0, 1, 5] as const;

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

/** Sugerencias genéricas para configurar a mano. Lo personal se carga desde un archivo propio, nunca desde el código. */
export const HABIT_SUGGESTIONS: HabitTemplate[] = [
  { name: 'Procrastinación', q: '¿Empecé mi tarea principal sin posponerla?', ok: 'Cumplí', fail: 'Postergué', phrase: 'Dos minutos. Solo empiezo.' },
  { name: 'Cigarro', q: '¿Día sin fumar?', ok: 'Limpio', fail: 'Caí', phrase: 'No fumo.' },
  { name: 'Alcohol', q: '¿Día sin alcohol?', ok: 'Limpio', fail: 'Caí', phrase: 'Ya lo decidí antes de llegar.' },
  { name: 'Comer con pantallas', q: '¿Comí sin series ni videos?', ok: 'Sin pantalla', fail: 'Con pantalla', phrase: 'La serie es premio, no acompañante.' },
  { name: 'Redes sociales', q: '¿Usé redes solo en mi horario?', ok: 'Cumplí', fail: 'Me pasé', phrase: 'Primero lo importante.' },
  { name: 'Comida chatarra', q: '¿Día sin comida chatarra?', ok: 'Limpio', fail: 'Caí', phrase: 'Como para rendir.' },
  { name: 'Azúcar', q: '¿Día sin azúcar añadida?', ok: 'Limpio', fail: 'Caí', phrase: 'El antojo pasa en diez minutos.' },
  { name: 'Videojuegos', q: '¿Jugué solo en mi horario?', ok: 'Cumplí', fail: 'Me pasé', phrase: 'Juego cuando terminé, no para no empezar.' },
];
