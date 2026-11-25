/**
 * Sincronización automática celular ↔ tablet (la misma en las cuatro apps).
 *
 * - Todo se cifra AQUÍ, antes de salir del teléfono, con una llave que sale de tu código de sincronización
 *   (PBKDF2 + AES-GCM). El servidor (Supabase) solo guarda texto ilegible y no puede listar nada: solo
 *   entrega una «caja» si le pides su número exacto, que también sale de tu código.
 * - Cada vez que guardas algo, se sube solo (unos segundos después). Al abrir la app o volver a ella,
 *   se baja lo último. Gana lo más reciente; si la app sabe juntar (el diario), junta día por día.
 * - En el teléfono solo queda sin cifrar la hora de la última sincronización (no dice nada de ti).
 */
import { useSyncExternalStore } from 'react';
import { decryptJSON, deriveKey, encryptJSON, isWrapped } from './crypto';

const URL = 'https://atusufrroqtbbuffzjrw.supabase.co/rest/v1/rpc';
/** Llave pública (publishable): se puede compartir; sin tu código no sirve para leer nada. */
const KEY = 'sb_publishable_gM3_k2v1anfSRDO3K1hGDA_leL1xs0p';
const ITER = 150_000;
const PUSH_DELAY = 2500;
const PULL_EVERY = 60_000;

/** Palabras simples para armar el código (5 palabras ≈ 50 bits, más el número). */
const WORDS =
  'tigre luna mango rio sol mar nube flor cafe pan lago puma condor llama arbol piedra fuego viento rayo nieve campo cielo bosque playa isla monte valle selva perla oro plata cobre hierro jade coral miel trigo maiz papa quinua cacao uva pera limon coco melon cereza fresa kiwi mora tuna palta oliva canela menta romero salvia trebol rosa lirio clavel jazmin tulipan dalia orquidea cactus helecho bambu roble pino cedro sauce ceibo molle tara chala yareta vicuna alpaca zorro oso lobo aguila halcon colibri tucan loro buho garza pato cisne tortuga delfin ballena pulpo cangrejo estrella cometa planeta galaxia aurora brisa trueno arcoiris marea ola duna oasis faro puente torre castillo barco vela ancla remo brujula mapa tesoro llave puerta ventana camino sendero ciudad pueblo plaza mercado feria fiesta musica guitarra charango quena tambor danza canto poema libro cuaderno lapiz pincel color lienzo foto cine teatro circo juego pelota bici cometa reloj campana vela linterna espejo cristal diamante rubi zafiro esmeralda topacio'.split(
    ' ',
  );

export function newSyncCode(): string {
  const r = crypto.getRandomValues(new Uint32Array(6));
  const words = Array.from(r.slice(0, 5), (n) => WORDS[n % WORDS.length]);
  return `${words.join('-')}-${String(r[5]! % 10000).padStart(4, '0')}`;
}

/** «Tigre Luna  mango» → «tigre-luna-mango» (sin tildes ni espacios raros). */
export function normCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidCode(code: string): boolean {
  return normCode(code).split('-').length >= 4 && normCode(code).length >= 16;
}

async function sha256hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function boxId(app: string, code: string): Promise<string> {
  return sha256hex(`mis-apps:${app}:${normCode(code)}`);
}

const keys = new Map<string, Promise<CryptoKey>>();
function boxKey(app: string, code: string): Promise<CryptoKey> {
  const k = `${app}|${normCode(code)}`;
  if (!keys.has(k)) keys.set(k, deriveKey(normCode(code), new TextEncoder().encode(`mis-apps-sync-v1:${app}`) as Uint8Array<ArrayBuffer>, ITER));
  return keys.get(k)!;
}

export interface Box<S> {
  v: 1;
  app: string;
  /** Cuándo cambió por última vez en el dispositivo que lo subió. */
  changedAt: string;
  state: S;
}

export async function sealBox<S>(app: string, code: string, box: Box<S>): Promise<string> {
  return JSON.stringify(await encryptJSON(await boxKey(app, code), box));
}

