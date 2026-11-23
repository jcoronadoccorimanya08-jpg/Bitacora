import { useState } from 'react';
import { BadgesCard } from '../components/Badges';
import { celebrate } from '../components/Confetti';
import { Icon } from '../components/Icon';
import { ConfirmDialog, ScreenHeader, SectionTitle } from '../components/ui';
import { CHEST_LABEL } from '../lib/config';
import { formatLong, formatShort, localDateOf, plural, type ISODate } from '../lib/dates';
import { badgeBlocks, BADGE_PCT } from '../lib/badges';
import { streakStats } from '../lib/engine';
import { haptic, toast } from '../lib/feedback';
import { grandStatus, pendingChests, steps, wildcards, withClaims, type Step } from '../lib/rewards';
import { actions } from '../lib/store';
import { OTHER_NAME, VICTORY_PCT, teamFor } from '../lib/team';
import type { AppState } from '../lib/types';

type Prize = Extract<Step, { kind: 'prize' }>;
type Claim = { key: string; name: string } | null;

export function RewardsScreen({ state, today }: { state: AppState; today: ISODate }) {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const list = withClaims(steps(s, st.best), state);
  const wild = wildcards(state);
  const chests = pendingChests(list, state);
  const team = teamFor(s, state.days, today);
  const g = grandStatus(s, state, today, team.victories);
  const [confirm, setConfirm] = useState<Claim>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const openChest = (key: string) => {
    const c = actions.openChest(key);
    if (!c) return;
    celebrate('week');
    haptic([20, 60, 20, 60, 40]);
    toast(`Te salió: ${CHEST_LABEL[c.outcome]}`, 'reward');
  };

  const history = [
    ...Object.entries(state.claims).map(([k, c]) => ({
      at: c.claimedAt,
      text: k === 'grand' ? `Gran premio: ${s.grand?.name ?? 'reclamado'}` : `Día ${k}: ${s.milestones.find((m) => String(m.day) === k)?.name ?? 'premio'}`,
    })),
    ...Object.entries(state.chests).map(([k, c]) => ({ at: c.openedAt, text: `Cofre del día ${k.replace(/[ab]$/, '')}: ${CHEST_LABEL[c.outcome]}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <>
      <ScreenHeader eyebrow="Premios" title="Tus escalones" subtitle="Cada 7 días de racha: un premio o un cofre sorpresa." />

      <section className="card fund" aria-label="Tus comodines">
        <div className="fund-row" style={{ marginTop: 0 }}>
          <span>
            <Icon name="sparkles" size={16} /> Comodines: <b>{wild.available}</b>
          </span>
          <span className="muted">salen de los cofres</span>
        </div>
      </section>

      <BadgesCard blocks={badgeBlocks(s, state.days, today)} rule={`Cada insignia se gana con ${BADGE_PCT} % limpio en 2 semanas.`} />

      {s.grand && g.kind !== 'none' && (
        <section className={`card special ${g.kind === 'available' ? 'ready' : ''}`} aria-label="Gran premio">
          <div className="reward-head">
            <div>
              <div className="goal-eyebrow">Gran premio</div>
              <div className="card-title">{s.grand.name}</div>
              <div className="reward-dates">
                {g.kind === 'claimed'
                  ? `Reclamado el ${formatShort(localDateOf(g.claimedAt))}`
                  : formatLong(g.target)}
              </div>
            </div>
            {g.kind === 'locked' && g.daysLeft > 0 && <span className="badge active">Faltan {g.daysLeft}</span>}
            {g.kind === 'claimed' && <span className="badge claimed">Reclamado</span>}
          </div>
          {g.kind !== 'claimed' && g.required > 0 && (
            <>
              <div className="reward-progress">
                <div className="bar gold">
                  <i style={{ width: `${Math.min(100, Math.round((g.victories / g.required) * 100))}%` }} />
                </div>
                {g.victories}/{g.required} semanas
              </div>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {!team.other
                  ? `Semana victoriosa: el promedio con ${OTHER_NAME} llega a ${VICTORY_PCT} %. Abre ${OTHER_NAME} en este teléfono para sumar sus semanas.`
                  : !team.aligned
                    ? `${OTHER_NAME} tiene otro inicio de ciclo. Pon la misma fecha en las dos apps para que las semanas coincidan.`
                    : `Semana victoriosa: el promedio con ${OTHER_NAME} llega a ${VICTORY_PCT} %.`}
              </p>
            </>
          )}
          {g.kind === 'locked' && g.daysLeft <= 0 && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
              Te faltaron {plural(g.required - g.victories, 'semana victoriosa', 'semanas victoriosas')}. Lo que lograste se queda contigo: va de nuevo en tu
              próximo ciclo.
            </p>
          )}
          {g.kind === 'available' && (
            <button
              type="button"
              className="btn gold block"
              style={{ marginTop: 12 }}
              onClick={() => setConfirm({ key: 'grand', name: s.grand!.name })}
            >
              <Icon name="trophy" size={18} /> Reclamar
            </button>
          )}
        </section>
      )}

      {chests.map((key) => (
        <section key={key} className="card chest">
          <div className="chest-body">
            <span className="chest-icon" aria-hidden="true">
              🎁
            </span>
            <div>
              <div className="card-title">Cofre del día {key.replace(/[ab]$/, '')}</div>
              <p>{/[ab]$/.test(key) ? 'Cofre doble: tienes dos para abrir.' : 'Llegaste al escalón. Ábrelo y descubre tu sorpresa.'}</p>
            </div>
          </div>
          <button type="button" className="btn gold block" onClick={() => openChest(key)}>
            Abrir cofre
          </button>
        </section>
      ))}

      <SectionTitle aside={`mejor racha ${st.best}`}>Escalones</SectionTitle>
      {list.map((step) =>
        step.kind === 'prize' ? (
          editing === step.day ? (
            <PrizeEditor key={step.day} step={step} onDone={() => setEditing(null)} />
          ) : (
            <PrizeRow
              key={step.day}
              step={step}
              run={st.run}
              claimedAt={state.claims[String(step.day)]?.claimedAt}
              onEdit={() => setEditing(step.day)}
              onClaim={() => setConfirm({ key: String(step.day), name: step.prize.name })}
            />
          )
        ) : (
          <article key={step.day} className={`reward step-chest ${step.earned ? 'won' : ''}`} aria-label={`Escalón del día ${step.day}`}>
            <div className="reward-head">
              <div>
                <div className="reward-title">
                  <Icon name="sparkles" size={17} /> Día {step.day} · {step.keys.length > 1 ? 'cofre doble' : 'cofre sorpresa'}
                </div>
                <div className="reward-dates">Un comodín o una noche de series</div>
              </div>
              <span className={`badge ${step.earned ? 'won' : ''}`}>{step.earned ? 'Ganado' : `Faltan ${Math.max(0, step.day - st.run)}`}</span>
            </div>
            {step.keys.map((k) =>
              state.chests[k] ? (
                <div key={k} className="chest-result">
                  {step.keys.length > 1 ? 'Cofre: ' : 'Te salió: '}
                  {CHEST_LABEL[state.chests[k]!.outcome]}
                </div>
              ) : null,
            )}
          </article>
        ),
      )}
      <p className="fine">Los escalones cuentan tu mejor racha: si caes, lo ganado no se pierde.</p>

      {(history.length > 0 || state.urges > 0) && (
        <>
          <SectionTitle>Historial de logros</SectionTitle>
          <div className="group">
            {history.map((h, i) => (
              <div key={i} className="item">
                <div className="txt">
                  <b>{h.text}</b>
                  <span>{h.at ? formatLong(localDateOf(h.at)) : ''}</span>
                </div>
              </div>
            ))}
            {state.urges > 0 && (
              <div className="item">
                <div className="txt">
                  <b>
                    {state.urges} {state.urges === 1 ? 'antojo superado' : 'antojos superados'} con el botón de urgencia
                  </b>
                  <span>Cada uno cuenta.</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `Reclamar «${confirm.name}»` : ''}
        body={confirm ? '¡Disfrútalo, te lo ganaste!' : ''}
        confirmLabel="Reclamar"
        onConfirm={() => {
          if (!confirm) return;
          actions.claim(confirm.key, 0);
          celebrate('week');
          haptic([20, 60, 20]);
          toast(`¡${confirm.name}! Te lo ganaste.`, 'reward');
        }}
      />
    </>
  );
}

function PrizeRow(props: { step: Prize; run: number; claimedAt?: string; onEdit: () => void; onClaim: () => void }) {
  const { step, run, claimedAt, onEdit, onClaim } = props;
  const status = step.claimed ? 'claimed' : step.earned ? 'won' : 'active';
  return (
    <article className={`reward ${step.earned ? 'won' : ''}`} aria-label={`Premio del día ${step.day}`}>
      <div className="reward-head">
        <div>
          <div className="reward-title">
            <Icon name="gift" size={17} /> Día {step.day}
          </div>
          <div className="card-title" style={{ marginTop: 2 }}>
            {step.prize.name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`badge ${status}`}>{step.claimed ? 'Reclamado' : step.earned ? 'Ganado' : `Faltan ${Math.max(0, step.day - run)}`}</span>
        </div>
      </div>
      {step.claimed ? (
        <div className="claimed-note">
          <Icon name="check" size={16} /> Reclamado{claimedAt ? ` el ${formatShort(localDateOf(claimedAt))}` : ''}
        </div>
      ) : step.earned ? (
        <button type="button" className="btn primary block" style={{ marginTop: 12 }} onClick={onClaim}>
          <Icon name="gift" size={18} /> Reclamar
        </button>
      ) : (
        <button type="button" className="link-btn" onClick={onEdit}>
          <Icon name="pencil" size={14} /> Cambiar premio
        </button>
      )}
    </article>
  );
}

function PrizeEditor({ step, onDone }: { step: Prize; onDone: () => void }) {
  const [name, setName] = useState(step.prize.name);
  return (
    <article className="reward" aria-label={`Editar premio del día ${step.day}`}>
      <div className="reward-title">Día {step.day}</div>
      <div className="step-edit">
        <input className="field" value={name} maxLength={60} aria-label="Premio" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onDone}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!name.trim()}
          onClick={() => {
            // El precio guardado se conserva (oculto), por si algún día vuelve.
            actions.setMilestone(step.day, { name: name.trim(), price: step.prize.price });
            toast('Premio guardado.');
            onDone();
          }}
        >
          Guardar
        </button>
      </div>
    </article>
  );
}
