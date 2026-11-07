import { useMemo, useState } from 'react';
import { formatShort, type ISODate } from '../lib/dates';

export interface MountainPoint {
  date: ISODate;
  pct: number;
  avg7: number;
  won: boolean;
}

interface Props {
  data: MountainPoint[];
  goal: number;
  /** Días mínimos que muestra el eje (para que pocos días no se vean como una aguja). */
  minDays?: number;
  onPick?: (d: ISODate) => void;
  height?: number;
}

const W = 340;
const PAD = { top: 14, right: 10, bottom: 22, left: 30 };

/** Gráfico de montaña: tu porcentaje de cada día, la meta y tu promedio de 7 días. */
export function Mountain({ data, goal, minDays = 14, onPick, height = 190 }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const H = height;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const n = Math.max(minDays, data.length, 2);
  const x = (i: number) => PAD.left + (i / (n - 1)) * iw;
  const y = (v: number) => PAD.top + (1 - v / 100) * ih;

  const { area, line, avg } = useMemo(() => {
    if (!data.length) return { area: '', line: '', avg: '' };
    const smooth = (p: readonly (readonly [number, number])[]) => {
      if (p.length < 2) return `M${p[0]![0]},${p[0]![1]}`;
      let d = `M${p[0]![0]},${p[0]![1]}`;
      for (let i = 1; i < p.length; i++) {
        const [x0, y0] = p[i - 1]!;
        const [x1, y1] = p[i]!;
        const cx = (x0 + x1) / 2;
        d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
      }
      return d;
    };
    // La montaña es tu promedio de 7 días (suave); tu porcentaje de cada día va como línea fina y puntos.
    const mtn = data.map((p, i) => [x(i), y(p.avg7)] as const);
    const av = smooth(mtn);
    const last = mtn[mtn.length - 1]!;
    const a = `${av} L${last[0]},${y(0)} L${mtn[0]![0]},${y(0)} Z`;
    const l = smooth(data.map((p, i) => [x(i), y(p.pct)] as const));
    return { area: a, line: l, avg: av };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, n, H]);

  const picked = sel !== null ? data[sel] : null;
  const pickAt = (clientX: number, target: SVGSVGElement) => {
    if (!data.length) return;
    const r = target.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.left) / iw) * (n - 1));
    setSel(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div className="mountain">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Tu porcentaje diario. Meta ${goal}%.`}
        onPointerDown={(e) => pickAt(e.clientX, e.currentTarget)}
        onPointerMove={(e) => e.buttons && pickAt(e.clientX, e.currentTarget)}
      >
        <defs>
          <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="mtn-grid" />
            <text x={PAD.left - 6} y={y(v) + 3.5} className="mtn-axis" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} className="mtn-goal" />
        <text x={W - PAD.right} y={y(goal) - 5} className="mtn-goal-label" textAnchor="end">
          meta {goal}%
        </text>
        {data.length > 0 && (
          <>
            <path d={area} fill="url(#mtn)" />
            <path d={avg} className="mtn-line" />
            {data.length > 1 && <path d={line} className="mtn-daily" />}
            {data.map((p, i) => (
              <circle key={p.date} cx={x(i)} cy={y(p.pct)} r={p.won ? 3 : 2.4} className={p.won ? 'mtn-dot' : 'mtn-dot off'} />
            ))}
          </>
        )}
        {picked && sel !== null && (
          <g>
            <line x1={x(sel)} x2={x(sel)} y1={PAD.top} y2={y(0)} className="mtn-cursor" />
            <circle cx={x(sel)} cy={y(picked.pct)} r={5} className="mtn-pick" />
          </g>
        )}
        <text x={PAD.left} y={H - 6} className="mtn-axis">
          {data[0] ? formatShort(data[0].date) : ''}
        </text>
        <text x={W - PAD.right} y={H - 6} className="mtn-axis" textAnchor="end">
          {data.length >= n ? `día ${data.length}` : `día ${n}`}
        </text>
      </svg>
      <div className="mtn-legend">
        <span>
          <i className="sw-area" /> Tu montaña (promedio 7 días)
        </span>
        <span>
          <i className="sw-avg" /> Cada día
        </span>
        <span>
          <i className="sw-goal" /> Meta
        </span>
      </div>
      {picked && (
        <div className="mtn-tip">
          <span>
            <b>{formatShort(picked.date)}</b> · {Math.round(picked.pct)}%{picked.won ? ' · ganado' : ''} · promedio {Math.round(picked.avg7)}%
          </span>
          {onPick && (
            <button type="button" className="link-btn" onClick={() => onPick(picked.date)}>
              Ver el día
            </button>
          )}
        </div>
      )}
    </div>
  );
}
