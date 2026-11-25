/**
 * Sincronización automática celular ↔ tablet (la misma en las cuatro apps).
 *
 * - Todo se cifra AQUÍ, antes de salir del teléfono, con una llave que sale de tu código de sincronización
 *   (PBKDF2 + AES-GCM). El servidor (Supabase) solo guarda texto ilegible y no puede listar nada: solo
 *   entrega una «caja» si le pides su número exacto, que también sale de tu código.
 * - Cada vez que guardas algo, se sube solo (unos segundos después). Al abrir la app o volver a ella,
 *   se baja lo último. Antes de subir, siempre mira si tu otro dispositivo subió algo: si los dos cambiaron,
 *   se JUNTAN (merge.ts) en vez de pisarse. El diario junta día por día.
 * - Al vincular un dispositivo que ya tiene datos propios, te pregunta cuáles se quedan, y guarda una copia
 *   para «Deshacer».
 * - En el teléfono queda: la hora de la última sincronización y, cifradas con tu código, la última versión
 *   en común (para poder juntar) y la copia para deshacer. Nada legible.
 */
import { useSyncExternalStore } from 'react';
import { decryptJSON, deriveKey, encryptJSON, isWrapped } from './crypto';
import { merge3 } from './merge';

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

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline' | 'error' | 'choose';

export interface SyncDeps<S> {
  app: string;
  /** El estado real (null si está bloqueada o en modo prueba). */
  getState(): S | null;
  /** Tu código guardado (dentro de tus datos cifrados). */
  getCode(state: S): string | undefined;
  /** Reemplaza el estado por el que llegó (sin volver a subirlo). */
  applyRemote(state: S): void;
  /** Si la app sabe juntar dos estados a su manera (por ejemplo, el diario). */
  merge?(local: S, remote: S): S;
  /** Campos numéricos que se suman al juntar (por ejemplo, los saldos). */
  additive?: readonly string[];
  /** ¿Este dispositivo ya tiene datos propios? Si sí, al vincular se pregunta cuáles se quedan. */
  hasData?(state: S): boolean;
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

interface Row {
  data: string;
  updated_at: string;
}

/** Al vincular: en la nube ya hay datos y este dispositivo también tiene. */
export interface SyncChoice {
  /** Cuándo cambió lo de la nube (en tu otro dispositivo). */
  cloudAt: string;
}

let status: SyncStatus = 'off';
let lastOkAt: string | undefined;
let choice: (SyncChoice & { row: Row }) | null = null;
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function setStatus(s: SyncStatus, ok = false) {
  if (ok) lastOkAt = new Date().toISOString();
  if (s === status && !ok) return;
  status = s;
  emit();
}

export function useSyncStatus(): { status: SyncStatus; lastOkAt?: string; choice: SyncChoice | null; undoAt?: string } {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => `${status}|${lastOkAt ?? ''}|${choice?.cloudAt ?? ''}|${undoAtNow ?? ''}`,
    () => 'off|||',
  );
  const [st, at, ch, undo] = s.split('|');
  return { status: st as SyncStatus, lastOkAt: at || undefined, choice: ch ? { cloudAt: ch } : null, undoAt: undo || undefined };
}

let undoAtNow: string | undefined;
const UNDO_DAYS = 14;

