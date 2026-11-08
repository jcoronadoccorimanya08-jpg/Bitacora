import { describe, expect, it } from 'vitest';
import { rangeDates } from '../src/lib/dates';
import { initialState } from '../src/lib/store';
import type { Habit } from '../src/lib/types';
import { buildWidgetPayload } from '../src/lib/widget';

const START = '2026-11-09';
const H: Habit[] = [
  { id: 'a', name: 'Hábito privado', q: '', ok: '', fail: '', phrase: 'Frase privada' },
  { id: 'b', name: 'Otro', q: '', ok: '', fail: '', phrase: '' },
];

describe('resumen para el widget (discreto)', () => {
  it('antes del inicio no hay días', () => {
    const st = initialState({ startDate: START, habits: H, grand: { name: 'Premio privado', price: 100 } });
    expect(buildWidgetPayload(st, '2026-11-08')).toMatchObject({ v: 1, app: 'bitacora', dayNumber: 0, streak: 0, days: [] });
  });

  it('solo números: racha, % limpio por día y nada de nombres', () => {
    const st = initialState({ startDate: START, habits: H, grand: { name: 'Premio privado', price: 100 } });
    for (const d of rangeDates('2026-11-09', '2026-11-11')) st.days[d] = { states: { a: 'ok', b: 'ok' }, triggers: {} };
    st.days['2026-11-12'] = { states: { a: 'ok', b: 'fail' }, triggers: { b: ['Estrés'] } };
    const p = buildWidgetPayload(st, '2026-11-12');
    expect(p.streak).toBe(3);
    expect(p.days.map((x) => [x.p, x.w])).toEqual([
      [100, true],
      [100, true],
      [100, true],
      [50, false],
    ]);
    expect(p.todayPct).toBe(50);
    const text = JSON.stringify(p);
    for (const word of ['privado', 'privada', 'Otro', 'Estrés']) expect(text).not.toContain(word);
  });
});

describe('widget v2 (discreto)', () => {
  it('ahorro, próximo escalón sin nombre y color', () => {
    const habits: Habit[] = [{ ...H[0]!, value: { kind: 'bs', amount: 10 } }, { ...H[1]!, value: { kind: 'horas', amount: 1 } }];
    const st = initialState({ startDate: START, habits, milestones: [{ day: 7, name: 'Premio privado', price: 50 }] });
    for (const d of rangeDates('2026-11-09', '2026-11-11')) st.days[d] = { states: { a: 'ok', b: 'ok' }, triggers: {} };
    const p = buildWidgetPayload(st, '2026-11-11');
    expect(p).toMatchObject({ savedBs: 30, horas: 3, nextStep: 4, nextKind: 'premio', accent: 'verde' });
    expect(JSON.stringify(p)).not.toContain('privado');
  });
});
