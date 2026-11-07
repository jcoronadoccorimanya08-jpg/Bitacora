import { useState } from 'react';
import { celebrate } from '../components/Confetti';
import { Icon } from '../components/Icon';
import { ConfirmDialog, ScreenHeader, SectionTitle } from '../components/ui';
import { CHEST_LABEL } from '../lib/config';
import { formatLong, formatShort, localDateOf, type ISODate } from '../lib/dates';
import { streakStats } from '../lib/engine';
import { haptic, toast } from '../lib/feedback';
import { grandStatus, pendingChests, steps, wallet, wildcards, withClaims, type Step } from '../lib/rewards';
import { actions } from '../lib/store';
import type { AppState } from '../lib/types';

type Prize = Extract<Step, { kind: 'prize' }>;
type Claim = { key: string; name: string; price: number } | null;

export function RewardsScreen({ state, today }: { state: AppState; today: ISODate }) {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const list = withClaims(steps(s, st.best), state);
  const w = wallet(s, state, today);
  const wild = wildcards(state);
  const chests = pendingChests(list, state);
  const g = grandStatus(s, state, today);
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
      text: k === 'grand' ? `Gran premio: ${s.grand?.name ?? 'reclamado'} (Bs ${c.price})` : `Día ${k}: ${s.milestones.find((m) => String(m.day) === k)?.name ?? 'premio'} (Bs ${c.price})`,
    })),
    ...Object.entries(state.chests).map(([k, c]) => ({ at: c.openedAt, text: `Cofre del día ${k.replace(/[ab]$/, '')}: ${CHEST_LABEL[c.outcome]}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <>
      <ScreenHeader eyebrow="Premios" title="Tus escalones" subtitle="Cada 7 días de racha: un premio o un cofre sorpresa." />

      <section className="card fund" aria-label="Tu ahorro disponible">
        <div className="fund-top">
          <span className="fund-icon">
            <Icon name="wallet" size={26} />
          </span>
          <div>
            <div className="fund-amount">
              <small>Bs</small> {w.balance}
            </div>
            <div className="muted">disponible para tus premios</div>
          </div>
        </div>
        <div className="wallet-break">
          <div>
            <span>Lo que no gastaste</span>
            <b>Bs {w.saved}</b>
          </div>
          {w.bonus > 0 && (
            <div>
              <span>Bonos de cofres</span>
              <b>+ Bs {w.bonus}</b>
            </div>
          )}
          {w.spent > 0 && (
            <div>
              <span>Premios reclamados</span>
              <b>− Bs {w.spent}</b>
            </div>
          )}
        </div>
        <div className="fund-row">
          <span>
            <Icon name="sparkles" size={16} /> Comodines: <b>{wild.available}</b>
          </span>
          <span className="muted">salen de los cofres</span>
        </div>
      </section>

      {s.grand && g.kind !== 'none' && (
        <section className={`card special ${g.kind === 'available' ? 'ready' : ''}`} aria-label="Gran premio">
          <div className="reward-head">
            <div>
              <div className="goal-eyebrow">Gran premio</div>
              <div className="card-title">{s.grand.name}</div>
              <div className="reward-dates">
                {g.kind === 'claimed'
                  ? `Reclamado el ${formatShort(localDateOf(g.claimedAt))}`
                  : `${formatLong(g.target)}${s.grand.price ? ` · Bs ${s.grand.price}` : ''}`}
              </div>
            </div>
            {g.kind === 'locked' && <span className="badge active">Faltan {g.daysLeft}</span>}
            {g.kind === 'claimed' && <span className="badge claimed">Reclamado</span>}
          </div>
          {g.kind === 'locked' && s.grand.price ? (
            <div className="reward-progress">
              <div className="bar">
                <i style={{ width: `${Math.min(100, Math.round((Math.max(0, w.balance) / s.grand.price) * 100))}%` }} />
              </div>
              Bs {Math.max(0, w.balance)}/{s.grand.price}
            </div>
          ) : null}
          {g.kind === 'available' && (
            <button
              type="button"
              className="btn gold block"
              style={{ marginTop: 12 }}
              disabled={(s.grand.price ?? 0) > w.balance}
              onClick={() => setConfirm({ key: 'grand', name: s.grand!.name, price: s.grand!.price ?? 0 })}
            >
              <Icon name="trophy" size={18} /> {(s.grand.price ?? 0) > w.balance ? `Te faltan Bs ${(s.grand.price ?? 0) - w.balance}` : 'Reclamar'}
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
              balance={w.balance}
              claimedAt={state.claims[String(step.day)]?.claimedAt}
              onEdit={() => setEditing(step.day)}
              onClaim={() => setConfirm({ key: String(step.day), name: step.prize.name, price: step.prize.price })}
            />
          )
        ) : (
          <article key={step.day} className={`reward step-chest ${step.earned ? 'won' : ''}`} aria-label={`Escalón del día ${step.day}`}>
            <div className="reward-head">
              <div>
                <div className="reward-title">
                  <Icon name="sparkles" size={17} /> Día {step.day} · {step.keys.length > 1 ? 'cofre doble' : 'cofre sorpresa'}
                </div>
                <div className="reward-dates">+20 o +50 Bs, un comodín o una noche de series</div>
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
        body={confirm ? `Se descuentan Bs ${confirm.price} de tu ahorro. Te quedan Bs ${w.balance - confirm.price}. ¡Disfrútalo, te lo ganaste!` : ''}
        confirmLabel="Reclamar"
        onConfirm={() => {
          if (!confirm) return;
          actions.claim(confirm.key, confirm.price);
          celebrate('week');
          haptic([20, 60, 20]);
          toast(`¡${confirm.name}! Te lo ganaste.`, 'reward');
        }}
      />
    </>
  );
}

function PrizeRow(props: { step: Prize; run: number; balance: number; claimedAt?: string; onEdit: () => void; onClaim: () => void }) {
  const { step, run, balance, claimedAt, onEdit, onClaim } = props;
  const short = step.prize.price - balance;
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
          {step.prize.price > 0 && <div className="step-price">Bs {step.prize.price}</div>}
          <span className={`badge ${status}`}>{step.claimed ? 'Reclamado' : step.earned ? 'Ganado' : `Faltan ${Math.max(0, step.day - run)}`}</span>
        </div>
      </div>
      {step.claimed ? (
        <div className="claimed-note">
          <Icon name="check" size={16} /> Reclamado{claimedAt ? ` el ${formatShort(localDateOf(claimedAt))}` : ''}
        </div>
      ) : step.earned ? (
        <button type="button" className="btn primary block" style={{ marginTop: 12 }} disabled={short > 0} onClick={onClaim}>
          <Icon name="gift" size={18} /> {short > 0 ? `Te faltan Bs ${short} de ahorro` : 'Reclamar'}
        </button>
      ) : (
        <button type="button" className="link-btn" onClick={onEdit}>
          <Icon name="pencil" size={14} /> Cambiar premio o precio
        </button>
      )}
    </article>
  );
}

function PrizeEditor({ step, onDone }: { step: Prize; onDone: () => void }) {
  const [name, setName] = useState(step.prize.name);
  const [price, setPrice] = useState(String(step.prize.price));
  return (
    <article className="reward" aria-label={`Editar premio del día ${step.day}`}>
      <div className="reward-title">Día {step.day}</div>
      <div className="step-edit">
        <input className="field" value={name} maxLength={60} aria-label="Premio" onChange={(e) => setName(e.target.value)} />
        <input
          className="field"
          value={price}
          inputMode="numeric"
          aria-label="Precio en Bs"
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 5))}
        />
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
            actions.setMilestone(step.day, { name: name.trim(), price: Number(price || 0) });
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
