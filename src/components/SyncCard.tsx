import { useState } from 'react';
import { isValidCode, newSyncCode, normCode, useSyncStatus } from '../lib/sync';

const UNDO_TEXT = '14 días';

const STATUS: Record<string, string> = {
  off: 'Apagada',
  syncing: 'Sincronizando…',
  ok: 'Al día ✓',
  offline: 'Sin internet: se sincroniza sola cuando vuelvas a tener',
  error: 'No se pudo sincronizar. Se vuelve a intentar sola.',
  choose: 'Falta que elijas qué datos se quedan',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ago(iso?: string): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

/**
 * «☁️ Celular ↔ tablet»: un código de sincronización (el mismo en tus dispositivos) y listo.
 * El código vive dentro de tus datos cifrados; todo se cifra antes de salir del teléfono.
 */
export function SyncCard({
  code,
  onSet,
  onJoin,
  onOff,
  onNow,
  onChoose,
  onUndo,
  onDropUndo,
}: {
  code?: string;
  /** Primer dispositivo: crea la caja con lo de aquí. */
  onSet: (code: string) => void;
  /** Otro dispositivo: false si con ese código no hay nada guardado todavía. */
  onJoin: (code: string) => Promise<boolean>;
  onOff: () => void;
  onNow: () => void;
  onChoose: (pick: 'cloud' | 'mine') => void;
  onUndo: () => void;
  onDropUndo: () => void;
}) {
  const { status, lastOkAt, choice, undoAt } = useSyncStatus();
  const [fresh, setFresh] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  if (code && choice) {
    return (
      <section className="card stack sync-card sync-choose" role="alert">
        <p>
          <b>☁️ ¿Qué datos se quedan en este dispositivo?</b>
        </p>
        <p className="fine">
          En la nube ya están los datos de tu otro dispositivo (último cambio: {when(choice.cloudAt)}). Este dispositivo también tiene los suyos. Elige con cuáles te quedas: los dos dispositivos van a quedar iguales.
        </p>
        <button type="button" className="btn primary" onClick={() => onChoose('cloud')}>
          Los de mi otro dispositivo (la nube)
        </button>
        <p className="fine">Lo de aquí queda guardado {UNDO_TEXT}: lo puedes recuperar con «Deshacer».</p>
        <button type="button" className="btn" onClick={() => onChoose('mine')}>
          Los de este dispositivo
        </button>
        <p className="fine">Tu otro dispositivo recibirá lo de aquí la próxima vez que lo abras.</p>
        <button type="button" className="btn ghost" onClick={onOff}>
          Ninguno: apagar la sincronización aquí
        </button>
      </section>
    );
  }

  if (code) {
    return (
      <section className="card stack sync-card">
        <p>
          <b>☁️ Sincronización: {STATUS[status] ?? STATUS.off}</b>
          {lastOkAt && status !== 'syncing' && <span className="muted"> · {ago(lastOkAt)}</span>}
        </p>
        <p className="fine">Lo que haces aquí aparece solo en tu otro dispositivo (y al revés). Va cifrado con tu código: nadie más lo puede leer.</p>
        <div className="sync-code">
          <span className="muted">Tu código:</span> <b>{show ? code : '•••••• ••••••'}</b>{' '}
          <button type="button" className="btn sm" onClick={() => setShow(!show)}>
            {show ? 'Ocultar' : 'Ver'}
          </button>
          {show && (
            <button type="button" className="btn sm" onClick={() => void navigator.clipboard?.writeText(code)}>
              Copiar
            </button>
          )}
        </div>
        <button type="button" className="btn primary" onClick={onNow}>
          🔄 Sincronizar ahora
        </button>
        {undoAt && (
          <div className="sync-undo stack">
            <p className="fine">
              Guardé lo que tenía este dispositivo antes de vincular ({when(undoAt)}). Si algo no está bien, vuelve a eso.
            </p>
            <div className="btn-row">
              <button type="button" className="btn sm" onClick={onUndo}>
                ↩️ Deshacer
              </button>
              <button type="button" className="btn sm ghost" onClick={onDropUndo}>
                Todo está bien
              </button>
            </div>
          </div>
        )}
        <button type="button" className="btn ghost" onClick={onOff}>
          Apagar en este dispositivo
        </button>
      </section>
    );
  }

  return (
    <section className="card stack sync-card">
      <p>
        <b>☁️ Lo mismo en tu celular y tu tablet, solito</b>
      </p>
      <p className="fine">Pon el mismo código de sincronización en tus dos dispositivos. Desde ahí, todo se sincroniza solo y cifrado.</p>
      {fresh ? (
        <>
          <p className="fine">
            <b>Tu código nuevo</b> (anótalo en un papel: sin él no se puede recuperar):
          </p>
          <p className="sync-fresh">{fresh}</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(fresh)}>
              Copiar
            </button>
            <button type="button" className="btn primary" onClick={() => onSet(fresh)}>
              Ya lo anoté: activar
            </button>
          </div>
        </>
      ) : typing !== null ? (
        <>
          <input className="field" value={typing} onChange={(e) => (setTyping(e.target.value), setJoinErr(null))} placeholder="tigre-luna-mango-rio-sol-1234" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-label="Tu código de sincronización" />
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  setTyping((await navigator.clipboard.readText()) ?? '');
                } catch {
                  /* sin permiso para pegar: lo escribe a mano */
                }
              }}
            >
              Pegar
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!isValidCode(typing) || joining}
              onClick={async () => {
                setJoining(true);
                try {
                  if (!(await onJoin(normCode(typing)))) setJoinErr('No encontré nada con ese código. Revisa que sea igual, letra por letra, al de tu otro dispositivo (ahí: ☁️ → «Ver»).');
                } catch {
                  setJoinErr('Sin conexión. Prueba de nuevo cuando tengas internet.');
                } finally {
                  setJoining(false);
                }
              }}
            >
              {joining ? 'Buscando…' : 'Vincular'}
            </button>
          </div>
          {joinErr && (
            <p className="fine sync-err" role="alert">
              {joinErr}
            </p>
          )}
          <p className="fine">Al vincular, nunca se borra lo de tu otro dispositivo. Si aquí también tienes datos, te pregunto cuáles se quedan.</p>
        </>
      ) : (
        <div className="stack">
          <button type="button" className="btn primary" onClick={() => setFresh(newSyncCode())}>
            Crear mi código (primer dispositivo)
          </button>
          <button type="button" className="btn" onClick={() => setTyping('')}>
            Ya tengo un código (otro dispositivo)
          </button>
        </div>
      )}
    </section>
  );
}
