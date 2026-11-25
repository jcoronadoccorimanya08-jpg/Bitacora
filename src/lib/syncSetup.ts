/** Sincronización de esta app (ver sync.ts). */
import { applyRemoteState, onCommit, realStateForSync, setSyncCode } from './store';
import { createSync } from './sync';
import type { AppState } from './types';

export const sync = createSync<AppState>({
  app: 'bitacora',
  getState: realStateForSync,
  getCode: (s) => s.settings.syncCode,
  // Tu código se queda (si llegó otro estado, igual sigue usando el mismo código).
  applyRemote: (s) => applyRemoteState({ ...s, settings: { ...s.settings, syncCode: realStateForSync()?.settings.syncCode ?? s.settings.syncCode } }),
  hasData: (s) => Object.keys(s.days).length > 0,
  onCommit,
});

/** Primer dispositivo: crea la caja con lo de aquí. */
export function linkSync(code: string) {
  sync.reset();
  setSyncCode(code);
  void sync.syncNow();
}

/** Otro dispositivo: solo se vincula si con ese código ya hay algo (si no, lo escribiste mal). */
export async function joinSync(code: string): Promise<boolean> {
  if (!(await sync.exists(code))) return false;
  linkSync(code);
  return true;
}

export const syncCardProps = {
  onSet: linkSync,
  onJoin: joinSync,
  onOff: () => unlinkSync(),
  onNow: () => void sync.syncNow(),
  onChoose: (pick: 'cloud' | 'mine') => void sync.choose(pick),
  onUndo: () => void sync.undo(),
  onDropUndo: () => sync.dropUndo(),
};

export function unlinkSync() {
  setSyncCode(undefined);
  sync.reset();
}
