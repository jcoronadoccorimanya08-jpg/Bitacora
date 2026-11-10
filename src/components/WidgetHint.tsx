import { useEffect, useState } from 'react';
import { useBridgeStatus, widgetHint } from '../lib/widget';
import { Icon } from './Icon';

/** Cuánto esperar a que llegue el canal antes de avisar. */
const WAIT_MS = 6000;

function environment() {
  if (typeof window === 'undefined') return { android: false, standalone: false, referrer: '' };
  return {
    android: /Android/i.test(navigator.userAgent),
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    referrer: document.referrer ?? '',
  };
}

/** Si el widget de Rachas no recibe tu día (por ejemplo, abriste la app con el ícono que instaló Chrome), lo avisa. */
export function WidgetHint() {
  const status = useBridgeStatus();
  const [waited, setWaited] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  const kind = widgetHint({ status, waited, ...environment() });
  if (hidden || !kind) return null;
  return (
    <div className="banner" role="status" aria-label="Widget">
      <Icon name="flame" />
      <div className="txt">
        <b>Tu widget no se está actualizando</b>
        {kind === 'outside'
          ? 'Abre Bitácora tocando el widget o con el ícono de la llamita (app Rachas). Con el otro ícono, el widget no se entera.'
          : 'Cierra Bitácora y vuelve a abrirla tocando el widget.'}
      </div>
      <button type="button" className="btn sm" onClick={() => setHidden(true)}>
        Entendido
      </button>
    </div>
  );
}
