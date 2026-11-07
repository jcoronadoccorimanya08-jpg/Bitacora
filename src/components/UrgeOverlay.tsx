import { useEffect, useMemo, useState } from 'react';
import { URGE_MINUTES } from '../lib/config';
import { type ISODate } from '../lib/dates';
import { streakStats } from '../lib/engine';
import { haptic } from '../lib/feedback';
import { grandStatus, nextPrize, steps, wallet, withClaims } from '../lib/rewards';
import { teamFor } from '../lib/team';
import type { AppState } from '../lib/types';
import { Icon } from './Icon';

const BREATH_MS = 10_000;
const INHALE_MS = 4_000;

/**
 * Botón de urgencia: cuando llega el antojo, te muestra lo que estás construyendo y te acompaña 10 minutos
 * respirando. El antojo sube, llega a su punto y baja: no hace falta pelearlo, solo dejarlo pasar.
 */
export function UrgeOverlay({ state, today, onClose, onDone }: { state: AppState; today: ISODate; onClose: () => void; onDone: () => void }) {
  const s = state.settings;
  const total = URGE_MINUTES * 60_000;
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(t0);
  const withPhrase = useMemo(() => s.habits.filter((h) => h.phrase.trim()), [s.habits]);
  const [pick, setPick] = useState(withPhrase[0]?.id ?? '');
  const st = streakStats(s, state.days, today);
  const w = wallet(s, state, today);
  const g = grandStatus(s, state, today, teamFor(s, state.days, today).victories);
  const prize = nextPrize(withClaims(steps(s, st.best), state));

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const elapsed = now - t0;
  const left = Math.max(0, total - elapsed);
  const finished = left === 0;
  const inhale = elapsed % BREATH_MS < INHALE_MS;
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  useEffect(() => {
    if (finished) haptic([30, 80, 30]);
  }, [finished]);

  const phrase = withPhrase.find((h) => h.id === pick)?.phrase ?? 'El antojo sube, llega a su punto y baja. Solo déjalo pasar.';

  return (
    <div className="urge" role="dialog" aria-modal="true" aria-label="Botón de urgencia">
      <div className="urge-inner">
        <div className="urge-top">
          <span className="eyebrow">Botón de urgencia</span>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        {s.grand && g.kind !== 'none' && g.kind !== 'claimed' ? (
          <div className="urge-prize">
            <span className="goal-eyebrow">Estás construyendo esto</span>
            <b>{s.grand.name}</b>
            <span>
              {g.kind === 'available'
                ? '¡Ya lo puedes reclamar!'
                : g.daysLeft > 0
                  ? `Faltan ${g.daysLeft} ${g.daysLeft === 1 ? 'día' : 'días'}${g.required ? ` · ${g.victories} de ${g.required} semanas victoriosas` : ''}`
                  : `${g.victories} de ${g.required} semanas victoriosas`}
              {s.grand.price ? ` · Bs ${s.grand.price}` : ''}
            </span>
          </div>
        ) : prize ? (
          <div className="urge-prize">
            <span className="goal-eyebrow">Tu próximo premio</span>
            <b>{prize.prize.name}</b>
            <span>Día {prize.day} de racha · te faltan {Math.max(0, prize.day - st.run)}</span>
          </div>
        ) : null}

        <div className="breath" aria-live="polite">
          <div>
            <b>{finished ? '¡Pasó!' : `${mm}:${String(ss).padStart(2, '0')}`}</b>
            <span>{finished ? 'El antojo bajó' : inhale ? 'Inhala…' : 'Exhala despacio…'}</span>
          </div>
        </div>

        <p className="urge-phrase">«{phrase}»</p>
        {withPhrase.length > 1 && (
          <div className="urge-habits" role="group" aria-label="Tu frase">
            {withPhrase.map((h) => (
              <button key={h.id} type="button" className="tchip" aria-pressed={pick === h.id} onClick={() => setPick(h.id)}>
                {h.name}
              </button>
            ))}
          </div>
        )}

        <p className="urge-save">
          Llevas <b>{st.run}</b> {st.run === 1 ? 'día' : 'días'} de racha y <b>Bs {w.saved}</b> ahorrados. No los regales: en {URGE_MINUTES} minutos esto
          pasa.
        </p>

        <div className="urge-actions">
          <button type="button" className="btn primary block" onClick={onDone}>
            <Icon name="check" size={18} /> Lo superé
          </button>
          <button type="button" className="btn ghost block" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
