import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boxId, createSync, isValidCode, newSyncCode, normCode, openBox, sealBox } from '../src/lib/sync';

/** Servidor de mentira: guarda cajas por id, como las funciones de Supabase. */
const server = new Map<string, { data: string; updated_at: string }>();
let clock = 0;
function fakeFetch(_url: string, init: { body: string }) {
  const fn = _url.split('/').pop()!;
  const b = JSON.parse(init.body) as { p_id: string; p_data?: string };
  if (fn === 'put_blob') {
    const at = new Date(Date.UTC(2026, 10, 25, 12, 0, ++clock)).toISOString();
    server.set(b.p_id, { data: b.p_data!, updated_at: at });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(at) });
  }
  const row = server.get(b.p_id);
  return Promise.resolve({ ok: true, json: () => Promise.resolve(row ? [row] : []) });
}

/** Un «dispositivo»: su propio estado y sus propios metadatos (localStorage separado). */
function device<S extends { settings: { syncCode?: string } }>(app: string, initial: S, merge?: (l: S, r: S) => S) {
  let state = initial;
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const listeners = new Set<(s: S, remote: boolean) => void>();
  const withLs = <T,>(fn: () => T): T => {
    const prev = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    try {
      return fn();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = prev;
    }
  };
  const sync = withLs(() =>
    createSync<S>({
      app,
      getState: () => state,
      getCode: (s) => s.settings.syncCode,
      applyRemote: (s) => {
        state = { ...s, settings: { ...s.settings, syncCode: state.settings.syncCode } };
        for (const l of listeners) l(state, true);
      },
      merge,
      onCommit: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    }),
  );
  const run = async (fn: () => Promise<void> | void) => {
    const prev = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    try {
      await fn();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = prev;
    }
  };
  return {
    get state() {
      return state;
    },
    edit: (s: S) =>
      run(() => {
        state = s;
        for (const l of listeners) l(state, false);
      }),
    link: (code: string) =>
      run(async () => {
        sync.reset();
        state = { ...state, settings: { ...state.settings, syncCode: code } };
        await sync.syncNow();
      }),
    now: () => run(() => sync.syncNow()),
  };
}

type St = { settings: { syncCode?: string }; n: number; days?: Record<string, string> };

beforeEach(() => {
  server.clear();
  vi.stubGlobal('fetch', fakeFetch);
  vi.stubGlobal('navigator', { onLine: true });
  vi.useFakeTimers({ toFake: ['Date'] });
});

describe('código de sincronización', () => {
  it('crea códigos de 5 palabras + número y los normaliza', () => {
    const c = newSyncCode();
    expect(c.split('-')).toHaveLength(6);
    expect(isValidCode(c)).toBe(true);
    expect(normCode(' Tigre  Luna-mango ')).toBe('tigre-luna-mango');
    expect(isValidCode('corto')).toBe(false);
  });
  it('la caja va cifrada y solo se abre con el mismo código', async () => {
    const t = await sealBox('x', 'tigre-luna-mango-rio-sol-1234', { v: 1, app: 'x', changedAt: 'a', state: { secreto: 'mi diario' } });
    expect(t).not.toContain('mi diario');
    expect((await openBox<{ secreto: string }>('x', 'tigre-luna-mango-rio-sol-1234', t))?.state.secreto).toBe('mi diario');
    expect(await openBox('x', 'otro-codigo-cualquiera-aqui-0000', t)).toBeNull();
    expect(await boxId('x', 'a-b-c-d-1')).toMatch(/^[0-9a-f]{64}$/);
    expect(await boxId('x', 'a-b-c-d-1')).not.toBe(await boxId('y', 'a-b-c-d-1'));
  });
});

describe('dos dispositivos', () => {
  const code = 'tigre-luna-mango-rio-sol-1234';
  it('el segundo baja primero y nunca pisa la nube; después los cambios van y vuelven', async () => {
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
    const cel = device<St>('app', { settings: {}, n: 7 });
    const tab = device<St>('app', { settings: {}, n: 0 });
    await cel.link(code);
    vi.setSystemTime(new Date('2026-11-25T10:05:00Z'));
    await tab.edit({ ...tab.state, n: 0 }); // algo local en la tablet, más nuevo pero vacío
    await tab.link(code);
    expect(tab.state.n).toBe(7);

    vi.setSystemTime(new Date('2026-11-25T11:00:00Z'));
    await tab.edit({ ...tab.state, n: 8 });
    await tab.now();
    await cel.now();
    expect(cel.state.n).toBe(8);

    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
    await cel.edit({ ...cel.state, n: 9 });
    await cel.now();
    await tab.now();
    expect(tab.state.n).toBe(9);
    expect(tab.state.settings.syncCode).toBe(code);
  });
  it('si los dos cambiaron, gana el más reciente', async () => {
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
    const cel = device<St>('app', { settings: {}, n: 1 });
    const tab = device<St>('app', { settings: {}, n: 0 });
    await cel.link(code);
    await tab.link(code);
    vi.setSystemTime(new Date('2026-11-25T10:01:00Z'));
    await cel.edit({ ...cel.state, n: 2 });
    vi.setSystemTime(new Date('2026-11-25T10:02:00Z'));
    await tab.edit({ ...tab.state, n: 3 });
    await cel.now();
    await tab.now();
    await cel.now();
    expect(cel.state.n).toBe(3);
    expect(tab.state.n).toBe(3);
  });
  it('el diario junta día por día', async () => {
    const merge = (l: St, r: St): St => ({ ...r, days: { ...r.days, ...l.days } });
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
    const tab = device<St>('d', { settings: {}, n: 0, days: { lun: 'tablet' } }, merge);
    const cel = device<St>('d', { settings: {}, n: 0, days: { mar: 'celular' } }, merge);
    await tab.link(code);
    await cel.link(code);
    expect(cel.state.days).toEqual({ lun: 'tablet', mar: 'celular' });
    await tab.now();
    expect(tab.state.days).toEqual({ lun: 'tablet', mar: 'celular' });
  });
});
