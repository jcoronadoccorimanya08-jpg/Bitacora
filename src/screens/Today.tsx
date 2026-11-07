import { useEffect, useState } from 'react';
import { celebrate } from '../components/Confetti';
import { GoalCard } from '../components/GoalCard';
import { Icon } from '../components/Icon';
import { HowItWorks, WhatsNewBanner } from '../components/HowItWorks';
import { InstallCard } from '../components/InstallCard';
import { MoodPicker } from '../components/MoodPicker';
import { UrgeOverlay } from '../components/UrgeOverlay';
import { SectionTitle } from '../components/ui';
import { APP_NAME, STEP } from '../lib/config';
import { addDays, diffDays, formatLong, localDateOf, weekday, type ISODate } from '../lib/dates';
import {
  cyclePhase,
  dayNumber,
  hasFail,
  isClean,
  isEditable,
  lastPlayableDay,
  markOf,
  nextMilestone,
  okCount,
  savings,
  streakStats,
} from '../lib/engine';
import { haptic, toast } from '../lib/feedback';
import { formatHours } from '../lib/report';
import { badgeBlocks, BADGE_PCT, earnedTiers } from '../lib/badges';
import { steps, wildcards, withClaims } from '../lib/rewards';
import { actions, biometricSupport, enableBiometric, getState, lock } from '../lib/store';
import type { AppState, Habit, Mark, Settings } from '../lib/types';

interface Props {
  state: AppState;
  today: ISODate;
  hasBio: boolean;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  onGo: (tab: 'premios' | 'analisis') => void;
  onBackup: () => void;
}

const BIO_PROMO_KEY = 'bitacora.bio-promo';

