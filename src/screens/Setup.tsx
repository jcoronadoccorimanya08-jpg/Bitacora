import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { InstallCard } from '../components/InstallCard';
import { PatternPad } from '../components/PatternPad';
import { parseFile, type ConfigData } from '../lib/backup';
import { APP_NAME, DEFAULT_TRIGGERS, HABIT_SUGGESTIONS, MAX_HABITS, NEW_HABIT, type HabitTemplate } from '../lib/config';
import { addDays, formatLong, formatRange, isValidISODate, type ISODate } from '../lib/dates';
import { toast } from '../lib/feedback';
import { slugId } from '../lib/sanitize';
import { createVault, initialState, openBackup } from '../lib/store';
import type { Habit } from '../lib/types';
import type { VaultRecord } from '../lib/vault';

type Step = 'welcome' | 'habits' | 'start' | 'pattern' | 'pattern2' | 'restorePattern';
type StartChoice = 'today' | 'tomorrow' | 'custom';
type Extras = Omit<ConfigData, 'habits' | 'triggers'>;

export function Setup({ today, updateBanner }: { today: ISODate; updateBanner?: ReactNode }) {
  const [step, setStep] = useState<Step>('welcome');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [triggers, setTriggers] = useState<string[]>(DEFAULT_TRIGGERS);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [custom, setCustom] = useState('');
  const tomorrow = addDays(today, 1);
  const [choice, setChoice] = useState<StartChoice>('tomorrow');
  const [customDate, setCustomDate] = useState<ISODate>(tomorrow);
  const start = choice === 'today' ? today : choice === 'tomorrow' ? tomorrow : customDate;
  const [first, setFirst] = useState('');
  const [err, setErr] = useState<string>();
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<Pick<VaultRecord, 'lock' | 'data'> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const addHabit = (t: HabitTemplate) => {
    setHabits((list) => {
      if (list.length >= MAX_HABITS || list.some((h) => h.name.toLowerCase() === t.name.toLowerCase())) return list;
      return [...list, { ...t, id: slugId(t.name, new Set(list.map((h) => h.id))) }];
    });
  };
  const removeHabit = (id: string) => setHabits((list) => list.filter((h) => h.id !== id));
  const moveUp = (i: number) =>
    setHabits((list) => {
      if (i <= 0) return list;
      const next = [...list];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return next;
    });

  const loadText = (text: string) => {
    try {
      const parsed = parseFile(text);
      if (parsed.kind === 'config') {
        setHabits(parsed.habits);
        setTriggers(parsed.triggers);
        setExtras({ milestones: parsed.milestones, grand: parsed.grand, partyBonus: parsed.partyBonus });
        toast('Configuración cargada. Revísala y sigue.', 'success');
        setStep('habits');
      } else {
        setBackup(parsed.record);
        setErr(undefined);
        setStep('restorePattern');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Archivo inválido.', 'error');
    }
  };

  const finish = async (pattern: string) => {
    setBusy(true);
    await createVault(pattern, initialState({ startDate: start, habits, triggers, ...(extras ?? {}) }));
    toast('Listo. Tu bitácora está protegida.', 'success');
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="text/plain,.txt,application/json,.json"
      hidden
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) loadText(await f.text());
        e.target.value = '';
      }}
    />
  );

  if (step === 'welcome') {
    return (
      <main className="onb">
        {updateBanner}
        <img className="onb-logo" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={68} height={68} />
        <div>
          <h1>{APP_NAME}</h1>
          <p className="lema">Un día limpio a la vez</p>
        </div>
        <InstallCard appName="Bitácora" />
        <ul className="pillars">
          <li>
            <span className="pi">
              <Icon name="flame" />
            </span>
            <div>
              <b>Una racha que perdona</b>
              <span>Una caída suelta no rompe la racha. Dos días seguidos sin día limpio, sí.</span>
            </div>
          </li>
          <li>
            <span className="pi">
              <Icon name="wallet" />
            </span>
            <div>
              <b>Tu ahorro crece solo</b>
              <span>Cada día limpio suma lo que no gastaste, el tiempo que recuperaste y tus días limpios.</span>
            </div>
          </li>
          <li>
            <span className="pi">
              <Icon name="gift" />
            </span>
            <div>
              <b>Un premio cada 7 días</b>
              <span>Premios con precio, pagados con tu ahorro, y cofres sorpresa con comodines.</span>
            </div>
          </li>
          <li>
            <span className="pi">
              <Icon name="fingerprint" />
            </span>
            <div>
              <b>Solo tuya</b>
              <span>Protegida con patrón y huella, y cifrada en este teléfono. Sin cuentas ni servidores.</span>
            </div>
          </li>
        </ul>
        <div className="stack">
          <button type="button" className="btn primary block" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Cargar mi configuración o un respaldo
          </button>
          <button type="button" className="btn block" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
            <Icon name="copy" size={18} /> Pegar mi configuración o un respaldo
          </button>
          {pasting && (
            <div className="paste-box">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder='Pega aquí el texto que empieza con {"app": "bitacora"'
                aria-label="Configuración o respaldo en texto"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button type="button" className="btn primary block" disabled={!pasted.trim()} onClick={() => loadText(pasted)}>
                Usar este texto
              </button>
            </div>
          )}
          <button type="button" className="btn ghost block" onClick={() => setStep('habits')}>
            Configurar a mano
          </button>
        </div>
        {fileInput}
      </main>
    );
  }

  if (step === 'habits') {
    const available = HABIT_SUGGESTIONS.filter((t) => !habits.some((h) => h.name.toLowerCase() === t.name.toLowerCase()));
    return (
      <main className="onb" style={{ justifyContent: 'flex-start' }}>
        <StepDots step={1} />
        <div>
          <h1 className="onb-title">¿Qué quieres dejar?</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Hasta {MAX_HABITS}, en orden de prioridad. En Ajustes cambias la pregunta, los botones, tu frase y lo que suma cada día limpio.
          </p>
        </div>
        {habits.length > 0 && (
          <ol className="selected-list" aria-label="Elegidos">
            {habits.map((h, i) => (
              <li key={h.id}>
                <span>
                  {i + 1}. {h.name}
                  {h.value && h.value.amount > 0 && (
                    <small className="muted"> · +{h.value.kind === 'bs' ? `Bs ${h.value.amount}` : h.value.kind === 'horas' ? `${h.value.amount}\u00a0h` : `${h.value.amount} día`}</small>
                  )}
                </span>
                <button type="button" className="icon-btn" aria-label={`Subir ${h.name}`} disabled={i === 0} onClick={() => moveUp(i)}>
                  <Icon name="chevronUp" size={20} />
                </button>
                <button type="button" className="icon-btn danger" aria-label={`Sacar ${h.name}`} onClick={() => removeHabit(h.id)}>
                  <Icon name="x" size={20} />
                </button>
              </li>
            ))}
          </ol>
        )}
        {extras && (extras.milestones.length > 0 || extras.grand) && (
          <p className="fine" style={{ textAlign: 'left' }}>
            {extras.milestones.length ? `${extras.milestones.length} premios con precio` : ''}
            {extras.milestones.length && extras.grand ? ' · ' : ''}
            {extras.grand ? `gran premio: ${extras.grand.name}` : ''}
            {extras.partyBonus ? ` · «Dije no a una fiesta» +Bs ${extras.partyBonus}` : ''}
          </p>
        )}
        {habits.length < MAX_HABITS && (
          <>
            <div className="sug">
              {available.map((t) => (
                <button key={t.name} type="button" className="chip" onClick={() => addHabit(t)}>
                  + {t.name}
                </button>
              ))}
            </div>
            <div className="add-row" style={{ padding: 0 }}>
              <input
                className="field"
                value={custom}
                maxLength={60}
                placeholder="Otro (escríbelo tú)"
                aria-label="Otro hábito"
                enterKeyHint="done"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && custom.trim()) {
                    addHabit({ ...NEW_HABIT, name: custom.trim() });
                    setCustom('');
                  }
                }}
              />
              <button
                type="button"
                className="btn primary"
                aria-label="Agregar"
                disabled={!custom.trim()}
                onClick={() => {
                  addHabit({ ...NEW_HABIT, name: custom.trim() });
                  setCustom('');
                }}
              >
                <Icon name="plus" size={20} />
              </button>
            </div>
          </>
        )}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setStep('welcome')}>
            Atrás
          </button>
          <button type="button" className="btn primary" disabled={!habits.length} onClick={() => setStep('start')}>
            Siguiente
          </button>
        </div>
      </main>
    );
  }

  if (step === 'start') {
    const valid = isValidISODate(start);
    const options: [StartChoice, string, string][] = [
      ['today', 'Hoy', formatLong(today)],
      ['tomorrow', 'Mañana', formatLong(tomorrow)],
    ];
    return (
      <main className="onb">
        <StepDots step={2} />
        <div>
          <h1 className="onb-title">¿Cuándo empiezas?</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Tu ciclo dura 90 días. Cada escalón cae cada 7 días de racha.
          </p>
        </div>
        <section>
          {options.map(([id, title, sub]) => (
            <button key={id} type="button" className="choice" aria-pressed={choice === id} onClick={() => setChoice(id)}>
              <span className="radio" />
              <div>
                <b>{title}</b>
                <span>{sub}</span>
              </div>
            </button>
          ))}
          <button type="button" className="choice" aria-pressed={choice === 'custom'} onClick={() => setChoice('custom')}>
            <span className="radio" />
            <div>
              <b>Otra fecha</b>
              <span>{choice === 'custom' && isValidISODate(customDate) ? formatLong(customDate) : 'Elige el día de inicio'}</span>
            </div>
          </button>
          {choice === 'custom' && (
            <input className="field" style={{ marginTop: 8 }} type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} aria-label="Fecha de inicio" />
          )}
        </section>
        {valid && <p className="fine">Ciclo: {formatRange(start, addDays(start, 89))}.</p>}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setStep('habits')}>
            Atrás
          </button>
          <button type="button" className="btn primary" disabled={!valid} onClick={() => setStep('pattern')}>
            Siguiente
          </button>
        </div>
      </main>
    );
  }

  if (step === 'pattern' || step === 'pattern2') {
    return (
      <main className="lock">
        <StepDots step={3} />
        <h1>{step === 'pattern' ? 'Crea tu patrón' : 'Repite tu patrón'}</h1>
        <p>
          {step === 'pattern'
            ? 'Une al menos 4 puntos. Te lo pedirá al abrir la app. Después puedes activar tu huella. Si lo olvidas no hay forma de recuperar los datos: haz respaldos.'
            : 'Dibújalo otra vez para confirmar.'}
        </p>
        <PatternPad
          key={step}
          resetKey={reset}
          error={Boolean(err)}
          disabled={busy}
          onComplete={(p) => {
            if (step === 'pattern') {
              setFirst(p);
              setErr(undefined);
              setStep('pattern2');
            } else if (p !== first) {
              setErr('No coincide. Vuelve a crearlo.');
              setReset((r) => r + 1);
              setStep('pattern');
            } else void finish(p);
          }}
        />
        <p className="pin-error" role="alert">
          {busy ? 'Protegiendo tus datos…' : (err ?? '')}
        </p>
        <button type="button" className="link-btn" disabled={busy} onClick={() => setStep('start')}>
          Atrás
        </button>
      </main>
    );
  }

  // restorePattern
  return (
    <main className="lock">
      <h1>Patrón del respaldo</h1>
      <p>Dibuja el patrón que tenías cuando hiciste el respaldo. Será tu patrón desde ahora.</p>
      <PatternPad
        resetKey={reset}
        error={Boolean(err)}
        disabled={busy}
        onComplete={async (p) => {
          if (!backup) return;
          setBusy(true);
          const st = await openBackup(backup, p);
          if (!st) {
            setBusy(false);
            setErr('Patrón incorrecto.');
            setReset((r) => r + 1);
            return;
          }
          await createVault(p, st);
          toast('Respaldo restaurado.', 'success');
        }}
      />
      <p className="pin-error" role="alert">
        {busy ? 'Abriendo…' : (err ?? '')}
      </p>
      <button type="button" className="link-btn" onClick={() => setStep('welcome')}>
        Volver
      </button>
    </main>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="steps-dots" aria-label={`Paso ${step} de 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= step ? 'on' : ''} />
      ))}
    </div>
  );
}
