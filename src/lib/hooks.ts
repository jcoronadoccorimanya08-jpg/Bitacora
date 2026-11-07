import { useEffect, useState } from 'react';
import { todayISO, type ISODate } from './dates';

/** "Hoy" en La Paz. Se actualiza solo al pasar la medianoche o al volver a abrir la app. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const tick = () => setToday(todayISO());
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);
  return today;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin preventDefault(): Chrome también muestra su propio aviso «Instalar». Guardamos el evento
    // para el botón de la app.
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    installListeners.forEach((l) => l());
  });
}

/** Instalación en Android: botón propio cuando Chrome lo permite, y si ya se instaló. */
export function useInstallPrompt() {
  const standalone = useMediaQuery('(display-mode: standalone)');
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    installListeners.add(update);
    return () => {
      installListeners.delete(update);
    };
  }, []);
  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return false;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    rerender((n) => n + 1);
    return choice.outcome === 'accepted';
  };
  return { installed: standalone, canInstall: deferredPrompt !== null && !standalone, installedNow, install };
}
