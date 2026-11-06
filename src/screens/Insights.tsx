import { useLayoutEffect, useRef } from 'react';
import { ScreenHeader, SectionTitle } from '../components/ui';
import { addDays, formatLong, formatRange, maxDate, minDate, rangeDates, type ISODate } from '../lib/dates';
import {
  cleanDaysIn,
  countedDays,
  cycleEnd,
  dayNumber,
  fallsByWeekday,
  habitStats,
  lastDays,
  markOf,
  streakStats,
  triggerCounts,
} from '../lib/engine';
import type { AppState } from '../lib/types';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function InsightsScreen({ state, today, onOpenDay }: { state: AppState; today: ISODate; onOpenDay: (d: ISODate) => void }) {
  const s = state.settings;
  const st = streakStats(s, state.days, today);
  const counted = countedDays(s, state.days, today);
  const cleanTotal = cleanDaysIn(state.days, counted, s.habits);
  const week = lastDays(s, today, 7);
  const weekStats = habitStats(s, state.days, week);
  const weekTriggers = triggerCounts(state.days, week).slice(0, 3);
  const allTriggers = triggerCounts(state.days, counted);
  const maxTrig = allTriggers[0]?.[1] ?? 1;
  const byDay = fallsByWeekday(s, state.days, counted);
  const maxDay = Math.max(1, ...byDay);
  const worstDay = byDay.some((n) => n > 0) ? ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][byDay.indexOf(Math.max(...byDay))] : null;

  return (
    <>
      <ScreenHeader eyebrow="Análisis" title="Cómo vas" subtitle={`${formatRange(s.startDate, cycleEnd(s))} · ${counted.length} días registrados`} />

      <div className="tiles">
        <div className="tile">
          <b className="num display">{st.run}</b>
          <span>racha actual</span>
        </div>
        <div className="tile">
          <b className="num display">{st.best}</b>
          <span>mejor racha</span>
        </div>
        <div className="tile">
          <b className="num display">{cleanTotal}</b>
          <span>días limpios</span>
        </div>
        <div className="tile">
          <b className="num display">
            {counted.length ? Math.round((cleanTotal / counted.length) * 100) : 0}
            <small>%</small>
          </b>
          <span>de tus días</span>
        </div>
      </div>

      <SectionTitle aside={week.length ? formatRange(week[0]!, week[week.length - 1]!) : undefined}>Resumen de la semana</SectionTitle>
      <section className="card">
        {week.length === 0 ? (
          <p style={{ marginTop: 0 }}>Aparece cuando empiece tu ciclo.</p>
        ) : (
          <>
            <div className="card-title">
              {cleanDaysIn(state.days, week, s.habits)} de {week.length} días limpios
            </div>
            <div style={{ marginTop: 12 }}>
              {weekStats.map((h) => (
                <div key={h.habit.id} className="hstat">
                  <div className="hstat-head">
                    <b>{h.habit.name}</b>
                    <span>
                      {h.ok}/{week.length}
                      {h.fail ? ` · ${h.fail} ${h.fail === 1 ? 'caída' : 'caídas'}` : ''}
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${Math.round((h.ok / week.length) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p>
              {weekTriggers.length
                ? `Lo que más te disparó: ${weekTriggers.map(([t, n]) => `${t} (${n})`).join(', ')}.`
                : 'Sin caídas con disparador esta semana.'}
            </p>
          </>
        )}
      </section>

      <SectionTitle aside="toca un cuadro para corregir">Historial</SectionTitle>
      <section className="card">
        <History state={state} today={today} onOpenDay={onOpenDay} />
      </section>

      <SectionTitle>Disparadores del ciclo</SectionTitle>
      <section className="card">
        {allTriggers.length === 0 ? (
          <p style={{ marginTop: 0 }}>Cuando marques una caída, anota qué la disparó. Aquí verás qué se repite.</p>
        ) : (
          allTriggers.map(([t, n]) => (
            <div key={t} className="hstat">
              <div className="hstat-head">
                <b>{t}</b>
                <span>{n}</span>
              </div>
              <div className="bar">
                <i style={{ width: `${Math.round((n / maxTrig) * 100)}%`, background: 'var(--fail)' }} />
              </div>
            </div>
          ))
        )}
      </section>

      <SectionTitle aside={worstDay ? `más caídas: ${worstDay}` : undefined}>Caídas por día</SectionTitle>
      <section className="card">
        <div className="wd-chart" role="img" aria-label="Caídas por día de la semana">
          {byDay.map((n, i) => (
            <div key={i} className="col">
              <b>{n}</b>
              <div className="track">
                <i style={{ height: `${(n / maxDay) * 100}%` }} />
              </div>
              <span>{DIAS[i]}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function History({ state, today, onOpenDay }: { state: AppState; today: ISODate; onOpenDay: (d: ISODate) => void }) {
  const s = state.settings;
  const ref = useRef<HTMLDivElement>(null);
  const end = minDate(cycleEnd(s), maxDate(addDays(s.startDate, 27), addDays(today, 6)));
  const days = rangeDates(s.startDate, end);

  // Deja visible el día de hoy (y un par de días más), no el final del ciclo.
  useLayoutEffect(() => {
    const el = ref.current;
    const cell = el?.querySelector<HTMLElement>('[data-today]');
    if (el && cell) el.scrollLeft = Math.max(0, cell.offsetLeft + cell.offsetWidth * 3 - el.clientWidth);
  }, []);

  return (
    <>
      <div className="strip-wrap" ref={ref}>
        <div className="strip">
          <span className="lbl" aria-hidden="true" />
          <div className="cells" aria-hidden="true">
            {days.map((d) => {
              const n = dayNumber(s.startDate, d);
              return (
                <span key={d} className="hnum">
                  {n % 7 === 0 || n === 1 ? n : ''}
                </span>
              );
            })}
          </div>
          {s.habits.map((h) => (
            <div key={h.id} style={{ display: 'contents' }}>
              <span className="lbl">{h.name}</span>
              <div className="cells">
                {days.map((d) => {
                  const fut = d > today;
                  const m = markOf(state.days, d, h.id);
                  const n = dayNumber(s.startDate, d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`hcell ${fut ? 'future' : m ?? ''} ${n % 7 === 0 ? 'mark' : ''}`}
                      data-today={d === today ? '' : undefined}
                      disabled={fut}
                      aria-label={`${h.name}, ${formatLong(d)}: ${fut ? 'por venir' : m === 'ok' ? 'limpio' : m === 'fail' ? 'caída' : 'sin marcar'}`}
                      onClick={() => onOpenDay(d)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="legend-row" aria-hidden="true">
        <span>
          <i style={{ background: 'var(--accent)' }} />
          Limpio
        </span>
        <span>
          <i style={{ background: 'var(--fail)' }} />
          Caída
        </span>
        <span>
          <i style={{ background: 'var(--line)' }} />
          Sin marcar
        </span>
        <span>
          <i style={{ background: 'var(--future)' }} />
          Por venir
        </span>
      </div>
    </>
  );
}
