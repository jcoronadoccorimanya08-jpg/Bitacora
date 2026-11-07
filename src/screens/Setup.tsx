import { useRef, useState, type ReactNode } from 'react';
import { InstallCard } from '../components/InstallCard';
import { Icon } from '../components/Icon';
import { PinPad } from '../components/PinPad';
import { APP_NAME, DEFAULT_TRIGGERS, HABIT_SUGGESTIONS, MAX_HABITS, NEW_HABIT, type HabitTemplate } from '../lib/config';
import { openBackup, parseFile } from '../lib/backup';
import type { Sealed } from '../lib/crypto';
import { addDays, formatLong, formatRange, isValidISODate, nextMonday, weekday, type ISODate } from '../lib/dates';
import { toast } from '../lib/feedback';
import { slugId } from '../lib/sanitize';
import { createVault, initialState } from '../lib/store';
import type { Habit } from '../lib/types';

type Step = 'welcome' | 'backup' | 'habits' | 'start' | 'pin' | 'pin2';

export function Setup({ today, updateBanner }: { today: ISODate; updateBanner?: ReactNode }) {
  const [step, setStep] = useState<Step>('welcome');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [triggers, setTriggers] = useState<string[]>(DEFAULT_TRIGGERS);
  const [custom, setCustom] = useState('');
  const isMonday = weekday(today) === 1;
  const monday = nextMonday(today);
  const [startChoice, setStartChoice] = useState<'today' | 'monday' | 'custom'>(isMonday ? 'today' : 'monday');
  const [customDate, setCustomDate] = useState<ISODate>(today);
  const [pin1, setPin1] = useState('');
  const [pinError, setPinError] = useState<string>();
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const startDate = startChoice === 'today' ? today : startChoice === 'monday' ? monday : customDate;

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

  const onFile = async (file: File) => loadText(await file.text());

  const loadText = (text: string) => {
    try {
      const parsed = parseFile(text);
      if (parsed.kind === 'config') {
        setHabits(parsed.habits);
        setTriggers(parsed.triggers);
        toast('Configuración cargada.', 'success');
        setStep('habits');
      } else {
        setSealed(parsed.sealed);
        setStep('backup');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Archivo inválido.', 'error');
    }
  };

  const finish = async (pin: string) => {
    setBusy(true);
    await createVault(pin, initialState({ startDate, habits, triggers }));
    toast('Listo. Tu bitácora está protegida.', 'success');
  };

  const fileInput = (
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
              <Icon name="gift" />
            </span>
            <div>
              <b>Un premio cada 7 días</b>
              <span>Escalones en el día 7, 14, 21… durante tu ciclo de 90 días.</span>
            </div>
          </li>
          <li>
            <span className="pi">
              <Icon name="lock" />
            </span>
            <div>
              <b>Solo tuya</b>
              <span>Protegida con PIN y cifrada en este teléfono. No hay cuentas ni servidores.</span>
            </div>
          </li>
        </ul>
        <div className="stack">
          <button type="button" className="btn primary block" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Cargar mi configuración o un respaldo
          </button>
          <button type="button" className="btn block" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
            <Icon name="copy" size={18} /> Pegar mi configuración
          </button>
          {pasting && (
            <div className="paste-box">
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder='Pega aquí el texto que empieza con {"app": "bitacora"'
                aria-label="Configuración en texto"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button type="button" className="btn primary block" disabled={!pasted.trim()} onClick={() => loadText(pasted)}>
                Usar esta configuración
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

  if (step === 'backup' && sealed) {
    return (
      <main className="lock">
        <h1>Restaurar respaldo</h1>
        <p>Ingresa el PIN que tenías cuando hiciste este respaldo. Será tu PIN desde ahora.</p>
        <PinPad
          busy={busy}
          error={busy ? 'Abriendo…' : pinError}
          resetKey={reset}
          submitLabel="Restaurar"
          onSubmit={async (pin) => {
            setBusy(true);
            try {
              const state = await openBackup(sealed, pin);
              await createVault(pin, state);
              toast('Respaldo restaurado.', 'success');
            } catch (err) {
              setBusy(false);
              setPinError(err instanceof Error && err.message === 'PIN' ? 'PIN incorrecto.' : 'No se pudo restaurar.');
              setReset((r) => r + 1);
            }
          }}
        />
        <button type="button" className="link-btn" onClick={() => setStep('welcome')}>
          Volver
        </button>
      </main>
    );
  }

  if (step === 'habits') {
    const available = HABIT_SUGGESTIONS.filter((t) => !habits.some((h) => h.name.toLowerCase() === t.name.toLowerCase()));
    return (
      <main className="onb" style={{ justifyContent: 'flex-start' }}>
        <StepDots step={1} />
        <div>
          <h1 style={{ fontSize: 32 }}>¿Qué quieres dejar?</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Hasta {MAX_HABITS}, en orden de prioridad. Luego puedes editar la pregunta, los botones y tu frase de cada uno en Ajustes.
          </p>
        </div>
        {habits.length > 0 && (
          <ol className="selected-list" aria-label="Elegidos">
            {habits.map((h, i) => (
              <li key={h.id}>
                <span>
                  {i + 1}. {h.name}
                </span>
                <button type="button" className="icon-btn" aria-label={`Subir ${h.name}`} disabled={i === 0} onClick={() => moveUp(i)}>
                  <Icon name="chevronUp" size={20} />
                </button>
                <button type="button" className="icon-btn danger" aria-label={`Quitar ${h.name}`} onClick={() => removeHabit(h.id)}>
                  <Icon name="x" size={20} />
                </button>
              </li>
            ))}
          </ol>
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
    const valid = isValidISODate(startDate);
    return (
      <main className="onb">
        <StepDots step={2} />
        <div>
          <h1 style={{ fontSize: 32 }}>¿Cuándo empiezas?</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Tu ciclo dura 90 días.
          </p>
        </div>
        <section>
          <button type="button" className="choice" aria-pressed={startChoice === 'today'} onClick={() => setStartChoice('today')}>
            <span className="radio" />
            <div>
              <b>Hoy</b>
              <span>{formatLong(today)}</span>
            </div>
          </button>
          {!isMonday && (
            <button type="button" className="choice" aria-pressed={startChoice === 'monday'} onClick={() => setStartChoice('monday')}>
              <span className="radio" />
              <div>
                <b>El lunes {formatLong(monday).split(' ').slice(1).join(' ')}</b>
                <span>Cada escalón cae en domingo: buen día para revisar la semana.</span>
              </div>
            </button>
          )}
          <button type="button" className="choice" aria-pressed={startChoice === 'custom'} onClick={() => setStartChoice('custom')}>
            <span className="radio" />
            <div>
              <b>Otra fecha</b>
              <span>{startChoice === 'custom' && isValidISODate(customDate) ? formatLong(customDate) : 'Elige el día de inicio'}</span>
            </div>
          </button>
          {startChoice === 'custom' && (
            <input
              className="field"
              style={{ marginTop: 8 }}
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              aria-label="Fecha de inicio"
            />
          )}
        </section>
        {valid && <p className="fine">Del {formatRange(startDate, addDays(startDate, 89))}.</p>}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setStep('habits')}>
            Atrás
          </button>
          <button type="button" className="btn primary" disabled={!valid} onClick={() => setStep('pin')}>
            Siguiente
          </button>
        </div>
      </main>
    );
  }

  // Crear y confirmar el PIN
  return (
    <main className="lock">
      <StepDots step={3} />
      <h1>{step === 'pin' ? 'Crea tu PIN' : 'Repite tu PIN'}</h1>
      <p>
        {step === 'pin'
          ? 'De 4 a 8 números. Te lo pedirá al abrir la app. Si lo olvidas no hay forma de recuperar los datos, así que haz respaldos.'
          : 'Escríbelo otra vez para confirmar.'}
      </p>
      <PinPad
        key={step}
        busy={busy}
        error={busy ? 'Protegiendo tus datos…' : pinError}
        resetKey={reset}
        submitLabel={step === 'pin' ? 'Siguiente' : 'Crear'}
        onSubmit={(pin) => {
          if (step === 'pin') {
            setPin1(pin);
            setPinError(undefined);
            setStep('pin2');
          } else if (pin !== pin1) {
            setPinError('No coincide. Vuelve a crearlo.');
            setPin1('');
            setReset((r) => r + 1);
            setStep('pin');
          } else void finish(pin);
        }}
      />
      <button type="button" className="link-btn" onClick={() => setStep('start')} disabled={busy}>
        Atrás
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
