import { useEffect, useState } from 'react';
import { BADGE_PCT, TIERS } from '../lib/badges';
import { STEP, URGE_MINUTES } from '../lib/config';
import { OTHER_NAME, VICTORY_PCT } from '../lib/team';
import type { Settings } from '../lib/types';
import { Icon } from './Icon';

/** Lo nuevo de esta versión (se muestra una vez después de actualizar). */
export const WHATS_NEW = {
  version: __APP_VERSION__,
  items: [
    'Sincronización más segura: si cambias algo en el celular y en la tablet a la vez, ahora se juntan los dos cambios en vez de pisarse.',
    'Al vincular un dispositivo que ya tiene datos, te pregunta cuáles se quedan, y guarda una copia para «Deshacer».',
    'Si escribes mal el código, te avisa. Y recuperar un respaldo ya no apaga la sincronización.',
  ],
};

const SEEN_KEY = 'bitacora.seen-version';

/** Todas las reglas, con tus números actuales. */
export function HowItWorks({ s, onClose }: { s: Settings; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Cómo funciona">
      <button type="button" className="icon-btn overlay-close" aria-label="Cerrar" onClick={onClose}>
        <Icon name="x" />
      </button>
      <main className="help">
        <div className="eyebrow">Bitácora</div>
        <h1 className="title">Cómo funciona</h1>

        <section className="card">
          <div className="card-title">Tu día</div>
          <ul>
            <li>Cada noche marcas cada hábito: limpio o caída. Si caes, anota qué lo disparó: es información, no un fracaso.</li>
            <li>
              <b>Día limpio:</b> todos tus hábitos limpios (o un comodín).
            </li>
            <li>
              <b>Racha que perdona:</b> una caída suelta no rompe la racha, solo no suma. Dos días seguidos sin día limpio la reinician.
            </li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Lo que recuperas</div>
          <ul>
            <li>Cada día limpio de un hábito suma lo que le pusiste: horas que recuperaste o días (por ejemplo, de mente clara). Aquí no se cuenta dinero.</li>
            {s.partyBonus > 0 && (
              <li>
                <b>«Dije no a una fiesta»</b> queda anotado el día que lo tocas.
              </li>
            )}
            <li>Una caída no suma, pero tampoco te quita lo recuperado.</li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Escalones y premios</div>
          <ul>
            <li>
              Cada {STEP} días de racha llegas a un escalón: un <b>premio</b>, que reclamas al llegar, o un <b>cofre sorpresa</b> (un comodín o una noche de
              series). El último trae cofre doble.
            </li>
            <li>Cuentan con tu mejor racha: si caes, lo ganado no se pierde.</li>
            <li>El comodín sale de los cofres y salva un día malo para tu racha.</li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Gran premio y semana victoriosa</div>
          <ul>
            <li>Tu gran premio está siempre arriba en Hoy, con los días que faltan.</li>
            <li>
              Si el promedio de tu semana en Bitácora y en {OTHER_NAME} llega a <b>{VICTORY_PCT} %</b>, la semana es victoriosa.
              {s.grand?.weeks ? ` Tu gran premio pide ${s.grand.weeks} semanas victoriosas.` : ''}
            </li>
            <li>Las dos apps se pasan solo esos porcentajes, nunca tus hábitos. Ponles el mismo inicio de ciclo.</li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Insignias</div>
          <ul>
            <li>
              Cada bloque de 2 semanas con <b>{BADGE_PCT} % limpio</b> de promedio sube un nivel: {TIERS.join(', ')}.
            </li>
            <li>Si un bloque no sale, no pierdes lo que ya ganaste: vas por el siguiente.</li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Botón de urgencia y ánimo</div>
          <ul>
            <li>
              Cuando llegue el antojo, toca <b>«Tengo un antojo»</b>: ves tu gran premio, tu frase y tu racha, y respiras {URGE_MINUTES} minutos. El antojo sube, llega a su punto y
              baja.
            </li>
            <li>Marca tu ánimo con un toque. En Análisis ves cómo se relaciona con tus días limpios.</li>
          </ul>
        </section>

        <section className="card">
          <div className="card-title">Tus datos</div>
          <ul>
            <li>Se guardan cifrados solo en este teléfono y se abren con tu patrón o tu huella.</li>
            <li>
              <b>Haz un respaldo cada semana</b> (Ajustes → Respaldo). Si olvidas el patrón, nadie puede abrir tus datos.
            </li>
          </ul>
        </section>

        <button type="button" className="btn primary block" style={{ marginTop: 16 }} onClick={onClose}>
          Entendido
        </button>
      </main>
    </div>
  );
}

/** Aviso en Hoy: «Cómo funciona» la primera vez y «Novedades» después de cada actualización. */
export function WhatsNewBanner({ onOpen }: { onOpen: () => void }) {
  const [seen, setSeen] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SEEN_KEY);
    } catch {
      return WHATS_NEW.version;
    }
  });
  if (seen === WHATS_NEW.version) return null;
  const hide = () => {
    try {
      localStorage.setItem(SEEN_KEY, WHATS_NEW.version);
    } catch {
      /* nada */
    }
    setSeen(WHATS_NEW.version);
  };
  const first = seen === null;
  return (
    <div className="banner gold" role="region" aria-label={first ? 'Cómo funciona' : 'Novedades'}>
      <Icon name="sparkles" />
      <div className="txt">
        <b>{first ? '¿Cómo funciona Bitácora?' : 'Novedades'}</b>
        {first ? 'Todas las reglas en un minuto.' : WHATS_NEW.items.join(' ')}
      </div>
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          hide();
          onOpen();
        }}
      >
        Ver
      </button>
      <button type="button" className="icon-btn" aria-label="Cerrar aviso" onClick={hide}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
