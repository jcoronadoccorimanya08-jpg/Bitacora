import { Icon } from '../components/Icon';
import { APP_NAME } from '../lib/config';
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
  streakStats,
} from '../lib/engine';
import { haptic, toast } from '../lib/feedback';
import { actions, getState, lock } from '../lib/store';
import type { AppState, Mark } from '../lib/types';

interface Props {
  state: AppState;
  today: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  onGo: (tab: 'premios' | 'analisis') => void;
  onBackup: () => void;
}

export function TodayScreen({ state, today, selected, onSelect, onGo, onBackup }: Props) {
  const s = state.settings;
  const phase = cyclePhase(s, today);
  const st = streakStats(s, state.days, today);
  const playable = lastPlayableDay(s, today);
  const editable = isEditable(s, selected, today);
  const next = nextMilestone(st.run, s.cycleLength);
  const prevStep = next ? next - 7 : s.cycleLength;
  const pct = next ? Math.round(((st.run - prevStep) / 7) * 100) : 100;
  const yesterday = addDays(today, -1);

  const onMark = (habitId: string, value: Mark) => {
    if (!editable) return;
    const before = getState();
    if (!before) return;
    const was = streakStats(s, before.days, today);
    const wasClean = isClean(before.days, selected, s.habits);
    const prevMark = markOf(before.days, selected, habitId);
    actions.mark(selected, habitId, value);
    haptic(10);
    const after = getState();
    if (!after || prevMark === value) return;
    const now = streakStats(s, after.days, today);
    if (now.best > was.best && now.best % 7 === 0) {
      toast(`Escalón de ${now.best} días. Reclama tu premio.`, 'reward');
      haptic([20, 60, 20, 60, 40]);
    } else if (!wasClean && isClean(after.days, selected, s.habits)) {
      toast('Día limpio.', 'success');
      haptic([15, 40, 15]);
    } else if (value === 'fail') {
      toast('Anotado. ¿Qué lo disparó?');
    }
  };

  let pill: { text: string; cls: string } | null = null;
  if (selected === today && phase === 'active') {
    if (st.run > 0 && st.run % 7 === 0 && isClean(state.days, today, s.habits)) {
      pill = { text: `Escalón de ${st.run} días. Reclama tu premio en Premios.`, cls: 'win' };
    } else if (st.misses === 1 && !isClean(state.days, today, s.habits)) {
      pill = hasFail(state.days, yesterday, s.habits)
        ? { text: 'Ayer hubo una caída. Hoy no se negocia: dos seguidas rompen la racha.', cls: '' }
        : hasFail(state.days, today, s.habits)
          ? { text: 'Hoy hubo una caída. Mañana no se negocia: dos seguidas rompen la racha.', cls: '' }
          : { text: 'Ayer quedó sin marcar. Si fue limpio, márcalo con la flecha ‹.', cls: 'info' };
    }
  }

  const sunday = weekday(today) === 0 && phase === 'active';
  const backupDue = needsBackup(state, today);
  const dayLabel = selected === today ? 'Hoy' : selected === yesterday ? 'Ayer' : `Hace ${diffDays(selected, today)} días`;

  return (
    <>
      <header className="screen-head">
        <div className="screen-head-text">
          <div className="eyebrow">{APP_NAME}</div>
          <h1 className="title">
            {phase === 'before'
              ? 'Tu ciclo está por empezar'
              : phase === 'finished'
                ? 'Ciclo completado'
                : `Día ${dayNumber(s.startDate, today)} de ${s.cycleLength}`}
          </h1>
          <p className="subtitle">Un día limpio a la vez.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Bloquear ahora" onClick={lock}>
          <Icon name="lock" />
        </button>
      </header>

      {phase === 'before' ? (
        <section className="card">
          <div className="card-title">Empieza el {formatLong(s.startDate)}</div>
          <p>Mientras tanto, define tus premios: uno por cada 7 días de racha.</p>
          <button type="button" className="btn primary block" style={{ marginTop: 14 }} onClick={() => onGo('premios')}>
            <Icon name="gift" size={18} /> Definir mis premios
          </button>
        </section>
      ) : (
        <>
          {backupDue && (
            <div className="banner">
              <Icon name="shield" />
              <div className="txt">
                <b>Respalda tu bitácora</b>
                El archivo queda cifrado con tu PIN.
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
                Revisa cómo te fue esta semana.
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
              <strong>{dayLabel}</strong>
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
            {pill && <div className={`pill ${pill.cls}`}>{pill.text}</div>}
          </section>

          <div style={{ marginTop: 12 }}>
            {s.habits.map((h) => {
              const m = markOf(state.days, selected, h.id);
              const chosen = state.days[selected]?.triggers?.[h.id] ?? [];
              return (
                <article key={h.id} className={`vcard ${m ?? ''}`} aria-label={h.name}>
                  <h3>{h.name}</h3>
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
          </div>

          <p className="fine">
            Marca cada noche antes de las 23:00. Una caída es información, no un fracaso: anota qué la disparó.
          </p>
        </>
      )}
    </>
  );
}

function needsBackup(state: AppState, today: ISODate): boolean {
  const marked = Object.keys(state.days).length;
  if (marked < 5) return false;
  const last = state.settings.lastBackupAt;
  if (!last) return true;
  return diffDays(localDateOf(last), today) >= 7;
}