export function TodayScreen({ state, today, hasBio, selected, onSelect, onGo, onBackup }: Props) {
  const s = state.settings;
  const phase = cyclePhase(s, today);
  const st = streakStats(s, state.days, today);
  const playable = lastPlayableDay(s, today);
  const editable = isEditable(s, selected, today);
  const next = nextMilestone(st.run, s.cycleLength);
  const prevStep = next ? next - STEP : s.cycleLength;
  const pct = next ? Math.round(((st.run - prevStep) / STEP) * 100) : 100;
  const nextStep = next ? withClaims(steps(s, st.best), state).find((x) => x.day === next) : undefined;
  const yesterday = addDays(today, -1);
  const rec = state.days[selected];
  const clean = isClean(state.days, selected, s.habits);
  const wild = wildcards(state);
  const sv = savings(s, state.days, today);
  const [urge, setUrge] = useState(false);
  const [help, setHelp] = useState(false);

  const onMark = (habitId: string, value: Mark) => {
    if (!editable) return;
    const before = getState();
    if (!before) return;
    const was = streakStats(s, before.days, today);
    const wasClean = isClean(before.days, selected, s.habits);
    const prevMark = markOf(before.days, selected, habitId);
    const tiersBefore = earnedTiers(badgeBlocks(s, before.days, today)).length;
    actions.mark(selected, habitId, value);
    haptic(10);
    const after = getState();
    if (!after || prevMark === value) return;
    const now = streakStats(s, after.days, today);
    const tiers = earnedTiers(badgeBlocks(s, after.days, today));
    if (tiers.length > tiersBefore) {
      celebrate('week');
      haptic([20, 60, 20, 60, 40]);
      toast(`¡Insignia ${tiers[tiers.length - 1]}! ${BADGE_PCT} % limpio en 2 semanas.`, 'reward');
    } else if (now.best > was.best && now.best % STEP === 0) {
      celebrate('week');
      haptic([20, 60, 20, 60, 40]);
      toast(`¡Escalón de ${now.best} días! Mira tu premio en Premios.`, 'reward');
    } else if (!wasClean && isClean(after.days, selected, s.habits)) {
      celebrate('day');
      haptic([15, 40, 15]);
      toast('¡Día limpio!', 'success');
    } else if (value === 'fail') {
      toast('Anotado. ¿Qué lo disparó?');
    }
  };

  let pill: { text: string; cls: string } | null = null;
  if (selected === today && phase === 'active') {
    if (st.run > 0 && st.run % STEP === 0 && isClean(state.days, today, s.habits)) {
      pill = { text: `Escalón de ${st.run} días. Tu premio te espera en Premios.`, cls: 'win' };
    } else if (st.misses === 1 && !isClean(state.days, today, s.habits)) {
      pill = hasFail(state.days, yesterday, s.habits)
        ? { text: 'Ayer hubo una caída. Hoy no se negocia: dos seguidas reinician la racha.', cls: '' }
        : hasFail(state.days, today, s.habits)
          ? { text: 'Hoy hubo una caída. Mañana no se negocia: dos seguidas reinician la racha.', cls: '' }
          : { text: 'Ayer quedó sin marcar. Si fue limpio, márcalo con la flecha ‹.', cls: 'info' };
    }
  }

  const sunday = weekday(today) === 0 && phase === 'active';
  const dayLabel = selected === today ? 'Hoy' : selected === yesterday ? 'Ayer' : `Hace ${diffDays(selected, today)} días`;
  const hot = st.run >= STEP;

  return (
    <>
      <header className="screen-head">
        <div className="screen-head-text">
          <div className="eyebrow">{APP_NAME}</div>
          <h1 className="title">
            {phase === 'before' ? 'Tu ciclo está por empezar' : phase === 'finished' ? 'Ciclo completado' : `Día ${dayNumber(s.startDate, today)} de ${s.cycleLength}`}
          </h1>
          <p className="subtitle">Un día limpio a la vez.</p>
        </div>
        <div className="head-actions">
          {phase !== 'before' && (
            <div className={`streak-pill ${hot ? 'hot' : ''}`} title="Tu racha">
              <Icon name="flame" size={20} />
              <b>{st.run}</b>
              <span>{st.run === 1 ? 'día' : 'días'}</span>
            </div>
          )}
          <button type="button" className="icon-btn" aria-label="Bloquear ahora" onClick={lock}>
            <Icon name="lock" />
          </button>
        </div>
      </header>

      {phase !== 'before' && (
        <div className="cycle-bar" aria-hidden="true">
          <i style={{ width: `${(Math.min(s.cycleLength, dayNumber(s.startDate, today)) / s.cycleLength) * 100}%` }} />
        </div>
      )}

      <GoalCard state={state} today={today} onOpen={() => onGo('premios')} />

      <button type="button" className="urge-btn" onClick={() => setUrge(true)}>
        <Icon name="lifebuoy" size={22} /> Tengo un antojo
      </button>

      {!hasBio && <BioPromo />}
      <InstallCard appName="Bitácora" dismissible />
      <WhatsNewBanner onOpen={() => setHelp(true)} />

      {phase === 'before' ? (
        <BeforeStart s={s} today={today} onGoRewards={() => onGo('premios')} />
      ) : (
        <>
          {needsBackup(state, today) && (
            <div className="banner">
              <Icon name="shield" />
              <div className="txt">
                <b>Respalda tu bitácora</b>
                El archivo queda cifrado con tu patrón. Guárdalo en Drive.
              </div>
              <button type="button" className="btn sm" onClick={onBackup}>
                Respaldar
              </button>
            </div>
          )}
          {sunday && (
            <div className="banner gold">
              <Icon name="calendar" />
              <div className="txt">
                <b>Es domingo</b>
                Revisa cómo te fue esta semana y saca tu reporte.
              </div>
              <button type="button" className="btn sm" onClick={() => onGo('analisis')}>
                Ver
              </button>
            </div>
          )}

          <nav className="daynav" aria-label="Día que estás marcando">
            <button type="button" className="arrow" aria-label="Día anterior" disabled={selected <= s.startDate} onClick={() => onSelect(addDays(selected, -1))}>
              <Icon name="chevronLeft" />
            </button>
            <div className="label">
              <strong>{phase === 'finished' && selected === playable ? 'Último día' : dayLabel}</strong>
              <span>
                {formatLong(selected)} · día {dayNumber(s.startDate, selected)}
              </span>
            </div>
            <button type="button" className="arrow" aria-label="Día siguiente" disabled={selected >= playable} onClick={() => onSelect(addDays(selected, 1))}>
              <Icon name="chevronRight" />
            </button>
          </nav>
          {selected !== playable && (
            <button type="button" className="back-today" onClick={() => onSelect(playable)}>
              Volver a hoy
            </button>
          )}

          <section className="card streak-card" aria-label="Racha" style={{ marginTop: 12 }}>
            <div className="streak">
              <span className="big">{st.run}</span>
              <span className="unit">{st.run === 1 ? 'día de racha' : 'días de racha'}</span>
            </div>
            <div className="progress" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
            <div className="meta-row">
              <span>Mejor racha: {st.best}</span>
              <span>{next ? `Escalón ${next} · faltan ${next - st.run}` : 'Llegaste al último escalón'}</span>
            </div>
            {nextStep && (
              <div className="meta-row" style={{ color: 'var(--text)' }}>
                <span>
                  <Icon name={nextStep.kind === 'prize' ? 'gift' : 'sparkles'} size={14} />{' '}
                  {nextStep.kind === 'prize' ? nextStep.prize.name : nextStep.keys.length > 1 ? 'Cofre doble' : 'Cofre sorpresa'}
                </span>
                {nextStep.kind === 'prize' && nextStep.prize.price > 0 && <span>Bs {nextStep.prize.price}</span>}
              </div>
            )}
            {pill && <div className={`pill ${pill.cls}`}>{pill.text}</div>}
            {editable && !clean && wild.available > 0 && (
              <button
                type="button"
                className="btn gold block sm"
                style={{ marginTop: 12 }}
                onClick={() => {
                  actions.useWildcard(selected);
                  celebrate('day');
                  toast('Comodín usado: este día cuenta como limpio para tu racha.', 'reward');
                }}
              >
                <Icon name="sparkles" size={17} /> Usar un comodín (tienes {wild.available})
              </button>
            )}
            {editable && rec?.wildcard && (
              <button type="button" className="link-btn" onClick={() => actions.removeWildcard(selected)}>
                Quitar el comodín de este día
              </button>
            )}
          </section>

          <SavingsCard state={state} today={today} selected={selected} editable={editable} />

          <SectionTitle aside={`${okCount(state.days, selected, s.habits)}/${s.habits.length} limpios`}>Tu día</SectionTitle>
          {s.habits.map((h) => {
            const m = markOf(state.days, selected, h.id);
            const chosen = rec?.triggers?.[h.id] ?? [];
            return (
              <article key={h.id} className={`vcard ${m ?? ''}`} aria-label={h.name}>
                <div className="vcard-head">
                  <h3>{h.name}</h3>
                  {h.value && h.value.amount > 0 && <span className="value-tag">{valueTag(h)}</span>}
                </div>
                <p className="q">{h.q}</p>
                <div className="choices">
                  <button type="button" className="choice-btn ok" aria-pressed={m === 'ok'} disabled={!editable} onClick={() => onMark(h.id, 'ok')}>
                    {m === 'ok' && <Icon name="check" size={18} />}
                    {h.ok}
                  </button>
                  <button type="button" className="choice-btn fail" aria-pressed={m === 'fail'} disabled={!editable} onClick={() => onMark(h.id, 'fail')}>
                    {h.fail}
                  </button>
                </div>
                {m === 'fail' && s.triggers.length > 0 && (
                  <div className="trig">
                    <p>¿Qué lo disparó?</p>
                    <div className="tchips">
                      {s.triggers.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="tchip"
                          aria-pressed={chosen.includes(t)}
                          disabled={!editable}
                          onClick={() => {
                            actions.toggleTrigger(selected, h.id, t);
                            haptic(8);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {h.phrase && <p className="phrase">«{h.phrase}»</p>}
              </article>
            );
          })}

          <MoodPicker
            value={rec?.mood}
            disabled={!editable}
            onChange={(m) => {
              actions.setMood(selected, m);
              haptic(8);
            }}
          />

          <p className="fine">Marca cada noche antes de las 23:00. Una caída es información, no un fracaso: anota qué la disparó.</p>
          {sv.bs > 0 && <p className="fine">Lo que no gastas se vuelve premio: tu ahorro paga tus escalones.</p>}
        </>
      )}

      {help && <HowItWorks s={s} onClose={() => setHelp(false)} />}
      {urge && (
        <UrgeOverlay
          state={state}
          today={today}
          onClose={() => setUrge(false)}
          onDone={() => {
            actions.urgeDone();
            setUrge(false);
            celebrate('day');
            haptic([15, 40, 15]);
            toast('Lo superaste. Eso también es racha.', 'reward');
          }}
        />
      )}
    </>
  );
}

function valueTag(h: Habit): string {
  const v = h.value!;
  if (v.kind === 'bs') return `+Bs ${v.amount}/día`;
  if (v.kind === 'horas') return `+${formatHours(v.amount)}/día`;
  return `+${v.amount === 1 ? '1 día' : `${v.amount} días`}`;
}

function SavingsCard({ state, today, selected, editable }: { state: AppState; today: ISODate; selected: ISODate; editable: boolean }) {
  const s = state.settings;
  const sv = savings(s, state.days, today);
  const hasHours = s.habits.some((h) => h.value?.kind === 'horas');
  const party = Boolean(state.days[selected]?.party);
  if (!s.habits.some((h) => h.value) && !s.partyBonus) return null;
  return (
    <section className="card save-card" aria-label="Tu ahorro">
      <div className="card-title">Tu ahorro</div>
      <div className="save-grid">
        <div className="save-stat">
          <b>Bs {sv.bs}</b>
          <span>que no gastaste</span>
        </div>
        {hasHours && (
          <div className="save-stat">
            <b>{formatHours(sv.horas)}</b>
            <span>recuperadas</span>
          </div>
        )}
        {sv.dias.map((d) => (
          <div key={d.habit.id} className="save-stat">
            <b>{d.days}</b>
            <span>
              {d.days === 1 ? 'día' : 'días'} de {d.label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
      {s.partyBonus > 0 && (
        <button
          type="button"
          className="btn block party-btn"
          aria-pressed={party}
          disabled={!editable}
          onClick={() => {
            actions.toggleParty(selected);
            haptic(12);
            if (!party) {
              celebrate('day');
              toast(`+Bs ${s.partyBonus}. Decir no también es ganar.`, 'reward');
            }
          }}
        >
          <Icon name="ban" size={18} /> {party ? `Dijiste no a una fiesta · +Bs ${s.partyBonus}` : `Dije no a una fiesta (+Bs ${s.partyBonus})`}
        </button>
      )}
    </section>
  );
}

function needsBackup(state: AppState, today: ISODate): boolean {
  const marked = Object.keys(state.days).length;
  if (marked < 5) return false;
  const last = state.settings.lastBackupAt;
  if (!last) return true;
  return diffDays(localDateOf(last), today) >= 7;
}

function BioPromo() {
  const [support, setSupport] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(BIO_PROMO_KEY) === 'hide';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    void biometricSupport().then(setSupport);
  }, []);
  if (hidden || !support || support === 'no') return null;
  const hide = () => {
    try {
      localStorage.setItem(BIO_PROMO_KEY, 'hide');
    } catch {
      /* nada */
    }
    setHidden(true);
  };
  return (
    <div className="banner install" role="region" aria-label="Activar huella">
      <Icon name="fingerprint" />
      <div className="txt">
        <b>Entra con tu huella</b>
        Más rápido que el patrón, y tus datos siguen cifrados.
      </div>
      <button
        type="button"
        className="btn primary sm"
        onClick={async () => {
          try {
            await enableBiometric();
            toast('Huella activada.', 'success');
          } catch (e) {
            const m = e instanceof Error ? e.message : '';
            if (m === 'NOPRF') {
              toast('Tu teléfono no permite usar la huella aquí. Sigue con tu patrón.', 'error');
              hide();
            } else toast('No se activó la huella.', 'error');
          }
        }}
      >
        Activar
      </button>
      <button type="button" className="icon-btn" aria-label="Ahora no" onClick={hide}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}

function BeforeStart({ s, today, onGoRewards }: { s: Settings; today: ISODate; onGoRewards: () => void }) {
  const left = diffDays(today, s.startDate);
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="card-title">Empieza el {formatLong(s.startDate)}</div>
      <p>{left === 1 ? 'Falta 1 día.' : `Faltan ${left} días.`} Revisa tus premios: uno cada 7 días de racha, pagado con lo que dejas de gastar.</p>
      <button type="button" className="btn primary block" style={{ marginTop: 14 }} onClick={onGoRewards}>
        <Icon name="gift" size={18} /> Ver mis premios
      </button>
      <button
        type="button"
        className="btn block"
        style={{ marginTop: 8 }}
        onClick={() => {
          actions.setStartDate(today);
          toast('Tu ciclo empieza hoy.', 'success');
        }}
      >
        <Icon name="calendar" size={18} /> Prefiero empezar hoy
      </button>
    </section>
  );
}
