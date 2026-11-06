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
const installListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  });
}

/** Botón "Instalar app" de Chrome en Android. */
export function useInstallPrompt() {
  const standalone = useMediaQuery('(display-mode: standalone)');
  const [canInstall, setCanInstall] = useState(() => deferredPrompt !== null);
  useEffect(() => {
    const update = () => setCanInstall(deferredPrompt !== null);
    installListeners.add(update);
    return () => {
      installListeners.delete(update);
    };
  }, []);
  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    return choice.outcome === 'accepted';
  };
  return { installed: standalone, canInstall: canInstall && !standalone, install };
}
