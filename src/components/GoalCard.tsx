import { formatLong, plural, type ISODate } from '../lib/dates';
import { streakStats } from '../lib/engine';
import { grandStatus, nextPrize, steps, wallet, withClaims } from '../lib/rewards';
import { teamFor } from '../lib/team';
import type { AppState } from '../lib/types';
import { Icon } from './Icon';

/** Tu meta, todos los días arriba en Hoy: tu gran premio y, si no hay, el próximo premio de tu racha. */
export function GoalCard({ state, today, onOpen }: { state: AppState; today: ISODate; onOpen: () => void }) {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const w = wallet(s, state, today);
  const g = grandStatus(s, state, today, teamFor(s, state.days, today).victories);

  if (s.grand && g.kind !== 'none' && g.kind !== 'claimed') {
    const price = s.grand.price ?? 0;
    const money = price > 0 ? (w.balance >= price ? 'tu ahorro ya lo cubre' : `tienes Bs ${w.balance} de Bs ${price}`) : '';
    const line =
      g.kind === 'available'
        ? '¡Llegó el día! Reclámalo en Premios.'
        : g.daysLeft <= 0
          ? `Te faltaron ${plural(g.required - g.victories, 'semana victoriosa', 'semanas victoriosas')}. Va de nuevo en tu próximo ciclo.`
          : g.required
            ? `${g.victories} de ${g.required} semanas victoriosas${money ? ` · ${money}` : ''}`
            : price > 0
              ? `${money.charAt(0).toUpperCase()}${money.slice(1)} · ${formatLong(g.target)}`
              : `El ${formatLong(g.target)} · racha de ${st.run} ${st.run === 1 ? 'día' : 'días'}`;
    return (
      <button type="button" className={`goal ${g.kind === 'available' ? 'ready' : ''}`} onClick={onOpen} aria-label="Tu meta">
        <span className="goal-icon">
          <Icon name="target" size={22} />
        </span>
        <span className="goal-body">
          <span className="goal-eyebrow">Tu gran premio</span>
          <b>{s.grand.name}</b>
          <span className="goal-sub">{line}</span>
        </span>
        {g.kind === 'locked' && g.daysLeft > 0 && (
          <span className="goal-count">
            <b>{g.daysLeft}</b>
            <small>{g.daysLeft === 1 ? 'día' : 'días'}</small>
          </span>
        )}
      </button>
    );
  }

  const next = nextPrize(withClaims(steps(s, st.best), state));
  if (!next) return null;
  const left = Math.max(0, next.day - st.run);
  return (
    <button type="button" className="goal" onClick={onOpen} aria-label="Tu meta">
      <span className="goal-icon">
        <Icon name="gift" size={22} />
      </span>
      <span className="goal-body">
        <span className="goal-eyebrow">Tu próximo premio</span>
        <b>{next.prize.name}</b>
        <span className="goal-sub">
          Día {next.day} de racha{next.prize.price ? ` · Bs ${next.prize.price}` : ''}
        </span>
      </span>
      <span className="goal-count">
        <b>{left}</b>
        <small>{left === 1 ? 'día' : 'días'}</small>
      </span>
    </button>
  );
}