export function createSync<S>(deps: SyncDeps<S>) {
  const META = `${deps.app}.sync-meta`;
  const BASE = `${deps.app}.sync-base`;
  const UNDO = `${deps.app}.sync-undo`;
  const ls = {
    get(k: string): string | null {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k: string, v: string | null) {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {
        /* sin espacio: se sincroniza igual, solo junta peor */
      }
    },
  };
  const readMeta = (): Meta => {
    try {
      return JSON.parse(ls.get(META) ?? '{}') as Meta;
    } catch {
      return {};
    }
  };
  const writeMeta = (m: Meta) => ls.set(META, JSON.stringify(m));
  const readUndo = (): { at: string; text: string } | null => {
    try {
      const u = JSON.parse(ls.get(UNDO) ?? 'null') as { at: string; text: string } | null;
      if (!u || Date.now() - Date.parse(u.at) > UNDO_DAYS * 86_400_000) return null;
      return u;
    } catch {
      return null;
    }
  };
  lastOkAt = readMeta().lastOkAt;
  undoAtNow = readUndo()?.at;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy: Promise<void> = Promise.resolve();
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  /** Hora de un cambio nuevo: siempre distinta (y posterior) a la del último que ya está en la nube. */
  const fresh = () => {
    const m = readMeta();
    const last = Math.max(Date.parse(m.pushed ?? '') || 0, Date.parse(m.changedAt ?? '') || 0);
    return new Date(Math.max(Date.now(), last + 1)).toISOString();
  };

  const code = () => {
    const st = deps.getState();
    const c = st ? deps.getCode(st) : undefined;
    return st && c && isValidCode(c) ? { st, c } : null;
  };

  async function getRow(c: string): Promise<Row | null> {
    const rows = await rpc<Row[]>('get_blob', { p_id: await boxId(deps.app, c) });
    return rows[0] ?? null;
  }

  /** Sube lo de este dispositivo tal cual (y lo recuerda como «lo último en común»). */
  async function put(c: string, state: S) {
    const m = readMeta();
    const changedAt = m.changedAt ?? new Date().toISOString();
    const text = await sealBox(deps.app, c, { v: 1, app: deps.app, changedAt, state });
    const at = await rpc<string>('put_blob', { p_id: await boxId(deps.app, c), p_data: text });
    writeMeta({ ...readMeta(), remoteAt: at, changedAt, pushed: changedAt });
    if (!deps.merge) ls.set(BASE, text);
  }

  async function base(c: string): Promise<S | undefined> {
    const t = deps.merge ? null : ls.get(BASE);
    return t ? (await openBox<S>(deps.app, c, t))?.state : undefined;
  }

  /** Lo de siempre: mira la nube, baja lo nuevo, junta si los dos cambiaron y sube lo pendiente. */
  async function step() {
    const x = code();
    if (!x) return;
    const row = await getRow(x.c);
    const m = readMeta();
    const pending = Boolean(m.changedAt && m.changedAt !== m.pushed);
    if (!row) {
      // Nadie subió nada con este código todavía: este dispositivo es el primero.
      await put(x.c, x.st);
      return;
    }
    if (row.updated_at === m.remoteAt) {
      if (pending) await put(x.c, x.st);
      return;
    }
    const box = await openBox<S>(deps.app, x.c, row.data);
    if (!box) throw new Error('No se pudo abrir: revisa tu código de sincronización.');

    if (!m.remoteAt) {
      // Recién vinculado: nunca pisa la nube. Si aquí ya hay datos propios, pregunta cuáles se quedan.
      if (deps.merge) {
        deps.applyRemote(deps.merge(x.st, box.state));
        writeMeta({ ...readMeta(), remoteAt: row.updated_at, changedAt: fresh() });
        await put(x.c, deps.getState() ?? x.st);
        return;
      }
      if (deps.hasData?.(x.st)) {
        choice = { cloudAt: box.changedAt, row };
        return;
      }
      deps.applyRemote(box.state);
      writeMeta({ ...readMeta(), remoteAt: row.updated_at, changedAt: box.changedAt, pushed: box.changedAt });
      ls.set(BASE, row.data);
      return;
    }

    if (!pending) {
      deps.applyRemote(box.state);
      writeMeta({ ...readMeta(), remoteAt: row.updated_at, changedAt: box.changedAt, pushed: box.changedAt });
      if (!deps.merge) ls.set(BASE, row.data);
      return;
    }

    // Los dos cambiaron: se juntan (nunca se pisa lo del otro).
    let merged: S;
    if (deps.merge) merged = deps.merge(x.st, box.state);
    else {
      const b = await base(x.c);
      merged = b
        ? merge3(b, x.st, box.state, { additive: deps.additive, preferRemote: box.changedAt > (m.changedAt ?? '') })
        : (m.changedAt ?? '') > box.changedAt
          ? x.st
          : box.state;
    }
    if (!same(merged, x.st)) deps.applyRemote(merged);
    writeMeta({ ...readMeta(), remoteAt: row.updated_at, changedAt: fresh() });
    await put(x.c, deps.getState() ?? merged);
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
        if (choice) {
          setStatus('choose');
          return;
        }
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
    writeMeta({ ...readMeta(), changedAt: fresh() });
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run(step);
    }, PUSH_DELAY);
  });

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void run(step);
      else if (timer) {
        // Al salir de la app, sube ya lo que estaba esperando.
        clearTimeout(timer);
        timer = undefined;
        void run(step);
      }
    });
    window.addEventListener('online', () => void run(step));
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void run(step);
    }, PULL_EVERY);
  }

  async function saveUndo(c: string, state: S) {
    const at = new Date().toISOString();
    ls.set(UNDO, JSON.stringify({ at, text: await sealBox(deps.app, c, { v: 1, app: deps.app, changedAt: at, state }) }));
    undoAtNow = at;
  }

  return {
    /** Al abrir la app (o al poner tu código): trae lo último, junta y sube lo pendiente. */
    syncNow: () => run(step),
    /** Olvida lo que sabía de la nube (al cambiar de código). */
    reset: () => {
      writeMeta({});
      ls.set(BASE, null);
      choice = null;
      emit();
    },
    /** ¿Ya hay algo guardado con este código? (para avisar si lo escribiste mal). */
    exists: async (c: string) => Boolean(await getRow(normCode(c))),
    /**
     * Al vincular con datos en los dos lados: «cloud» = usar lo de tu otro dispositivo (lo de aquí queda en
     * «Deshacer»); «mine» = usar lo de este dispositivo (tu otro dispositivo lo recibe la próxima vez).
     */
    choose: (pick: 'cloud' | 'mine') =>
      run(async () => {
        const x = code();
        const ch = choice;
        choice = null;
        if (!x || !ch) return;
        if (pick === 'cloud') {
          const box = await openBox<S>(deps.app, x.c, ch.row.data);
          if (!box) throw new Error('No se pudo abrir');
          await saveUndo(x.c, x.st);
          deps.applyRemote(box.state);
          writeMeta({ ...readMeta(), remoteAt: ch.row.updated_at, changedAt: box.changedAt, pushed: box.changedAt });
          ls.set(BASE, ch.row.data);
        } else {
          writeMeta({ ...readMeta(), remoteAt: ch.row.updated_at, changedAt: fresh() });
          await put(x.c, x.st);
        }
      }),
    /** Vuelve a lo que tenía este dispositivo antes de vincular (y lo sube). */
    undo: () =>
      run(async () => {
        const x = code();
        const u = readUndo();
        if (!x || !u) return;
        const box = await openBox<S>(deps.app, x.c, u.text);
        if (!box) throw new Error('No se pudo abrir');
        deps.applyRemote(box.state);
        ls.set(UNDO, null);
        undoAtNow = undefined;
        writeMeta({ ...readMeta(), changedAt: fresh() });
        await step();
      }),
    /** Ya no hace falta la copia para deshacer. */
    dropUndo: () => {
      ls.set(UNDO, null);
      undoAtNow = undefined;
      emit();
    },
  };
}
