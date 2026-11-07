import { useState } from 'react';
import { useInstallPrompt } from '../lib/hooks';
import { Icon } from './Icon';

const DISMISS_KEY = 'bitacora.install-hint';
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - t < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Invita a instalar la app cuando se abre desde Chrome.
 * Si Chrome ya ofrece la instalación, muestra el botón; si no, explica dónde está en el menú.
 */
export function InstallCard({ appName, dismissible = false }: { appName: string; dismissible?: boolean }) {
  const { installed, canInstall, installedNow, install } = useInstallPrompt();
  const [hidden, setHidden] = useState(() => dismissible && dismissedRecently());

  if (installed || hidden) return null;

  if (installedNow) {
    return (
      <div className="banner" role="status" aria-label="App instalada">
        <Icon name="check" />
        <div className="txt">
          <b>Ya la tienes instalada</b>
          Ábrela desde el ícono «{appName}». Si no está en tu pantalla de inicio, desliza hacia arriba para ver todas tus
          aplicaciones y búscala ahí.
        </div>
      </div>
    );
  }

  return (
    <div className="banner install" role="region" aria-label="Instalar la app">
      <Icon name="phone" />
      <div className="txt">
        <b>Instala la app en tu teléfono</b>
        {canInstall ? (
          'Queda con su propio ícono y funciona sin internet.'
        ) : (
          <>
            En Chrome toca el menú <b>⋮</b> (arriba a la derecha) y elige <b>«Instalar aplicación»</b> o <b>«Agregar a la pantalla principal»</b>.
            <span className="tip">
              ¿No ves esa opción? Si abriste el link desde otra app (Claude, WhatsApp…), primero toca <b>⋮</b> → <b>«Abrir en Chrome»</b>.
            </span>
          </>
        )}
      </div>
      {canInstall ? (
        <button type="button" className="btn primary sm" onClick={() => void install()}>
          Instalar
        </button>
      ) : dismissible ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Ocultar"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, String(Date.now()));
            } catch {
              /* nada */
            }
            setHidden(true);
          }}
        >
          <Icon name="x" size={18} />
        </button>
      ) : null}
    </div>
  );
}
