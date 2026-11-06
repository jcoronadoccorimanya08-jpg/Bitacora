import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { PinPad } from '../components/PinPad';
import { checkForUpdate } from '../components/UpdateBanner';
import { ConfirmDialog, ScreenHeader, SectionTitle } from '../components/ui';
import { canShareFiles, downloadText, openBackup, parseFile, serializeBackup, shareText } from '../lib/backup';
import { AUTOLOCK_OPTIONS, MAX_HABITS, MAX_TRIGGERS } from '../lib/config';
import type { Sealed } from '../lib/crypto';
import { diffDays, formatLong, formatShort, isValidISODate, localDateOf, nextMonday, plural, weekday, type ISODate } from '../lib/dates';
import { toast } from '../lib/feedback';
import { useInstallPrompt } from '../lib/hooks';
import { buildReport } from '../lib/report';
import { actions, changePin, currentSealed, lock, replaceState, verifyPin, wipeAll } from '../lib/store';
import type { AppState, Habit, Theme } from '../lib/types';

type Pending =
  | { kind: 'start'; date: ISODate }
  | { kind: 'restart'; date: ISODate }
  | { kind: 'restore'; state: AppState }
  | { kind: 'config'; habits: Habit[]; triggers: string[] }
  | { kind: 'removeHabit'; habit: Habit }
  | { kind: 'reset' }
  | null;

type Overlay = { kind: 'pin' } | { kind: 'backupPin'; sealed: Sealed } | null;

