import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { PatternPad } from '../components/PatternPad';
import { checkForUpdate } from '../components/UpdateBanner';
import { ConfirmDialog, ScreenHeader, SectionTitle } from '../components/ui';
import { canShareFiles, downloadBackupText, parseFile, serializeBackup, shareBackupText, type ConfigData } from '../lib/backup';
import { AUTOLOCK_OPTIONS, MAX_HABITS, MAX_TRIGGERS } from '../lib/config';
import { diffDays, formatLong, formatShort, isValidISODate, localDateOf, plural, type ISODate } from '../lib/dates';
import { cycleEnd } from '../lib/engine';
import { toast } from '../lib/feedback';
import { useInstallPrompt } from '../lib/hooks';
import {
  actions,
  biometricSupport,
  changePattern,
  currentBackup,
  disableBiometric,
  enableBiometric,
  lock,
  openBackup,
  replaceState,
  verifyPattern,
} from '../lib/store';
import type { AppState, GrandPrize, Habit, HabitValue, Theme } from '../lib/types';
import type { VaultRecord } from '../lib/vault';

type Pending =
  | { kind: 'start'; date: ISODate }
  | { kind: 'restart'; date: ISODate }
  | { kind: 'restore'; state: AppState }
  | ({ kind: 'config' } & ConfigData)
  | null;

type Overlay = { kind: 'pattern' } | { kind: 'backup'; record: Pick<VaultRecord, 'lock' | 'data'> } | null;

