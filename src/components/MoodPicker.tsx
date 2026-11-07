import type { Mood } from '../lib/types';

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Muy mal' },
  { value: 2, emoji: '😕', label: 'Mal' },
  { value: 3, emoji: '😐', label: 'Normal' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
];

export function moodEmoji(m: Mood): string {
  return MOODS.find((x) => x.value === m)?.emoji ?? '';
}

/** Ánimo del día con un toque. Tocar el mismo otra vez lo quita. */
export function MoodPicker({ value, disabled, onChange }: { value?: Mood; disabled?: boolean; onChange: (m: Mood | null) => void }) {
  return (
    <section className="card mood" aria-label="Ánimo del día">
      <div className="card-title">¿Cómo estuvo tu ánimo?</div>
      <div className="mood-row" role="group" aria-label="Tu ánimo">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            className="mood-btn"
            aria-label={m.label}
            aria-pressed={value === m.value}
            disabled={disabled}
            onClick={() => onChange(value === m.value ? null : m.value)}
          >
            <span aria-hidden="true">{m.emoji}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Tu porcentaje según tu ánimo. */
export function MoodStatsCard({ stats, unit }: { stats: { mood: Mood; days: number; avgPct: number }[]; unit: string }) {
  if (!stats.length) return <p style={{ marginTop: 0 }}>Marca tu ánimo cada noche en Hoy y aquí verás cómo se relaciona con {unit}.</p>;
  return (
    <>
      {stats.map((m) => (
        <div key={m.mood} className="hstat">
          <div className="hstat-head">
            <b>
              <span aria-hidden="true">{moodEmoji(m.mood)}</span> {MOODS.find((x) => x.value === m.mood)?.label}
            </b>
            <span>
              {Math.round(m.avgPct)} % · {m.days} {m.days === 1 ? 'día' : 'días'}
            </span>
          </div>
          <div className="bar info">
            <i style={{ width: `${Math.round(m.avgPct)}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}
