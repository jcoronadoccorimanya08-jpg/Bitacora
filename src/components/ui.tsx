import { useEffect, useRef, useState, type ReactNode } from 'react';
import { onToast, type ToastTone } from '../lib/feedback';
import { Icon, type IconName } from './Icon';

export type Tab = 'hoy' | 'premios' | 'analisis' | 'ajustes';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'hoy', label: 'Hoy', icon: 'today' },
  { id: 'premios', label: 'Premios', icon: 'gift' },
  { id: 'analisis', label: 'Análisis', icon: 'chart' },
  { id: 'ajustes', label: 'Ajustes', icon: 'sliders' },
];

export function BottomNav({ tab, onChange, rewardsPending }: { tab: Tab; onChange: (t: Tab) => void; rewardsPending: number }) {
  return (
    <nav className="nav" aria-label="Secciones">
      <div className="nav-inner">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="nav-icon">
              <Icon name={t.icon} />
              {t.id === 'premios' && rewardsPending > 0 && <span className="nav-badge" aria-label={`${rewardsPending} por reclamar`} />}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; tone: ToastTone; key: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    const off = onToast((text, tone) => {
      setMsg({ text, tone, key: Date.now() });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), tone === 'reward' ? 3200 : 2200);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div className={`toast ${msg ? 'show' : ''} ${msg?.tone ?? ''}`} role="status" aria-live="polite">
      {msg?.text}
    </div>
  );
}

export function ProgressRing({ value, max, size = 58, label }: { value: number; max: number; size?: number; label: ReactNode }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-value"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">{label}</div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="dlg-title">
      <h2 id="dlg-title" className="dlg-title">{title}</h2>
      <div className="dlg-body">{body}</div>
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'danger-solid' : 'primary'}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {aside && <span>{aside}</span>}
    </div>
  );
}

export function ScreenHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="screen-head">
      <div className="screen-head-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