export async function openBox<S>(app: string, code: string, text: string): Promise<Box<S> | null> {
  try {
    const w = JSON.parse(text) as unknown;
    if (!isWrapped(w)) return null;
    const b = (await decryptJSON(await boxKey(app, code), w)) as Box<S>;
    return b && b.v === 1 && b.app === app && typeof b.changedAt === 'string' ? b : null;
  } catch {
    return null;
  }
}

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`${URL}/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`sync ${r.status}`);
  return (await r.json()) as T;
}

// ---------------------------------------------------------------- Motor

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline' | 'error';

export interface SyncDeps<S> {
  app: string;
  /** El estado real (null si está bloqueada o en modo prueba). */
  getState(): S | null;
  /** Tu código guardado (dentro de tus datos cifrados). */
  getCode(state: S): string | undefined;
  /** Reemplaza el estado por el que llegó (sin volver a subirlo). */
  applyRemote(state: S): void;
  /** Si la app sabe juntar dos estados (por ejemplo, el diario). */
  merge?(local: S, remote: S): S;
  /** Avisa cada vez que se guarda algo (remote: true si vino de la nube). */
  onCommit(cb: (state: S, remote: boolean) => void): () => void;
}

interface Meta {
  /** Hora (del servidor) de la última caja que vimos o subimos. Sin dato: este dispositivo nunca vio la nube. */
  remoteAt?: string;
  /** Cuándo cambió algo aquí por última vez. */
  changedAt?: string;
  /** El último cambio que ya está en la nube. */
  pushed?: string;
  lastOkAt?: string;
}

let status: SyncStatus = 'off';
let lastOkAt: string | undefined;
const listeners = new Set<() => void>();
function setStatus(s: SyncStatus, ok = false) {
  if (ok) lastOkAt = new Date().toISOString();
  if (s === status && !ok) return;
  status = s;
  for (const l of listeners) l();
}

export function useSyncStatus(): { status: SyncStatus; lastOkAt?: string } {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => `${status}|${lastOkAt ?? ''}`,
    () => 'off|',
  );
  const [st, at] = s.split('|');
  return { status: st as SyncStatus, lastOkAt: at || undefined };
}

export function createSync<S>(deps: SyncDeps<S>) {
  const META = `${deps.app}.sync-meta`;
  const readMeta = (): Meta => {
    try {
      return JSON.parse(localStorage.getItem(META) ?? '{}') as Meta;
    } catch {
      return {};
    }
  };
  const writeMeta = (m: Meta) => {
    try {
      localStorage.setItem(META, JSON.stringify(m));
    } catch {
      /* sin metadatos: se sincroniza igual, solo un poco más */
    }
  };
  lastOkAt = readMeta().lastOkAt;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy: Promise<void> = Promise.resolve();

  const code = () => {
    const st = deps.getState();
    const c = st ? deps.getCode(st) : undefined;
    return st && c && isValidCode(c) ? { st, c } : null;
  };

  async function push() {
    const x = code();
    if (!x) return;
    const m = readMeta();
    const changedAt = m.changedAt ?? new Date().toISOString();
    const text = await sealBox(deps.app, x.c, { v: 1, app: deps.app, changedAt, state: x.st });
    const at = await rpc<string>('put_blob', { p_id: await boxId(deps.app, x.c), p_data: text });
    writeMeta({ ...readMeta(), remoteAt: at, changedAt, pushed: changedAt });
  }

  async function pull() {
    const x = code();
    if (!x) return;
    const rows = await rpc<{ data: string; updated_at: string }[]>('get_blob', { p_id: await boxId(deps.app, x.c) });
    const row = rows[0];
    const m = readMeta();
    const pending = Boolean(m.changedAt && m.changedAt !== m.pushed);
    if (!row) {
      // Nadie subió nada con este código todavía: este dispositivo es el primero.
      await push();
      return;
    }
    if (row.updated_at === m.remoteAt) {
      if (pending) await push();
      return;
    }
    const box = await openBox<S>(deps.app, x.c, row.data);
    if (!box) throw new Error('No se pudo abrir: revisa tu código de sincronización.');
    // Un dispositivo que se acaba de vincular SIEMPRE baja primero (nunca pisa la nube con datos vacíos).
    const firstLink = !m.remoteAt;
    const localNewer = !firstLink && pending && m.changedAt! > box.changedAt;
    if (deps.merge) {
      const merged = deps.merge(x.st, box.state);
      const same = JSON.stringify(merged) === JSON.stringify(box.state);
      deps.applyRemote(merged);
      const now = new Date().toISOString();
      writeMeta({ ...readMeta(), remoteAt: row.updated_at, changedAt: same ? box.changedAt : now, pushed: box.changedAt });
      if (!same) await push();
      return;
    }
    if (localNewer) {
      await push();
      return;
    }
    deps.applyRemote(box.state);
    writeMeta({ ...readMeta(), remoteAt: row.updated_at, changedAt: box.changedAt, pushed: box.changedAt });
  }

  function run(job: () => Promise<void>) {
    busy = busy.then(async () => {
      if (!code()) {
        setStatus('off');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('offline');
        return;
      }
      setStatus('syncing');
      try {
        await job();
        setStatus('ok', true);
        writeMeta({ ...readMeta(), lastOkAt });
      } catch {
        setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      }
    });
    return busy;
  }

  deps.onCommit((_s, remote) => {
    if (remote) return;
    writeMeta({ ...readMeta(), changedAt: new Date().toISOString() });
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run(push);
    }, PUSH_DELAY);
  });

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void run(pull);
      else if (timer) {
        // Al salir de la app, sube ya lo que estaba esperando.
        clearTimeout(timer);
        timer = undefined;
        void run(push);
      }
    });
    window.addEventListener('online', () => void run(pull));
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void run(pull);
    }, PULL_EVERY);
  }

  return {
    /** Al abrir la app (o al poner tu código): trae lo último y sube lo pendiente. */
    syncNow: () => run(pull),
    /** Olvida lo que sabía de la nube (al cambiar de código). */
    reset: () => writeMeta({}),
  };
}
