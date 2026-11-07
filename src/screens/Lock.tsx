import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { PatternPad } from '../components/PatternPad';
import { ConfirmDialog } from '../components/ui';
import { APP_NAME } from '../lib/config';
import { haptic } from '../lib/feedback';
import { unlockWithBiometric, unlockWithPattern, wipeAll } from '../lib/store';

export function LockScreen({ hasBio, updateBanner }: { hasBio: boolean; updateBanner?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fails, setFails] = useState(0);
  const [reset, setReset] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [forgot, setForgot] = useState(false);
  const triedBio = useRef(false);

  useEffect(() => {
    if (waitUntil <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [waitUntil, now]);

  const bio = async () => {
    setBusy(true);
    setError(undefined);
    const r = await unlockWithBiometric();
    setBusy(false);
    if (r === 'fail') setError('No se pudo con la huella. Usa tu patrón.');
  };

  // Al abrir, pide la huella una vez (si está activada).
  useEffect(() => {
    if (hasBio && !triedBio.current) {
      triedBio.current = true;
      void bio();
    }
  }, [hasBio]);

  const waiting = waitUntil > now;

  const onPattern = async (pattern: string) => {
    if (waiting) return;
    setBusy(true);
    setError(undefined);
    const ok = await unlockWithPattern(pattern);
    setBusy(false);
    if (ok) return;
    const n = fails + 1;
    setFails(n);
    haptic([30, 40, 30]);
    setReset((r) => r + 1);
    if (n >= 5) {
      setWaitUntil(Date.now() + 30_000 * (n - 4));
      setNow(Date.now());
      setError('Demasiados intentos. Espera un momento.');
    } else setError('Patrón incorrecto.');
  };

  return (
    <main className="lock">
      {updateBanner}
      <img className="lock-logo" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={64} height={64} />
      <div>
        <h1>{APP_NAME}</h1>
        <p>{waiting ? `Vuelve a intentar en ${Math.ceil((waitUntil - now) / 1000)} s.` : busy ? 'Abriendo…' : 'Dibuja tu patrón'}</p>
      </div>
      {hasBio && (
        <button type="button" className="btn primary bio-btn" onClick={() => void bio()} disabled={busy}>
          <Icon name="fingerprint" size={22} /> Entrar con huella
        </button>
      )}
      <PatternPad onComplete={(p) => void onPattern(p)} resetKey={reset} error={Boolean(error) && !busy} disabled={busy || waiting} />
      {error && (
        <p className="pin-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="link-btn" onClick={() => setForgot(true)}>
        ¿Olvidaste tu patrón?
      </button>
      <ConfirmDialog
        open={forgot}
        onClose={() => setForgot(false)}
        title="Sin el patrón no hay forma de abrir tus datos"
        body="Están cifrados con tu patrón y nadie puede recuperarlo, ni siquiera la app. Puedes empezar de nuevo; si tienes un respaldo, después lo restauras con el patrón que tenías al hacerlo."
        confirmLabel="Empezar de nuevo"
        danger
        onConfirm={() => void wipeAll()}
      />
    </main>
  );
}
