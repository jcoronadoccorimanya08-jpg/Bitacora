import { useState } from 'react';
import { STEP } from '../lib/config';
import { addDays, formatRange, minDate, rangeDates, weekdayInitial, type ISODate } from '../lib/dates';
import { cleanDaysIn, cycleEnd, cyclePhase, dayPct, isClean, lastPlayableDay, savings, weekPct } from '../lib/engine';
import { toast } from '../lib/feedback';
import { formatHours } from '../lib/report';
import { renderReportImage, weekIndexOf } from '../lib/reportImage';
import type { AppState } from '../lib/types';
import { Icon } from './Icon';

/** Reporte de la semana: tarjeta visual + imagen para compartir (sin nombres de hábitos) + texto para Claude. */
export function ReportCard({ state, today, report, victories = 0 }: { state: AppState; today: ISODate; report: string; victories?: number }) {
  const s = state.settings;
  const [busy, setBusy] = useState(false);
  const [showText, setShowText] = useState(false);
  const ref = cyclePhase(s, today) === 'before' ? s.startDate : lastPlayableDay(s, today);
  const wk = weekIndexOf(s.startDate, ref);
  const start = addDays(s.startDate, (wk - 1) * STEP);
  const end = minDate(addDays(start, STEP - 1), cycleEnd(s));
  const played = today < start ? [] : rangeDates(start, minDate(end, ref));
  const clean = cleanDaysIn(state.days, played, s.habits);
  const pct = Math.round(weekPct(s, state.days, wk, today) ?? 0);
  const sv = savings(s, state.days, today);

  const shareImage = async () => {
    setBusy(true);
    try {
      const blob = await renderReportImage(state, today, victories);
      const file = new File([blob], `bitacora-semana-${wk}.png`, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Bitácora · Semana ${wk}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Imagen guardada en tus descargas.', 'success');
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast('No se pudo crear la imagen.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast('Reporte copiado. Pégalo en Claude.', 'success');
    } catch {
      toast('No se pudo copiar.', 'error');
    }
  };

  return (
    <section className="card report" aria-label="Reporte de la semana">
      <div className="report-head">
        <div>
          <div className="goal-eyebrow">Semana {wk}</div>
          <div className="card-title">{formatRange(start, end)}</div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            {clean} de {played.length || STEP} días limpios · Bs {sv.bs} · {formatHours(sv.horas)}
          </div>
        </div>
        <div className="report-pct">
          <b>{pct}%</b>
          <span>limpio</span>
        </div>
      </div>
      <div className="report-days" aria-hidden="true">
        {rangeDates(start, end).map((d) => {
          const p = d > today ? 0 : dayPct(state.days, d, s.habits);
          return (
            <div key={d} className={`rd ${d > today ? 'future' : isClean(state.days, d, s.habits) ? 'won' : ''}`}>
              <i style={{ height: `${Math.max(4, p)}%` }} />
              <span>{weekdayInitial(d)}</span>
            </div>
          );
        })}
      </div>
      <div className="warn-note">
        <Icon name="alert" size={16} />
        La imagen no muestra tus hábitos ni tus disparadores. El texto para Claude sí: compártelo solo donde tú quieras.
      </div>
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void shareImage()}>
          <Icon name="image" size={18} /> {busy ? 'Creando…' : 'Imagen'}
        </button>
        <button type="button" className="btn" onClick={() => void copy()}>
          <Icon name="copy" size={18} /> Copiar para Claude
        </button>
      </div>
      <button type="button" className="link-btn" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
        {showText ? 'Ocultar el texto' : 'Ver el texto para Claude'}
      </button>
      {showText && <div className="report-text">{report}</div>}
    </section>
  );
}
