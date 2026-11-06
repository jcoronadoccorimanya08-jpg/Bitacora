import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from '../lib/feedback';
import { Icon } from './Icon';

let registration: ServiceWorkerRegistration | undefined;

/** Busca una versión nueva de la app (botón en Ajustes). */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  return Boolean(registration.waiting || registration.installing);
}

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (reg) window.setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast('Lista para usarse sin internet.', 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;
  return (
    <div className="banner" role="status">
      <Icon name="refresh" />
      <div className="txt">
        <b>Hay una versión nueva</b>
        Tus datos se conservan.
      </div>
      <button type="button" className="btn primary sm" onClick={() => void updateServiceWorker(true)}>
        Actualizar
      </button>
    </div>
  );
}
