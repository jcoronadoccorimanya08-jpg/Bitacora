/** Mensajes breves (toast) y vibración suave. */
type ToastListener = (message: string, tone: ToastTone) => void;
export type ToastTone = 'neutral' | 'success' | 'reward' | 'error';

const listeners = new Set<ToastListener>();

export function toast(message: string, tone: ToastTone = 'neutral') {
  listeners.forEach((l) => l(message, tone));
}

export function onToast(l: ToastListener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sin vibración */
  }
}
