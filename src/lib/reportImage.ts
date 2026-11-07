/**
 * Reporte semanal como imagen de 1080 × 1350, dibujado en el teléfono.
 * No incluye los nombres de tus hábitos ni tus disparadores: solo cifras, para que puedas compartirla tranquilo.
 */
import { STEP } from './config';
import { addDays, formatRange, minDate, rangeDates, todayISO, type ISODate } from './dates';
import { cleanDaysIn, cycleEnd, cyclePhase, dailySeries, dayNumber, lastPlayableDay, milestones, savings, streakStats, weekPct } from './engine';
import { formatHours } from './report';
import { grandStatus, nextPrize, steps, withClaims } from './rewards';
import type { AppState } from './types';

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Semana del ciclo (1, 2, …) que contiene `date`. */
export function weekIndexOf(start: ISODate, date: ISODate): number {
  return Math.max(1, Math.floor((dayNumber(start, date) - 1) / STEP) + 1);
}

export async function renderReportImage(state: AppState, today: ISODate, victories = 0): Promise<Blob> {
  await document.fonts?.ready;
  const s = state.settings;
  const ref = cyclePhase(s, today) === 'before' ? s.startDate : lastPlayableDay(s, today);
  const wk = weekIndexOf(s.startDate, ref);
  const wStart = addDays(s.startDate, (wk - 1) * STEP);
  const wEnd = minDate(addDays(wStart, STEP - 1), cycleEnd(s));
  const played = today < wStart ? [] : rangeDates(wStart, minDate(wEnd, ref));
  const clean = cleanDaysIn(state.days, played, s.habits);
  const pct = Math.round(weekPct(s, state.days, wk, today) ?? 0);
  const st = streakStats(s, state.days, today);
  const sv = savings(s, state.days, today);
  const series = dailySeries(s, state.days, today);
  const prize = nextPrize(withClaims(steps(s, st.best), state));
  const grand = grandStatus(s, state, today, victories);

  const bgTop = '#14201c';
  const bgBottom = '#070b0a';
  const accent = '#3bbfa7';
  const info = '#5ab6ff';
  const gold = '#ffc247';
  const flame = '#ff7a3d';
  const text = '#e4edea';
  const muted = '#94a49f';
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'system-ui, sans-serif';
  const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || font;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, bgTop);
  bg.addColorStop(1, bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 140, 10, W * 0.85, 140, 520);
  glow.addColorStop(0, 'rgba(59,191,167,0.2)');
  glow.addColorStop(1, 'rgba(59,191,167,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const P = 80;
  ctx.textBaseline = 'alphabetic';

  // Encabezado
  ctx.fillStyle = accent;
  ctx.font = `700 30px ${font}`;
  ctx.fillText('BITÁCORA', P, 120);
  ctx.fillStyle = text;
  ctx.font = `600 92px ${display}`;
  ctx.fillText(`Semana ${wk}`, P, 215);
  ctx.fillStyle = muted;
  ctx.font = `500 34px ${font}`;
  const dayN = cyclePhase(s, today) === 'before' ? 0 : Math.min(s.cycleLength, dayNumber(s.startDate, ref));
  ctx.fillText(`${formatRange(wStart, wEnd)} · día ${dayN} de ${s.cycleLength}`, P, 266);

  // Anillo: qué tan limpia fue la semana
  const cx = W - P - 150;
  const cy = 200;
  const r = 118;
  ctx.lineWidth = 26;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, info);
  ring.addColorStop(1, accent);
  ctx.strokeStyle = ring;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0.01, pct)) / 100);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.font = `600 84px ${display}`;
  ctx.fillText(`${pct}%`, cx, cy + 26);
  ctx.fillStyle = muted;
  ctx.font = `600 24px ${font}`;
  ctx.fillText('limpio', cx, cy + 60);
  ctx.textAlign = 'left';

  const cards = (y: number, list: [string, string, string][]) => {
    const cw = (W - P * 2 - 40) / 3;
    list.forEach(([big, small, color], i) => {
      const x = P + i * (cw + 20);
      roundRect(ctx, x, y, cw, 150, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `600 64px ${display}`;
      ctx.fillText(big, x + 32, y + 80);
      ctx.fillStyle = muted;
      ctx.font = `500 28px ${font}`;
      ctx.fillText(small, x + 32, y + 122);
    });
  };

  cards(340, [
    [`${clean}/${Math.max(played.length, 1)}`, 'días limpios', clean === played.length && played.length > 0 ? accent : text],
    [`${st.run}`, st.run === 1 ? 'día de racha' : 'días de racha', flame],
    [`Bs ${sv.bs}`, 'ahorrados', accent],
  ]);

  // Montaña del ciclo
  const mx = P;
  const my = 580;
  const mw = W - P * 2;
  const mh = 220;
  ctx.fillStyle = muted;
  ctx.font = `700 26px ${font}`;
  ctx.fillText('TU MONTAÑA · PROMEDIO DE 7 DÍAS', mx, my - 22);
  const n = Math.max(14, series.length, 2);
  const px = (i: number) => mx + (i / (n - 1)) * mw;
  const py = (v: number) => my + (1 - v / 100) * mh;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (const v of [0, 50, 100]) {
    ctx.beginPath();
    ctx.moveTo(mx, py(v));
    ctx.lineTo(mx + mw, py(v));
    ctx.stroke();
  }
  if (series.length) {
    const path = new Path2D();
    path.moveTo(px(0), py(series[0]!.avg7));
    for (let i = 1; i < series.length; i++) {
      const x0 = px(i - 1);
      const x1 = px(i);
      const c = (x0 + x1) / 2;
      path.bezierCurveTo(c, py(series[i - 1]!.avg7), c, py(series[i]!.avg7), x1, py(series[i]!.avg7));
    }
    const area = new Path2D(path);
    area.lineTo(px(series.length - 1), py(0));
    area.lineTo(px(0), py(0));
    area.closePath();
    const grad = ctx.createLinearGradient(0, my, 0, my + mh);
    grad.addColorStop(0, 'rgba(59,191,167,0.55)');
    grad.addColorStop(1, 'rgba(59,191,167,0.02)');
    ctx.fillStyle = grad;
    ctx.fill(area);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.stroke(path);
    series.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(px(i), py(p.pct), p.won ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = p.won ? accent : info;
      ctx.fill();
    });
  }

  cards(850, [
    [formatHours(sv.horas), 'recuperadas', info],
    [`${state.urges}`, state.urges === 1 ? 'antojo vencido' : 'antojos vencidos', gold],
    [`${st.best}`, 'mejor racha', text],
  ]);

  // Escalones: un punto cada 7 días de racha
  const ms = milestones(s.cycleLength);
  const ey = 1085;
  ctx.fillStyle = muted;
  ctx.font = `700 26px ${font}`;
  ctx.fillText('ESCALONES', P, ey);
  const gap = (W - P * 2) / Math.max(1, ms.length - 1);
  ms.forEach((m, i) => {
    const x = P + i * gap;
    const y = ey + 50;
    const done = st.best >= m;
    const hasPrize = s.milestones.some((x) => x.day === m);
    ctx.beginPath();
    ctx.arc(x, y, done ? 17 : 13, 0, Math.PI * 2);
    ctx.fillStyle = done ? (hasPrize ? gold : accent) : 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.fillStyle = done ? text : muted;
    ctx.font = `600 20px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(m), x, y + 46);
    ctx.textAlign = 'left';
  });

  // Pie
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, H - 120, W, 120);
  ctx.fillStyle = text;
  ctx.font = `700 30px ${font}`;
  const foot =
    s.grand && grand.kind === 'locked' && grand.daysLeft > 0
      ? `Gran premio: ${s.grand.name} · ${grand.required ? `${grand.victories}/${grand.required} semanas victoriosas` : `faltan ${grand.daysLeft} días`}`
      : prize
        ? `Próximo premio: día ${prize.day} · Bs ${prize.prize.price}`
        : 'Un día limpio a la vez.';
  ctx.fillText(foot.length > 52 ? `${foot.slice(0, 51)}…` : foot, P, H - 64);
  ctx.fillStyle = muted;
  ctx.font = `500 24px ${font}`;
  ctx.fillText(`Bitácora · ${todayISO()}`, P, H - 28);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'));
}