export function SettingsScreen({ state, today }: { state: AppState; today: ISODate }) {
  const s = state.settings;
  const [pending, setPending] = useState<Pending>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [newTrigger, setNewTrigger] = useState('');
  const [newHabit, setNewHabit] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { installed, canInstall, install } = useInstallPrompt();
  const shareFiles = canShareFiles();
  const restartDate = weekday(today) === 1 ? today : nextMonday(today);
  const report = buildReport(state, today);

  const backup = async (mode: 'share' | 'download') => {
    try {
      const sealed = await currentSealed();
      if (!sealed) return;
      const json = serializeBackup(sealed);
      if (mode === 'share') {
        if ((await shareText(json)) === 'cancelled') return;
      } else downloadText(json);
      actions.markBackup();
      toast('Respaldo cifrado listo.', 'success');
    } catch {
      toast('No se pudo crear el respaldo.', 'error');
    }
  };

  const onFile = async (file: File) => {
    try {
      const parsed = parseFile(await file.text());
      if (parsed.kind === 'config') setPending({ kind: 'config', habits: parsed.habits, triggers: parsed.triggers });
      else setOverlay({ kind: 'backupPin', sealed: parsed.sealed });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Archivo inválido.', 'error');
    }
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast('Reporte copiado.', 'success');
    } catch {
      toast('No se pudo copiar. Usa "Compartir".', 'error');
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

      <SectionTitle aside={`${s.habits.length}/${MAX_HABITS}`}>Hábitos</SectionTitle>
      <div className="group">
        {s.habits.map((h, i) => (
          <div key={h.id} className="habit-edit">
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
              <div className="habit-actions">
                <button type="button" className="btn sm" disabled={i === 0} onClick={() => actions.moveHabit(h.id, -1)}>
                  <Icon name="chevronUp" size={16} /> Subir
                </button>
                <button type="button" className="btn sm danger" disabled={s.habits.length <= 1} onClick={() => setPending({ kind: 'removeHabit', habit: h })}>
                  <Icon name="trash" size={16} /> Quitar
                </button>
              </div>
            </details>
          </div>
        ))}
        {s.habits.length < MAX_HABITS && (
          <AddRow
            value={newHabit}
            setValue={setNewHabit}
            placeholder="Nuevo hábito"
            onAdd={() => {
              actions.addHabit(newHabit);
              setNewHabit('');
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
                <button type="button" aria-label={`Quitar ${t}`} onClick={() => actions.removeTrigger(t)}>
                  <Icon name="x" size={15} />
                </button>
              </span>
            ))}
          </div>
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
        <Item title="Empezar un ciclo nuevo" note="Reinicia la racha y los premios. Tus hábitos se conservan.">
          <button type="button" className="btn sm" onClick={() => setPending({ kind: 'restart', date: restartDate })}>
            Nuevo
          </button>
        </Item>
      </div>

      <SectionTitle>Privacidad</SectionTitle>
      <div className="group">
        <div className="item col">
          <div className="txt">
            <b>Pedir el PIN</b>
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
        <Item title="Cambiar PIN">
          <button type="button" className="btn sm" onClick={() => setOverlay({ kind: 'pin' })}>
            <Icon name="lock" size={16} /> Cambiar
          </button>
        </Item>
        <Item title="Bloquear ahora">
          <button type="button" className="btn sm" onClick={lock}>
            Bloquear
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

      <SectionTitle>Reporte para Claude</SectionTitle>
      <div className="group">
        <div className="item col">
          <div className="txt">
            <b>Tu semana en texto</b>
            <span>Pégalo en Claude para recibir un análisis sin juicios.</span>
          </div>
          <div className="warn-note">
            <Icon name="alert" size={16} />
            Incluye tus hábitos y caídas. Compártelo solo donde tú quieras.
          </div>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void copyReport()}>
              <Icon name="copy" size={18} /> Copiar
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.share({ text: report });
                } catch (err) {
                  if (!(err instanceof DOMException && err.name === 'AbortError')) void copyReport();
                }
              }}
            >
              <Icon name="share" size={18} /> Compartir
            </button>
          </div>
          <details>
            <summary>Ver el reporte</summary>
            <pre className="report-preview">{report}</pre>
          </details>
        </div>
      </div>

      <SectionTitle>Respaldo</SectionTitle>
      <div className="group">
        <div className="item col">
          <div className="txt">
            <b>Copia de seguridad cifrada</b>
            <span>{lastBackupText} Solo se abre con tu PIN. Guárdala en Drive para no perder tu historial si cambias de teléfono.</span>
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            {shareFiles && (
              <button type="button" className="btn primary block" onClick={() => void backup('share')}>
                <Icon name="share" size={18} /> Guardar en Drive o compartir
              </button>
            )}
            <button type="button" className={`btn block ${shareFiles ? '' : 'primary'}`} onClick={() => void backup('download')}>
              <Icon name="download" size={18} /> Descargar archivo
            </button>
            <button type="button" className="btn block" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={18} /> Restaurar o cargar configuración
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <SectionTitle>App</SectionTitle>
      <div className="group">
        <Item
          title={installed ? 'Instalada en tu teléfono' : 'Instalar en tu teléfono'}
          note={installed ? 'Ábrela desde su ícono.' : canInstall ? 'Queda con su ícono y funciona sin internet.' : 'En Chrome: menú ⋮ → «Instalar aplicación».'}
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

      <SectionTitle>Zona de cuidado</SectionTitle>
      <div className="group">
        <Item title="Borrar todo" note="Elimina tu bitácora de este teléfono. No se puede deshacer.">
          <button type="button" className="btn danger sm" onClick={() => setPending({ kind: 'reset' })}>
            Borrar
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
          if (pending.kind === 'start') actions.setStartDate(pending.date);
          else if (pending.kind === 'restart') {
            actions.restartCycle(pending.date);
            toast('Ciclo nuevo listo.', 'success');
          } else if (pending.kind === 'restore') {
            replaceState(pending.state);
            toast('Respaldo restaurado. Sigue con tu PIN actual.', 'success');
          } else if (pending.kind === 'config') {
            actions.applyConfig(pending.habits, pending.triggers);
            toast('Configuración aplicada.', 'success');
          } else if (pending.kind === 'removeHabit') actions.removeHabit(pending.habit.id);
          else if (pending.kind === 'reset') void wipeAll();
        }}
      />

      {overlay?.kind === 'pin' && <ChangePin onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'backupPin' && (
        <BackupPin
          sealed={overlay.sealed}
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
        body: `El nuevo ciclo empezaría el ${formatLong(p.date)}. La racha y los premios se reinician; tus hábitos se conservan. Haz un respaldo antes si quieres guardar este ciclo.`,
        confirmLabel: 'Empezar',
      };
    case 'restore':
      return { title: 'Restaurar respaldo', body: 'Esto reemplaza todos los datos actuales por los del respaldo.', confirmLabel: 'Restaurar', danger: true };
    case 'config':
      return {
        title: 'Aplicar configuración',
        body: `Tus hábitos pasarán a ser: ${p.habits.map((h) => h.name).join(', ')}. El historial se conserva.`,
        confirmLabel: 'Aplicar',
      };
    case 'removeHabit':
      return { title: `Quitar «${p.habit.name}»`, body: 'Deja de aparecer en tu día. Lo ya marcado queda guardado.', confirmLabel: 'Quitar', danger: true };
    case 'reset':
      return { title: '¿Borrar todo?', body: 'Se elimina tu bitácora de este teléfono. Solo podrás recuperarla con un respaldo y su PIN.', confirmLabel: 'Borrar todo', danger: true };
    default:
      return { title: '', body: '', confirmLabel: 'Aceptar' };
  }
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string>();
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const title = step === 'current' ? 'Tu PIN actual' : step === 'new' ? 'Nuevo PIN' : 'Repite el nuevo PIN';
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Cambiar PIN">
      <button type="button" className="icon-btn overlay-close" aria-label="Cerrar" onClick={onClose}>
        <Icon name="x" />
      </button>
      <main className="lock">
        <h1>{title}</h1>
        <PinPad
          key={step}
          busy={busy}
          error={busy ? 'Un momento…' : error}
          resetKey={reset}
          onSubmit={async (pin) => {
            if (step === 'current') {
              setBusy(true);
              const ok = await verifyPin(pin);
              setBusy(false);
              if (!ok) {
                setError('PIN incorrecto.');
                setReset((r) => r + 1);
                return;
              }
              setError(undefined);
              setStep('new');
            } else if (step === 'new') {
              setFirst(pin);
              setStep('confirm');
            } else if (pin !== first) {
              setError('No coincide. Vuelve a escribir el nuevo PIN.');
              setStep('new');
              setReset((r) => r + 1);
            } else {
              setBusy(true);
              await changePin(pin);
              toast('PIN actualizado. Haz un respaldo nuevo.', 'success');
              onClose();
            }
          }}
        />
      </main>
    </div>
  );
}

function BackupPin({ sealed, onClose, onOpened }: { sealed: Sealed; onClose: () => void; onOpened: (s: AppState) => void }) {
  const [error, setError] = useState<string>();
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="PIN del respaldo">
      <button type="button" className="icon-btn overlay-close" aria-label="Cerrar" onClick={onClose}>
        <Icon name="x" />
      </button>
      <main className="lock">
        <h1>PIN del respaldo</h1>
        <p>El que tenías cuando hiciste este respaldo.</p>
        <PinPad
          busy={busy}
          error={busy ? 'Abriendo…' : error}
          resetKey={reset}
          onSubmit={async (pin) => {
            setBusy(true);
            try {
              onOpened(await openBackup(sealed, pin));
            } catch (err) {
              setBusy(false);
              setError(err instanceof Error && err.message === 'PIN' ? 'PIN incorrecto.' : 'No se pudo abrir.');
              setReset((r) => r + 1);
            }
          }}
        />
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
