import { formatRange } from '../lib/dates';
import { TIERS, type BadgeBlock } from '../lib/badges';
import { Icon } from './Icon';

/** Tus insignias: una cada 2 semanas, de Bronce a Leyenda. */
export function BadgesCard({ blocks, rule }: { blocks: BadgeBlock[]; rule: string }) {
  const earned = blocks.filter((b) => b.status === 'earned').length;
  const current = blocks.find((b) => b.status === 'open');
  return (
    <section className="card badges" aria-label="Insignias">
      <div className="reward-head">
        <div className="card-title">Insignias</div>
        <span className="badge claimed">
          {earned} de {TIERS.length}
        </span>
      </div>
      <div className="medals">
        {TIERS.map((t, i) => (
          <div key={t} className={`medal ${i < earned ? `on tier-${i + 1}` : ''}`} aria-label={`${t}: ${i < earned ? 'ganada' : 'por ganar'}`}>
            <span className="medal-disc">
              <Icon name={i === TIERS.length - 1 ? 'trophy' : 'star'} size={20} />
            </span>
            <span className="medal-name">{t}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 10, fontSize: 13.5 }}>
        {current
          ? `Semanas ${current.weeks[0]} y ${current.weeks[1]} (${formatRange(current.start, current.end)}): llevas ${Math.round(current.pct)} % · ${rule}`
          : earned >= TIERS.length
            ? '¡Leyenda! Completaste todas las insignias del ciclo.'
            : rule}
      </p>
    </section>
  );
}
