import { useEffect, useState } from 'react';
import { PinPad } from '../components/PinPad';
import { ConfirmDialog } from '../components/ui';
import { APP_NAME } from '../lib/config';
import { haptic } from '../lib/feedback';
import { unlock, wipeAll } from '../lib/store';

export function LockScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fails, setFails] = useState(0);
  const [reset, setReset] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (waitUntil <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [waitUntil, now]);

  const waiting = waitUntil > now;
  const seconds = Math.ceil((waitUntil - now) / 1000);

  const onSubmit = async (pin: string) => {
    setBusy(true);
    setError(undefined);
    const ok = await unlock(pin);
    setBusy(false);
    if (ok) return;
    const n = fails + 1;
    setFails(n);
    haptic([30, 40, 30]);
    setReset((r) => r + 1);
    if (n >= 5) {
      const until = Date.now() + 30_000 * (n - 4);
      setWaitUntil(until);
      setNow(Date.now());
      setError('Demasiados intentos. Espera un momento.');
    } else setError('PIN incorrecto.');
  };

  return (
    <main className="lock">
      <img className="lock-logo" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={64} height={64} />
      <div>
        <h1>{APP_NAME}</h1>
        <p>{waiting ? `Vuelve a intentar en ${seconds} s.` : 'Ingresa tu PIN'}</p>
      </div>
      <PinPad onSubmit={(p) => void onSubmit(p)} busy={busy} disabled={waiting} error={busy ? 'Abriendo…' : error} resetKey={reset} />
      <button type="button" className="link-btn" onClick={() => setForgot(true)}>
        ¿Olvidaste tu PIN?
      </button>
      <ConfirmDialog
        open={forgot}
        onClose={() => setForgot(false)}
        title="Sin el PIN no hay forma de abrir tus datos"
        body="Están cifrados con tu PIN y nadie puede recuperarlo, ni siquiera la app. Puedes borrar todo y empezar de nuevo; si tienes un respaldo, después podrás restaurarlo con el PIN que tenías al hacerlo."
        confirmLabel="Borrar todo"
        danger
        onConfirm={() => void wipeAll()}
      />
    </main>
  );
}
