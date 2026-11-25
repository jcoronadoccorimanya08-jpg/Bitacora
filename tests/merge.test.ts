import { describe, expect, it } from 'vitest';
import { merge3 } from '../src/lib/merge';

const o = (preferRemote = false) => ({ additive: ['balance'], preferRemote });

describe('juntar dos versiones', () => {
  it('lo que cambió en un solo lado se queda', () => {
    expect(merge3({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }, o())).toEqual({ a: 2, b: 3 });
  });
  it('los saldos suman lo que cambió en cada lado; otros números: gana el más reciente', () => {
    expect(merge3({ balance: 100, rate: 1 }, { balance: 90, rate: 2 }, { balance: 70, rate: 3 }, o(true))).toEqual({ balance: 60, rate: 3 });
    expect(merge3({ balance: 0.1 }, { balance: 0.3 }, { balance: 0.2 }, o()).balance).toBe(0.4);
  });
  it('listas con id: se juntan, y lo borrado en un lado se borra', () => {
    const base = [{ id: 'a' }, { id: 'b' }];
    expect(merge3(base, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ id: 'b' }, { id: 'd' }], o())).toEqual([{ id: 'b' }, { id: 'c' }, { id: 'd' }]);
  });
  it('lo editado en un lado no se borra aunque el otro lo quite', () => {
    expect(merge3([{ id: 'a', n: 1 }], [{ id: 'a', n: 2 }], [], o())).toEqual([{ id: 'a', n: 2 }]);
  });
  it('listas sin id: cuenta cada cosa (dos pagos iguales siguen siendo dos)', () => {
    const p = { date: 'x', amount: 5 };
    expect(merge3([p], [p, p], [p], o())).toEqual([p, p]);
    expect(merge3([p], [], [p, { date: 'y', amount: 1 }], o())).toEqual([{ date: 'y', amount: 1 }]);
  });
  it('objetos por fecha (días): junta las llaves', () => {
    expect(merge3({ d1: { x: 1 } }, { d1: { x: 1 }, d2: { x: 2 } }, { d1: { x: 5 }, d3: { x: 3 } }, o())).toEqual({ d1: { x: 5 }, d2: { x: 2 }, d3: { x: 3 } });
  });
});
