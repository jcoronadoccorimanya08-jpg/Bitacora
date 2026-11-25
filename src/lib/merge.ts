/**
 * Juntar dos versiones de tus datos que cambiaron al mismo tiempo (celular y tablet), sin perder nada.
 *
 * Usa la última versión que los dos tenían en común («base»):
 * - Lo que solo cambió en un lado, se queda.
 * - Listas con `id` (gastos, ingresos, pagos…): se juntan por id. Si un lado borró algo que el otro no tocó, se borra.
 * - Listas sin `id`: se juntan contando cuántas veces aparece cada cosa.
 * - Números «que se suman» (saldos): base + lo que cambió en cada lado. Así, un gasto en el celular y otro en la
 *   tablet restan los dos.
 * - Cualquier otra cosa que cambió distinto en los dos lados: gana el cambio más reciente.
 */
type J = unknown;
type Obj = Record<string, J>;

export interface MergeOptions {
  /** Nombres de campos numéricos que se suman (por ejemplo «balance»). */
  additive?: readonly string[];
  /** Si los dos cambiaron lo mismo distinto, ¿gana el otro dispositivo? */
  preferRemote: boolean;
}

const isObj = (v: J): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: J, b: J) => a === b || JSON.stringify(a) === JSON.stringify(b);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function merge3<T>(base: T | undefined, local: T, remote: T, opts: MergeOptions): T {
  return m(base, local, remote, { additive: new Set(opts.additive ?? []), preferRemote: opts.preferRemote }) as T;
}

interface Ctx {
  additive: Set<string>;
  preferRemote: boolean;
}

function m(base: J, local: J, remote: J, c: Ctx, key?: string): J {
  if (same(local, remote)) return local;
  if (base !== undefined && same(base, local)) return remote;
  if (base !== undefined && same(base, remote)) return local;
  if (typeof local === 'number' && typeof remote === 'number') {
    if (key && c.additive.has(key) && typeof base === 'number') return round2(base + (local - base) + (remote - base));
    return c.preferRemote ? remote : local;
  }
  if (Array.isArray(local) && Array.isArray(remote)) return mergeArr(Array.isArray(base) ? base : [], local, remote, c);
  if (isObj(local) && isObj(remote)) return mergeObj(isObj(base) ? base : {}, local, remote, c);
  return c.preferRemote ? remote : local;
}

function mergeObj(base: Obj, local: Obj, remote: Obj, c: Ctx): Obj {
  const out: Obj = {};
  const keys = [...Object.keys(local), ...Object.keys(remote).filter((k) => !(k in local))];
  for (const k of keys) {
    const inL = k in local;
    const inR = k in remote;
    const inB = k in base;
    if (inL && inR) out[k] = m(base[k], local[k], remote[k], c, k);
    else if (inL) {
      // El otro lado lo quitó: se va, salvo que aquí lo hayas cambiado.
      if (!inB || !same(base[k], local[k])) out[k] = local[k];
    } else if (!inB || !same(base[k], remote[k])) out[k] = remote[k];
  }
  return out;
}

const hasId = (v: J): v is Obj & { id: string } => isObj(v) && typeof v.id === 'string';

function mergeArr(base: J[], local: J[], remote: J[], c: Ctx): J[] {
  if ([...local, ...remote, ...base].every(hasId) && local.length + remote.length > 0) {
    const b = new Map((base as (Obj & { id: string })[]).map((x) => [x.id, x]));
    const r = new Map((remote as (Obj & { id: string })[]).map((x) => [x.id, x]));
    const lIds = new Set((local as (Obj & { id: string })[]).map((x) => x.id));
    const out: J[] = [];
    for (const x of local as (Obj & { id: string })[]) {
      const rx = r.get(x.id);
      if (rx) out.push(m(b.get(x.id), x, rx, c));
      else if (!b.has(x.id) || !same(b.get(x.id), x)) out.push(x);
    }
    for (const x of remote as (Obj & { id: string })[]) {
      if (lIds.has(x.id)) continue;
      if (!b.has(x.id) || !same(b.get(x.id), x)) out.push(x);
    }
    return out;
  }
  // Sin id: cuántas veces aparece cada cosa = base + lo que agregó o quitó cada lado.
  const count = (list: J[]) => {
    const n = new Map<string, number>();
    for (const x of list) n.set(JSON.stringify(x), (n.get(JSON.stringify(x)) ?? 0) + 1);
    return n;
  };
  const cb = count(base);
  const cl = count(local);
  const cr = count(remote);
  const want = new Map<string, number>();
  for (const k of new Set([...cl.keys(), ...cr.keys()])) want.set(k, Math.max(0, (cl.get(k) ?? 0) + (cr.get(k) ?? 0) - (cb.get(k) ?? 0)));
  const out: J[] = [];
  for (const x of [...local, ...remote]) {
    const k = JSON.stringify(x);
    const left = want.get(k) ?? 0;
    if (left > 0) {
      out.push(x);
      want.set(k, left - 1);
    }
  }
  return out;
}
