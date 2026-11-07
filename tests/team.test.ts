import { describe, expect, it } from 'vitest';
import { rangeDates } from '../src/lib/dates';
import { cycleWeeks, weeklyPcts, type Days } from '../src/lib/engine';
import { grandStatus } from '../src/lib/rewards';
import { initialState } from '../src/lib/store';
import { parseShare, sameStart, teamWeeks, victoryCount } from '../src/lib/team';
import type { Habit } from '../src/lib/types';

const START = '2026-11-08';
const H: Habit[] = [
  { id: 'a', name: 'A', q: '', ok: '', fail: '', phrase: '' },
  { id: 'b', name: 'B', q: '', ok: '', fail: '', phrase: '' },
];

describe('semanas del ciclo', () => {
  it('13 semanas en 90 días; la última de 6', () => {
    const st = initialState({ startDate: START, habits: H });
    const weeks = cycleWeeks(st.settings);
    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toEqual({ index: 1, start: '2026-11-08', end: '2026-11-14' });
    expect(weeks[12]).toEqual({ index: 13, start: '2027-01-31', end: '2027-02-05' });
  });

  it('comparte solo el porcentaje de las semanas que ya empezaron', () => {
    const st = initialState({ startDate: START, habits: H });
    const days: Days = {};
    for (const d of rangeDates('2026-11-08', '2026-11-14')) days[d] = { states: { a: 'ok', b: 'ok' }, triggers: {} };
    days['2026-11-15'] = { states: { a: 'ok', b: 'fail' }, triggers: {} };
    expect(weeklyPcts(st.settings, days, '2026-11-15')).toEqual({ '2026-11-08': 100, '2026-11-15': 50 });
  });
});

describe('semana victoriosa', () => {
  const weeks = [
    { index: 1, start: '2026-11-08', end: '2026-11-14' },
    { index: 2, start: '2026-11-15', end: '2026-11-21' },
    { index: 3, start: '2026-11-22', end: '2026-11-28' },
  ];

  it('el promedio de las dos apps llega a 80 %, y solo al cerrar la semana', () => {
    const own = { '2026-11-08': 90, '2026-11-15': 70, '2026-11-22': 100 };
    const other = { '2026-11-08': 70, '2026-11-15': 80, '2026-11-22': 100 };
    const list = teamWeeks(weeks, own, other, '2026-11-22');
    expect(list.map((w) => w.avg)).toEqual([80, 75, 100]);
    expect(list.map((w) => w.victory)).toEqual([true, false, false]); // la 3 todavía está en curso
    expect(victoryCount(list)).toBe(1);
    expect(victoryCount(teamWeeks(weeks, own, other, '2026-11-28'))).toBe(2); // el último día ya cuenta
  });

  it('sin la otra app no hay semanas victoriosas', () => {
    const list = teamWeeks(weeks, { '2026-11-08': 100 }, null, '2026-11-20');
    expect(list[0]).toMatchObject({ own: 100, other: null, avg: null, victory: false });
  });

  it('lee solo números válidos de la otra app', () => {
    expect(parseShare(null)).toBeNull();
    expect(parseShare('no')).toBeNull();
    expect(parseShare('{"v":2}')).toBeNull();
    const share = parseShare(JSON.stringify({ v: 1, start: START, weeks: { '2026-11-08': 120, x: 5, '2026-11-15': 'mucho' }, grandClaimed: true, nombre: 'no' }));
    expect(share).toEqual({ v: 1, start: START, weeks: { '2026-11-08': 100 }, grandClaimed: true, at: '' });
    expect(sameStart(START, share)).toBe(true);
    expect(sameStart('2026-11-09', share)).toBe(false);
  });

  it('el gran premio con semanas victoriosas espera el día 90 y las semanas', () => {
    const st = initialState({ startDate: START, habits: H, grand: { name: 'Gran premio', price: 500, weeks: 9 } });
    expect(grandStatus(st.settings, st, '2026-12-01', 3)).toMatchObject({ kind: 'locked', victories: 3, required: 9, daysLeft: 66 });
    expect(grandStatus(st.settings, st, '2027-02-05', 8)).toMatchObject({ kind: 'locked', daysLeft: 0 });
    expect(grandStatus(st.settings, st, '2027-02-05', 9)).toMatchObject({ kind: 'available', victories: 9, required: 9 });
  });
});
