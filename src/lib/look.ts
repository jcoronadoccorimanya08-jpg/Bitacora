/**
 * Apariencia: tema (automático, oscuro, negro puro o claro), color y tamaño de letra.
 * Se guarda también sin cifrar (solo estas preferencias) para que la pantalla de bloqueo se vea igual.
 */
import type { Accent, TextSize, Theme } from './types';

export const THEME_KEY = 'bitacora.theme';
const LOOK_KEY = 'bitacora.look';

export const THEMES: [Theme, string][] = [
  ['system', 'Auto'],
  ['dark', 'Oscuro'],
  ['black', 'Negro'],
  ['light', 'Claro'],
];

export const ACCENTS: [Accent, string][] = [
  ['verde', 'Verde'],
  ['violeta', 'Violeta'],
  ['lima', 'Lima'],
  ['rosa', 'Rosa'],
];

export interface Look {
  theme: Theme;
  accent: Accent;
  size: TextSize;
}

export const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'dark' || v === 'light' || v === 'black';
export const isAccent = (v: unknown): v is Accent => v === 'verde' || v === 'violeta' || v === 'lima' || v === 'rosa';
export const isTextSize = (v: unknown): v is TextSize => v === 'normal' || v === 'grande';

export function readLook(): Look {
  try {
    const t = localStorage.getItem(THEME_KEY);
    const l = JSON.parse(localStorage.getItem(LOOK_KEY) ?? '{}') as Record<string, unknown>;
    return { theme: isTheme(t) ? t : 'system', accent: isAccent(l.accent) ? l.accent : 'verde', size: isTextSize(l.size) ? l.size : 'normal' };
  } catch {
    return { theme: 'system', accent: 'verde', size: 'normal' };
  }
}

export function applyLook(look: Look, prefersDark: boolean): void {
  const root = document.documentElement;
  if (look.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = look.theme;
  if (look.accent === 'verde') delete root.dataset.accent;
  else root.dataset.accent = look.accent;
  if (look.size === 'normal') delete root.dataset.size;
  else root.dataset.size = look.size;
  const dark = look.theme === 'dark' || look.theme === 'black' || (look.theme === 'system' && prefersDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', look.theme === 'black' ? '#000000' : dark ? '#0D1412' : '#EEF3F1');
  try {
    localStorage.setItem(THEME_KEY, look.theme);
    localStorage.setItem(LOOK_KEY, JSON.stringify({ accent: look.accent, size: look.size }));
  } catch {
    /* sin preferencias guardadas */
  }
}
