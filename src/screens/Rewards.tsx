import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ScreenHeader, SectionTitle } from '../components/ui';
import { STEP } from '../lib/config';
import { formatShort, localDateOf, type ISODate } from '../lib/dates';
import { isEarned, milestones, rewardRows, streakStats } from '../lib/engine';
import { haptic, toast } from '../lib/feedback';
import { actions } from '../lib/store';
import type { AppState, Reward } from '../lib/types';

const IDEAS = ['Comer en un buen lugar', 'Una salida planeada', 'Ropa nueva', 'Un perfume', 'Un libro', 'Un día de descanso'];

export function RewardsScreen({ state, today }: { state: AppState; today: ISODate }) {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const ms = milestones(s.cycleLength);
  const rows = rewardRows(st.best, s.cycleLength);
  const pending = ms.filter((_, i) => isEarned(i + 1, st.best) && !state.rewards[String(i + 1)]?.claimedAt).length;
  const socialTriggers = s.triggers.some((t) => /amig|fiesta|reuni/i.test(t));

  const fillNext = (idea: string) => {
    const k = ms.findIndex((_, i) => !state.rewards[String(i + 1)]?.text?.trim()) + 1;
    if (k <= 0) return toast('Ya tienes todos los premios definidos.');
    actions.setRewardText(k, idea);
    toast(`Día ${STEP * k}: ${idea}`);
  };

  return (
    <>
      <ScreenHeader
        eyebrow="Premios"
        title="Mis premios"
        subtitle={`Uno por cada 7 días de racha${pending ? ` · ${pending} por reclamar` : ''}`}
      />
      <section className="card">
        <p style={{ marginTop: 0 }}>
          Al llegar a cada escalón (mejor racha de 7, 14, 21… días) se habilita <b>Reclamar</b>. Elige premios que no te acerquen a lo que quieres dejar.
        </p>
        {socialTriggers && <p>Si el premio es salir con amigos, planéalo antes: «Amigos» y «Fiesta» están entre tus disparadores.</p>}
        <div className="chips" aria-label="Ideas de premios">
          {IDEAS.map((idea) => (
            <button key={idea} type="button" className="chip" onClick={() => fillNext(idea)}>
              + {idea}
            </button>
          ))}
        </div>
      </section>

      <SectionTitle aside={`mejor racha ${st.best}`}>Escalones</SectionTitle>
      {ms.slice(0, rows).map((m, i) => (
        <RewardRow key={m} k={i + 1} day={m} last={i === ms.length - 1} reward={state.rewards[String(i + 1)]} best={st.best} run={st.run} />
      ))}
      {rows < ms.length && <p className="fine">Aparecen más escalones a medida que avanzas.</p>}
    </>
  );
}

function RewardRow({ k, day, last, reward, best, run }: { k: number; day: number; last: boolean; reward: Reward | undefined; best: number; run: number }) {
  const [text, setText] = useState(reward?.text ?? '');
  useEffect(() => setText(reward?.text ?? ''), [reward?.text]);
  const earned = isEarned(k, best);
  const claimed = Boolean(reward?.claimedAt);
  const save = () => {
    if (text.trim() !== (reward?.text ?? '')) actions.setRewardText(k, text.trim());
  };
  const status = claimed ? 'claimed' : earned ? 'won' : 'active';
  return (
    <article className={`reward ${earned ? 'won' : ''} ${last ? 'final' : ''}`} aria-label={`Premio del día ${day}`}>
      <div className="reward-head">
        <div className="reward-title">
          {last && <Icon name="trophy" size={18} />}
          Día {day}
          {last ? ' · gran premio' : ''}
        </div>
        <span className={`badge ${status}`}>{claimed ? 'Reclamado' : earned ? 'Ganado' : `Faltan ${Math.max(0, day - run)}`}</span>
      </div>
      <input
        className="field"
        type="text"
        maxLength={80}
        placeholder="Mi premio"
        value={text}
        disabled={claimed}
        enterKeyHint="done"
        aria-label={`Premio del día ${day}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {claimed ? (
        <div className="claimed-note">
          <Icon name="check" size={16} /> Reclamado el {formatShort(localDateOf(reward!.claimedAt!))}
        </div>
      ) : earned ? (
        <button
          type="button"
          className={`btn ${last ? 'gold' : 'primary'} block`}
          disabled={!text.trim()}
          onClick={() => {
            save();
            actions.claimReward(k);
            haptic([20, 60, 20]);
            toast('Premio reclamado. Te lo ganaste.', 'reward');
          }}
        >
          <Icon name="gift" size={18} /> {text.trim() ? 'Reclamar' : 'Escribe tu premio para reclamarlo'}
        </button>
      ) : null}
    </article>
  );
}