export function SettingsScreen({ state, today, hasBio }: { state: AppState; today: ISODate; hasBio: boolean }) {
  const s = state.settings;
  const [pending, setPending] = useState<Pending>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [newTrigger, setNewTrigger] = useState('');
  const [newHabit, setNewHabit] = useState('');
  const [bioSupport, setBioSupport] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { installed, canInstall, install } = useInstallPrompt();
  const shareFiles = canShareFiles();

  useEffect(() => {
    void biometricSupport().then(setBioSupport);
  }, []);

  const doBackup = async (mode: 'share' | 'download' | 'copy') => {
    try {
      const rec = await currentBackup();
      if (!rec) return;
      const text = serializeBackup(rec);
      if (mode === 'share') {
        if ((await shareBackupText(text)) === 'cancelled') return;
      } else if (mode === 'download') downloadBackupText(text);
      else await navigator.clipboard.writeText(text);
      actions.markBackup();
      toast(mode === 'copy' ? 'Respaldo copiado. Pégalo en una nota privada o en Drive.' : 'Respaldo listo.', 'success');
    } catch {
      toast('No se pudo crear el respaldo. Prueba con «Copiar».', 'error');
    }
  };

  const readText = (text: string) => {
    try {
      const parsed = parseFile(text);
      if (parsed.kind === 'backup') setOverlay({ kind: 'backup', record: parsed.record });
      else {
        const { kind: _k, ...config } = parsed;
        void _k;
        setPending({ kind: 'config', ...config });
      }
      setPaste(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Archivo inválido.', 'error');
    }
  };

  const lastBackup = s.lastBackupAt ? localDateOf(s.lastBackupAt) : null;
  const lastBackupText = !lastBackup
    ? 'Todavía no hiciste ningún respaldo.'
    : lastBackup === today
      ? 'Último respaldo: hoy.'
      : `Último respaldo: hace ${plural(diffDays(lastBackup, today), 'día', 'días')} (${formatShort(lastBackup)}).`;

  return (
    <>
      <ScreenHeader eyebrow="Ajustes" title="Tu bitácora" subtitle="Cifrada y guardada solo en este teléfono." />

      <SectionTitle>Seguridad</SectionTitle>
      <div className="group">
        <Item
          title="Entrar con huella"
          note={
            hasBio
              ? 'Activada. El patrón sigue sirviendo si la huella falla.'
              : bioSupport === 'no'
                ? 'Tu teléfono o tu Chrome no lo permiten. Sigue con tu patrón.'
                : 'Más rápido que el patrón. Tus datos siguen cifrados.'
          }
        >
          {hasBio ? (
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                await disableBiometric();
                toast('Huella desactivada.');
              }}
            >
              Quitar
            </button>
          ) : bioSupport !== 'no' ? (
            <button
              type="button"
              className="btn primary sm"
              onClick={async () => {
                try {
                  await enableBiometric();
                  toast('Huella activada.', 'success');
                } catch (e) {
                  const m = e instanceof Error ? e.message : '';
                  toast(m === 'NOPRF' ? 'Tu teléfono no permite usar la huella aquí.' : 'No se activó la huella.', 'error');
                  if (m === 'NOPRF') setBioSupport('no');
                }
              }}
            >
              <Icon name="fingerprint" size={17} /> Activar
            </button>
          ) : null}
        </Item>
        <Item title="Cambiar patrón">
          <button type="button" className="btn sm" onClick={() => setOverlay({ kind: 'pattern' })}>
            Cambiar
          </button>
        </Item>
        <div className="item col">
          <div className="txt">
            <b>Pedir el patrón</b>
            <span>Cuando sales de la app y vuelves.</span>
          </div>
          <div className="segmented" role="group" aria-label="Bloqueo automático" style={{ marginTop: 10 }}>
            {AUTOLOCK_OPTIONS.map((m) => (
              <button key={m} type="button" aria-pressed={s.autoLockMinutes === m} onClick={() => actions.setAutoLock(m)}>
                {m === 0 ? 'Al salir' : `${m} min`}
              </button>
            ))}
          </div>
        </div>
        <Item title="Bloquear ahora">
          <button type="button" className="btn sm" onClick={lock}>
            <Icon name="lock" size={16} /> Bloquear
          </button>
        </Item>
      </div>

      <SectionTitle aside={`${s.habits.length}/${MAX_HABITS}`}>Hábitos</SectionTitle>
      <div className="group">
        {s.habits.map((h, i) => (
          <HabitEditor key={h.id} habit={h} index={i} />
        ))}
        {s.habits.length < MAX_HABITS && (
          <AddRow
            value={newHabit}
            setValue={setNewHabit}
            placeholder="Nuevo hábito"
            onAdd={() => {
              actions.addHabit(newHabit);
              setNewHabit('');
              toast('Hábito agregado.');
            }}
          />
        )}
      </div>

      <SectionTitle aside={`${s.triggers.length}/${MAX_TRIGGERS}`}>Disparadores</SectionTitle>
      <div className="group">
        <div className="item col">
          <div className="tchips">
            {s.triggers.map((t) => (
              <span key={t} className="tag-chip">
                {t}
                <button type="button" aria-label={`Sacar ${t} de la lista`} onClick={() => actions.removeTrigger(t)}>
                  <Icon name="x" size={15} />
                </button>
              </span>
            ))}
          </div>
          <span className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Sacar uno de la lista no cambia tu historial.
          </span>
        </div>
        {s.triggers.length < MAX_TRIGGERS && (
          <AddRow
            value={newTrigger}
            setValue={setNewTrigger}
            placeholder="Nuevo disparador"
            onAdd={() => {
              actions.addTrigger(newTrigger);
              setNewTrigger('');
            }}
          />
        )}
      </div>

      <SectionTitle>Ahorro y gran premio</SectionTitle>
      <div className="group">
        <Stepper
          title="«Dije no a una fiesta»"
          note={s.partyBonus ? `Cada vez suma Bs ${s.partyBonus} a tu ahorro.` : 'Botón apagado. Súbelo para mostrarlo en Hoy.'}
          value={s.partyBonus}
          min={0}
          max={2000}
          step={10}
          prefix="Bs "
          onChange={(v) => actions.setPartyBonus(v)}
        />
        <GrandEditor grand={s.grand} defaultDate={cycleEnd(s)} />
      </div>

      <SectionTitle>Ciclo</SectionTitle>
      <div className="group">
        <Item title="Inicio del ciclo" note={`${formatLong(s.startDate)} · ${s.cycleLength} días`}>
          <input
            className="field"
            type="date"
            value={s.startDate}
            aria-label="Fecha de inicio"
            onChange={(e) => {
              const v = e.target.value;
              if (isValidISODate(v) && v !== s.startDate) setPending({ kind: 'start', date: v });
            }}
          />
        </Item>
        <Item title="Empezar un ciclo nuevo" note="Reinicia la racha, los premios y los cofres. Tus hábitos y tu historial se conservan.">
          <button type="button" className="btn sm" onClick={() => setPending({ kind: 'restart', date: today })}>
            Nuevo
          </button>
        </Item>
      </div>

      <SectionTitle>Apariencia</SectionTitle>
      <div className="group">
        <div className="item col">
          <div className="segmented" role="group" aria-label="Tema">
            {(
              [
                ['system', 'Automático'],
                ['dark', 'Oscuro'],
                ['light', 'Claro'],
              ] as [Theme, string][]
            ).map(([t, label]) => (
              <button key={t} type="button" aria-pressed={s.theme === t} onClick={() => actions.setTheme(t)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionTitle>Respaldo</SectionTitle>
      <div className="group">
        <div className="item col">
          <div className="txt">
            <b>Copia de seguridad cifrada</b>
            <span>{lastBackupText} Se abre solo con tu patrón. Guárdala en Drive por si cambias de teléfono.</span>
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            {shareFiles && (
              <button type="button" className="btn primary block" onClick={() => void doBackup('share')}>
                <Icon name="share" size={18} /> Guardar en Drive o compartir
              </button>
            )}
            <button type="button" className={`btn block ${shareFiles ? '' : 'primary'}`} onClick={() => void doBackup('download')}>
              <Icon name="download" size={18} /> Guardar en el celular
            </button>
            <button type="button" className="btn block" onClick={() => void doBackup('copy')}>
              <Icon name="copy" size={18} /> Copiar respaldo
            </button>
            <button type="button" className="btn ghost block" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18} /> Restaurar o cargar configuración
            </button>
            <button type="button" className="btn ghost block" onClick={() => setPaste(paste === null ? '' : null)}>
              Pegar un respaldo o una configuración
            </button>
            {paste !== null && (
              <div className="paste-box">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Pega aquí el texto"
                  aria-label="Texto del respaldo o de la configuración"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <button type="button" className="btn primary block" disabled={!paste.trim()} onClick={() => readText(paste)}>
                  Usar este texto
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="text/plain,.txt,application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) readText(await f.text());
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <SectionTitle>App</SectionTitle>
      <div className="group">
        <Item
          title={installed ? 'Instalada en tu teléfono' : 'Instalar en tu teléfono'}
          note={installed ? 'Ábrela desde su ícono. Funciona sin internet.' : canInstall ? 'Queda con su ícono y funciona sin internet.' : 'En Chrome: menú ⋮ → «Instalar aplicación».'}
        >
          {canInstall ? (
            <button type="button" className="btn primary sm" onClick={() => void install()}>
              <Icon name="phone" size={17} /> Instalar
            </button>
          ) : null}
        </Item>
        <Item title="Actualizaciones" note={`Versión ${__APP_VERSION__}`}>
          <button
            type="button"
            className="btn sm"
            onClick={async () => {
              const found = await checkForUpdate().catch(() => false);
              toast(found ? 'Descargando la versión nueva…' : 'Ya tienes la última versión.');
            }}
          >
            <Icon name="refresh" size={17} /> Buscar
          </button>
        </Item>
      </div>

      <p className="fine">Bitácora · sin cuentas, sin servidores. Tus datos no salen de este teléfono.</p>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        {...confirmContent(pending)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'start') {
            actions.setStartDate(pending.date);
            toast('Fecha de inicio actualizada.');
          } else if (pending.kind === 'restart') {
            actions.restartCycle(pending.date);
            toast('Ciclo nuevo listo.', 'success');
          } else if (pending.kind === 'restore') {
            replaceState(pending.state);
            toast('Respaldo restaurado. Sigues con tu patrón actual.', 'success');
          } else if (pending.kind === 'config') {
            const { kind: _k, ...config } = pending;
            void _k;
            actions.applyConfig(config);
            toast('Configuración aplicada.', 'success');
          }
        }}
      />

      {overlay?.kind === 'pattern' && <ChangePattern onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'backup' && (
        <BackupPattern
          record={overlay.record}
          onClose={() => setOverlay(null)}
          onOpened={(st) => {
            setOverlay(null);
            setPending({ kind: 'restore', state: st });
          }}
        />
      )}
    </>
  );
}

function confirmContent(p: Pending): { title: string; body: ReactNode; confirmLabel: string; danger?: boolean } {
  switch (p?.kind) {
    case 'start':
      return { title: 'Cambiar la fecha de inicio', body: `Tu ciclo empezaría el ${formatLong(p.date)}. Tus marcas se conservan por fecha.`, confirmLabel: 'Cambiar' };
    case 'restart':
      return {
        title: 'Empezar un ciclo nuevo',
        body: `El nuevo ciclo empezaría hoy, ${formatLong(p.date)}. La racha, los premios y los cofres se reinician; tus hábitos y tu historial se conservan. Haz un respaldo antes si quieres guardar este ciclo.`,
        confirmLabel: 'Empezar',
      };
    case 'restore':
      return { title: 'Restaurar respaldo', body: 'Esto reemplaza los datos de este teléfono por los del respaldo.', confirmLabel: 'Restaurar', danger: true };
    case 'config':
      return {
        title: 'Aplicar configuración',
        body: `Tus hábitos pasarán a ser: ${p.habits.map((h) => h.name).join(', ')}.${p.milestones.length ? ` ${p.milestones.length} premios con precio.` : ''}${p.grand ? ` Gran premio: ${p.grand.name}.` : ''} Tu historial se conserva.`,
        confirmLabel: 'Aplicar',
      };
    default:
      return { title: '', body: '', confirmLabel: 'Aceptar' };
  }
}

const VALUE_KINDS: [HabitValue['kind'] | 'none', string][] = [
  ['none', 'Nada'],
  ['bs', 'Bs'],
  ['horas', 'Horas'],
  ['dias', 'Días'],
];

function HabitEditor({ habit: h, index: i }: { habit: Habit; index: number }) {
  const kind = h.value?.kind ?? 'none';
  return (
    <div className="habit-edit">
      <details className="habit-details">
        <summary>
          <Icon name="pencil" size={16} /> {i + 1}. {h.name}
        </summary>
        <Field label="Nombre" value={h.name} max={60} onCommit={(v) => v && actions.updateHabit(h.id, { name: v })} />
        <Field label="Pregunta del día" value={h.q} max={120} onCommit={(v) => v && actions.updateHabit(h.id, { q: v })} />
        <div className="row2">
          <Field label="Botón de cumplir" value={h.ok} max={24} onCommit={(v) => v && actions.updateHabit(h.id, { ok: v })} />
          <Field label="Botón de caída" value={h.fail} max={24} onCommit={(v) => v && actions.updateHabit(h.id, { fail: v })} />
        </div>
        <Field label="Tu frase" value={h.phrase} max={160} placeholder="Una frase para el momento difícil" onCommit={(v) => actions.updateHabit(h.id, { phrase: v })} />
        <div className="lbl-field">
          Cada día limpio suma
          <div className="segmented" role="group" aria-label={`Qué suma ${h.name}`} style={{ marginTop: 6 }}>
            {VALUE_KINDS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => actions.setHabitValue(h.id, k === 'none' ? null : { kind: k, amount: h.value?.amount || 1, ...(k === 'dias' ? { label: h.value?.label || h.name } : {}) })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {h.value && (
          <div className="row2">
            <label className="lbl-field">
              {h.value.kind === 'bs' ? 'Bs por día' : h.value.kind === 'horas' ? 'Horas por día' : 'Días por día'}
              <NumberField value={h.value.amount} label={`Cantidad de ${h.name}`} onCommit={(n) => actions.setHabitValue(h.id, { ...h.value!, amount: n })} />
            </label>
            {h.value.kind === 'dias' && (
              <label className="lbl-field">
                Se llama
                <Field label="Nombre del contador" value={h.value.label ?? ''} max={40} placeholder="Ej.: Mente clara" onCommit={(v) => actions.setHabitValue(h.id, { ...h.value!, label: v || h.name })} />
              </label>
            )}
          </div>
        )}
        <div className="habit-actions">
          <button type="button" className="btn sm" disabled={i === 0} onClick={() => actions.moveHabit(h.id, -1)}>
            <Icon name="chevronUp" size={16} /> Subir
          </button>
        </div>
      </details>
    </div>
  );
}

function GrandEditor({ grand, defaultDate }: { grand: GrandPrize | null; defaultDate: ISODate }) {
  const [name, setName] = useState(grand?.name ?? '');
  const [price, setPrice] = useState(grand?.price ? String(grand.price) : '');
  const [date, setDate] = useState(grand?.date ?? '');
  const [weeks, setWeeks] = useState(grand?.weeks ? String(grand.weeks) : '');
  const dirty =
    name.trim() !== (grand?.name ?? '') ||
    price !== (grand?.price ? String(grand.price) : '') ||
    date !== (grand?.date ?? '') ||
    weeks !== (grand?.weeks ? String(grand.weeks) : '');
  return (
    <div className="item col">
      <div className="txt">
        <b>Gran premio</b>
        <span>Lo ves todos los días arriba en Hoy. Se reclama {date && isValidISODate(date) ? `el ${formatLong(date)}` : `al final del ciclo (${formatLong(defaultDate)})`}.</span>
      </div>
      <label className="lbl-field">
        Nombre
        <input className="field" value={name} maxLength={60} placeholder="Tu gran premio" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row2">
        <label className="lbl-field">
          Precio (Bs)
          <input className="field" value={price} inputMode="numeric" placeholder="0" onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </label>
        <label className="lbl-field">
          Fecha (opcional)
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="lbl-field">
        Semanas victoriosas necesarias (con Val Q)
        <input
          className="field"
          value={weeks}
          inputMode="numeric"
          placeholder="Sin condición"
          onChange={(e) => setWeeks(e.target.value.replace(/\D/g, '').slice(0, 2))}
        />
      </label>
      <button
        type="button"
        className="btn primary block"
        style={{ marginTop: 10 }}
        disabled={!dirty || !name.trim()}
        onClick={() => {
          const g: GrandPrize = { name: name.trim() };
          if (price) g.price = Number(price);
          if (isValidISODate(date)) g.date = date;
          if (Number(weeks) > 0) g.weeks = Math.min(13, Number(weeks));
          actions.setGrand(g);
          toast('Gran premio guardado.', 'success');
        }}
      >
        Guardar gran premio
      </button>
    </div>
  );
}

function ChangePattern({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'current' | 'new' | 'repeat'>('current');
  const [first, setFirst] = useState('');
  const [err, setErr] = useState<string>();
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const title = step === 'current' ? 'Tu patrón actual' : step === 'new' ? 'Nuevo patrón' : 'Repite el nuevo patrón';
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Cambiar patrón">
      <button type="button" className="icon-btn overlay-close" aria-label="Cerrar" onClick={onClose}>
        <Icon name="x" />
      </button>
      <main className="lock">
        <h1>{title}</h1>
        <PatternPad
          key={step}
          resetKey={reset}
          error={Boolean(err)}
          disabled={busy}
          onComplete={async (p) => {
            if (step === 'current') {
              setBusy(true);
              const ok = await verifyPattern(p);
              setBusy(false);
              if (!ok) {
                setErr('Patrón incorrecto.');
                setReset((r) => r + 1);
                return;
              }
              setErr(undefined);
              setStep('new');
            } else if (step === 'new') {
              setFirst(p);
              setStep('repeat');
            } else if (p !== first) {
              setErr('No coincide. Dibuja otra vez el nuevo patrón.');
              setStep('new');
            } else {
              setBusy(true);
              await changePattern(p);
              toast('Patrón actualizado. Haz un respaldo nuevo.', 'success');
              onClose();
            }
          }}
        />
        <p className="pin-error" role="alert">
          {busy ? 'Un momento…' : (err ?? '')}
        </p>
      </main>
    </div>
  );
}

function BackupPattern({ record, onClose, onOpened }: { record: Pick<VaultRecord, 'lock' | 'data'>; onClose: () => void; onOpened: (s: AppState) => void }) {
  const [err, setErr] = useState<string>();
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Patrón del respaldo">
      <button type="button" className="icon-btn overlay-close" aria-label="Cerrar" onClick={onClose}>
        <Icon name="x" />
      </button>
      <main className="lock">
        <h1>Patrón del respaldo</h1>
        <p>El que tenías cuando hiciste este respaldo.</p>
        <PatternPad
          resetKey={reset}
          error={Boolean(err)}
          disabled={busy}
          onComplete={async (p) => {
            setBusy(true);
            const st = await openBackup(record, p);
            setBusy(false);
            if (!st) {
              setErr('Patrón incorrecto.');
              setReset((r) => r + 1);
              return;
            }
            onOpened(st);
          }}
        />
        <p className="pin-error" role="alert">
          {busy ? 'Abriendo…' : (err ?? '')}
        </p>
      </main>
    </div>
  );
}

function Item({ title, note, children }: { title: string; note?: string; children?: ReactNode }) {
  return (
    <div className="item">
      <div className="txt">
        <b>{title}</b>
        {note && <span>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Stepper(props: { title: string; note: string; value: number; min: number; max: number; step: number; prefix?: string; suffix?: string; onChange: (v: number) => void }) {
  const { title, note, value, min, max, step, prefix = '', suffix = '', onChange } = props;
  return (
    <Item title={title} note={note}>
      <div className="stepper">
        <button type="button" aria-label={`Bajar ${title}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <output aria-live="polite">
          {prefix}
          {value}
          {suffix}
        </output>
        <button type="button" aria-label={`Subir ${title}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </Item>
  );
}

function Field({ label, value, max, placeholder, onCommit }: { label: string; value: string; max: number; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setV(value);
  }
  return (
    <input
      className="field"
      type="text"
      value={v}
      maxLength={max}
      placeholder={placeholder ?? label}
      aria-label={label}
      enterKeyHint="done"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const clean = v.trim();
        if (clean !== value) onCommit(clean);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function NumberField({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value).replace('.', ','));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setV(String(value).replace('.', ','));
  }
  return (
    <input
      className="field"
      value={v}
      inputMode="decimal"
      aria-label={label}
      enterKeyHint="done"
      onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))}
      onBlur={() => {
        const n = Number(v.replace(',', '.'));
        if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(Math.round(n * 100) / 100);
        else setV(String(value).replace('.', ','));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function AddRow({ value, setValue, placeholder, onAdd }: { value: string; setValue: (v: string) => void; placeholder: string; onAdd: () => void }) {
  return (
    <div className="add-row">
      <input
        className="field"
        value={value}
        maxLength={60}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onAdd();
        }}
      />
      <button type="button" className="btn primary" aria-label="Agregar" disabled={!value.trim()} onClick={onAdd}>
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}
