/**
 * Respaldo cifrado como texto (.txt): Chrome en Android no comparte .json, pero sí .txt (Drive, WhatsApp, Archivos).
 * También lee el archivo o texto de configuración (hábitos, disparadores y premios).
 */
import { todayISO } from './dates';
import { isWrapped } from './crypto';
import { sanitizeGrand, sanitizeHabits, sanitizeMilestones, sanitizeTriggers } from './sanitize';
import type { GrandPrize, Habit, Milestone } from './types';
import type { VaultRecord } from './vault';

const APP_ID = 'bitacora';
type BackupRecord = Pick<VaultRecord, 'v' | 'lock' | 'data'>;

export function backupFileName(): string {
  return `bitacora-${todayISO()}.txt`;
}

export function serializeBackup(record: BackupRecord): string {
  return JSON.stringify({ app: APP_ID, kind: 'backup', schema: 2, exportedAt: new Date().toISOString(), vault: record });
}

export interface ConfigData {
  habits: Habit[];
  triggers: string[];
  milestones: Milestone[];
  grand: GrandPrize | null;
  partyBonus: number;
}

export type ParsedFile = { kind: 'backup'; record: BackupRecord } | ({ kind: 'config' } & ConfigData);

/** Reconoce un respaldo cifrado o una configuración. Lanza un Error claro si no sirve. */
export function parseFile(text: string): ParsedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    throw new Error('El texto no es válido.');
  }
  const o = raw as Record<string, unknown> | null;
  if (!o || o.app !== APP_ID) throw new Error('Este archivo no es de Bitácora.');
  if (o.kind === 'backup') {
    const v = o.vault as Partial<VaultRecord> | undefined;
    if (!v || v.v !== 2 || !isWrapped(v.data) || !v.lock?.pattern || !isWrapped(v.lock.pattern.wrapped)) {
      throw new Error('Este respaldo es de una versión anterior o está dañado.');
    }
    return { kind: 'backup', record: { v: 2, lock: { pattern: v.lock.pattern }, data: v.data } };
  }
  if (o.kind === 'config') {
    const habits = sanitizeHabits(o.habits);
    if (!habits.length) throw new Error('La configuración no tiene hábitos.');
    return {
      kind: 'config',
      habits,
      triggers: sanitizeTriggers(o.triggers),
      milestones: sanitizeMilestones(o.milestones),
      grand: sanitizeGrand(o.grand),
      partyBonus: typeof o.partyBonus === 'number' && o.partyBonus >= 0 ? Math.round(o.partyBonus) : 0,
    };
  }
  throw new Error('Tipo de archivo desconocido.');
}

function textFile(text: string): File {
  return new File([text], backupFileName(), { type: 'text/plain' });
}

export function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [textFile('{}')] });
  } catch {
    return false;
  }
}

export async function shareBackupText(text: string): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({ files: [textFile(text)], title: 'Respaldo' });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}

export function downloadBackupText(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
