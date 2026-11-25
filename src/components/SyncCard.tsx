import { useState } from 'react';
import { isValidCode, newSyncCode, normCode, useSyncStatus } from '../lib/sync';

const STATUS: Record<string, string> = {
  off: 'Apagada',
  syncing: 'Sincronizando…',
  ok: 'Al día ✓',
  offline: 'Sin internet: se sincroniza sola cuando vuelvas a tener',
  error: 'No se pudo sincronizar. Se vuelve a intentar sola.',
};

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
export function SyncCard({ code, onSet, onOff, onNow }: { code?: string; onSet: (code: string) => void; onOff: () => void; onNow: () => void }) {
  const { status, lastOkAt } = useSyncStatus();
  const [fresh, setFresh] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [show, setShow] = useState(false);

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
          <input className="field" value={typing} onChange={(e) => setTyping(e.target.value)} placeholder="tigre-luna-mango-rio-sol-1234" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-label="Tu código de sincronización" />
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
            <button type="button" className="btn primary" disabled={!isValidCode(typing)} onClick={() => onSet(normCode(typing))}>
              Vincular
            </button>
          </div>
          <p className="fine">Al vincular, este dispositivo baja primero lo que ya está en la nube.</p>
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
