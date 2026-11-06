import { todayISO } from './dates';
import { deriveKey, fromB64, isSealed, unseal, type Sealed } from './crypto';
import { sanitizeHabits, sanitizeState, sanitizeTriggers } from './sanitize';
import type { AppState, Habit } from './types';

const APP_ID = 'bitacora';

interface BackupFile {
  app: typeof APP_ID;
  kind: 'backup';
  schema: 1;
  exportedAt: string;
  sealed: Sealed;
}

export function backupFileName(): string {
  return `bitacora-${todayISO()}.json`;
}

export function serializeBackup(sealed: Sealed): string {
  const file: BackupFile = { app: APP_ID, kind: 'backup', schema: 1, exportedAt: new Date().toISOString(), sealed };
  return JSON.stringify(file);
}

export type ParsedFile = { kind: 'backup'; sealed: Sealed } | { kind: 'config'; habits: Habit[]; triggers: string[] };

/** Reconoce un respaldo cifrado o un archivo de configuración. Lanza un Error claro si no sirve. */
export function parseFile(text: string): ParsedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es válido.');
  }
  const o = raw as Record<string, unknown> | null;
  if (!o || o.app !== APP_ID) throw new Error('Este archivo no es de Bitácora.');
  if (o.kind === 'backup') {
    if (!isSealed(o.sealed)) throw new Error('El respaldo está dañado.');
    return { kind: 'backup', sealed: o.sealed };
  }
  if (o.kind === 'config') {
    const habits = sanitizeHabits(o.habits);
    if (!habits.length) throw new Error('La configuración no tiene hábitos.');
    return { kind: 'config', habits, triggers: sanitizeTriggers(o.triggers) };
  }
  throw new Error('Tipo de archivo desconocido.');
}

/** Abre un respaldo con su PIN. Lanza 'PIN' si el PIN no es el correcto. */
export async function openBackup(sealed: Sealed, pin: string): Promise<AppState> {
  const key = await deriveKey(pin, fromB64(sealed.salt), sealed.iter);
  let raw: unknown;
  try {
    raw = await unseal(key, sealed);
  } catch {
    throw new Error('PIN');
  }
  const state = sanitizeState(raw);
  if (!state) throw new Error('El respaldo está incompleto.');
  return state;
}

export function canShareFiles(): boolean {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareText(json: string): Promise<'shared' | 'cancelled'> {
  const file = new File([json], backupFileName(), { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'Respaldo' });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

export function downloadText(json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
