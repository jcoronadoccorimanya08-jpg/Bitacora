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
/** true si Chrome confirma que la app ya está instalada en el teléfono (aunque la abras en una pestaña). */
let installedElsewhere = false;
const installListeners = new Set<() => void>();

type NavigatorWithRelatedApps = Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };

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
  // Necesita "related_applications" en el manifest. En Samsung la app nueva a veces queda solo en
  // el cajón de aplicaciones: así podemos decir "ya la tienes instalada" en vez de pedir instalarla otra vez.
  const nav = navigator as NavigatorWithRelatedApps;
  if (typeof nav.getInstalledRelatedApps === 'function') {
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        installedElsewhere = apps.length > 0;
        if (installedElsewhere) installListeners.forEach((l) => l());
      })
      .catch(() => undefined);
  }
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
  return {
    installed: standalone,
    canInstall: deferredPrompt !== null && !standalone && !installedElsewhere,
    installedNow: installedNow || installedElsewhere,
    install,
  };
}
