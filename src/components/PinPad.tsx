import { useEffect, useState } from 'react';
import { PIN_MAX, PIN_MIN } from '../lib/config';
import { haptic } from '../lib/feedback';
import { Icon } from './Icon';

interface Props {
  /** Se llama con el PIN cuando la persona toca OK. */
  onSubmit: (pin: string) => void;
  error?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Cambia para borrar lo escrito (por ejemplo, después de un error). */
  resetKey?: number;
  submitLabel?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({ onSubmit, error, busy, disabled, resetKey = 0, submitLabel = 'Entrar' }: Props) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setPin('');
    if (resetKey > 0) {
      setShake(true);
      const t = window.setTimeout(() => setShake(false), 400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [resetKey]);

  const press = (d: string) => {
    if (busy || disabled || pin.length >= PIN_MAX) return;
    haptic(8);
    setPin((p) => p + d);
  };
  const submit = () => {
    if (pin.length >= PIN_MIN && !busy && !disabled) onSubmit(pin);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dots = Math.max(PIN_MIN, pin.length);
  return (
    <div className="stack" style={{ display: 'grid', gap: 18 }}>
      <div className={`pin-dots ${shake ? 'shake' : ''}`} aria-label={`${pin.length} dígitos escritos`} role="status">
        {Array.from({ length: dots }, (_, i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <p className="pin-error" role="alert">
        {error ?? ''}
      </p>
      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className="key" onClick={() => press(k)} disabled={busy || disabled} aria-label={k}>
            {k}
          </button>
        ))}
        <button type="button" className="key ghost" onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy || !pin} aria-label="Borrar">
          <Icon name="backspace" size={26} />
        </button>
        <button type="button" className="key" onClick={() => press('0')} disabled={busy || disabled} aria-label="0">
          0
        </button>
        <button
          type="button"
          className="key go"
          onClick={submit}
          disabled={busy || disabled || pin.length < PIN_MIN}
          aria-label={submitLabel}
        >
          <Icon name="check" size={28} />
        </button>
      </div>
    </div>
  );
}
