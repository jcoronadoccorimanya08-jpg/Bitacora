import { describe, expect, it } from 'vitest';
import { rangeDates } from '../src/lib/dates';
import {
  dailySeries,
  dayPct,
  dayState,
  fallsByWeekday,
  habitStats,
  isEarned,
  milestones,
  nextMilestone,
  rewardRows,
  savings,
  streakStats,
  triggerCounts,
  weekPct,
  type Days,
} from '../src/lib/engine';
import { buildReport } from '../src/lib/report';
import type { AppState, Habit, Mark, Settings } from '../src/lib/types';

const START = '2026-11-09'; // lunes
const H: Habit[] = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), q: '¿?', ok: 'Limpio', fail: 'Caí', phrase: '' }));

function settings(): Settings {
  return {
    startDate: START,
    cycleLength: 90,
    habits: H,
    triggers: ['Estrés', 'Soledad'],
    milestones: [{ day: 7, name: 'Comer carne', price: 100 }],
    grand: { name: 'Gran premio', price: 500 },
    partyBonus: 0,
    theme: 'system',
    autoLockMinutes: 1,
    createdAt: '',
  };
}

/** Días limpios (todos ok) */
function clean(days: Days, dates: string[]): Days {
  for (const d of dates) days[d] = { states: { a: 'ok', b: 'ok', c: 'ok' }, triggers: {} };
  return days;
}

function set(days: Days, date: string, states: Record<string, Mark>, triggers: Record<string, string[]> = {}): Days {
  days[date] = { states, triggers };
  return days;
}

describe('racha', () => {
  const s = settings();

  it('cuenta días limpios seguidos', () => {
    const days = clean({}, rangeDates('2026-11-09', '2026-11-13'));
    expect(streakStats(s, days, '2026-11-13')).toMatchObject({ run: 5, best: 5, misses: 0 });
  });

  it('una caída suelta no rompe la racha (solo no suma)', () => {
    const days = clean({}, ['2026-11-09', '2026-11-10', '2026-11-12']);
    set(days, '2026-11-11', { a: 'ok', b: 'fail', c: 'ok' });
    expect(streakStats(s, days, '2026-11-12')).toMatchObject({ run: 3, best: 3, misses: 0 });
  });

  it('dos días seguidos sin día limpio reinician la racha', () => {
    const days = clean({}, ['2026-11-09', '2026-11-10', '2026-11-13']);
    set(days, '2026-11-11', { a: 'fail', b: 'ok', c: 'ok' });
    set(days, '2026-11-12', { a: 'fail', b: 'ok', c: 'ok' });
    expect(streakStats(s, days, '2026-11-13')).toMatchObject({ run: 1, best: 2 });
  });

  it('hoy incompleto y sin caídas todavía no cuenta como fallo', () => {
    const days = clean({}, ['2026-11-09', '2026-11-10']);
    set(days, '2026-11-11', { a: 'ok' });
    expect(streakStats(s, days, '2026-11-11')).toMatchObject({ run: 2, misses: 0 });
  });

  it('una caída hoy sí cuenta y avisa que mañana no se negocia', () => {
    const days = clean({}, ['2026-11-09', '2026-11-10']);
    set(days, '2026-11-11', { a: 'fail' });
    expect(streakStats(s, days, '2026-11-11')).toMatchObject({ run: 2, misses: 1 });
  });

  it('un día pasado sin marcar cuenta como no limpio', () => {
    const days = clean({}, ['2026-11-09', '2026-11-10']);
    // 11 y 12 sin marcar → dos seguidas → racha a 0
    expect(streakStats(s, days, '2026-11-13').run).toBe(0);
    expect(streakStats(s, days, '2026-11-13').best).toBe(2);
  });

  it('un día salvado con comodín cuenta como limpio', () => {
    const days = clean({}, ['2026-11-09', '2026-11-12']);
    set(days, '2026-11-10', { a: 'fail' });
    set(days, '2026-11-11', { a: 'fail' });
    expect(streakStats(s, days, '2026-11-12')).toMatchObject({ run: 1, best: 1 });
    days['2026-11-11'] = { ...days['2026-11-11']!, wildcard: true };
    expect(streakStats(s, days, '2026-11-12')).toMatchObject({ run: 3, best: 3, misses: 0 });
    expect(dayPct(days, '2026-11-11', H)).toBe(100);
  });

  it('antes del inicio no hay racha', () => {
    expect(streakStats(s, {}, '2026-11-01')).toMatchObject({ run: 0, best: 0 });
  });
});

describe('escalones y premios', () => {
  it('cada 7 días hasta el día 84 en un ciclo de 90', () => {
    const ms = milestones(90);
    expect(ms[0]).toBe(7);
    expect(ms.at(-1)).toBe(84);
    expect(ms).toHaveLength(12);
  });

  it('próximo escalón', () => {
    expect(nextMilestone(0, 90)).toBe(7);
    expect(nextMilestone(7, 90)).toBe(14);
    expect(nextMilestone(84, 90)).toBeNull();
  });

  it('un premio se gana con la mejor racha', () => {
    expect(isEarned(1, 6)).toBe(false);
    expect(isEarned(1, 7)).toBe(true);
    expect(isEarned(2, 13)).toBe(false);
  });

  it('se muestran al menos 4 filas de premios y dos más que lo alcanzado', () => {
    expect(rewardRows(0, 90)).toBe(4);
    expect(rewardRows(21, 90)).toBe(5);
    expect(rewardRows(90, 90)).toBe(12);
  });
});

describe('análisis', () => {
  const s = settings();

  it('cuenta disparadores', () => {
    const days: Days = {};
    set(days, '2026-11-09', { a: 'fail' }, { a: ['Estrés', 'Soledad'] });
    set(days, '2026-11-10', { b: 'fail' }, { b: ['Estrés'] });
    expect(triggerCounts(days, ['2026-11-09', '2026-11-10'])).toEqual([
      ['Estrés', 2],
      ['Soledad', 1],
    ]);
  });

  it('caídas por día de la semana (lunes primero)', () => {
    const days: Days = {};
    set(days, '2026-11-09', { a: 'fail', b: 'fail' }); // lunes
    set(days, '2026-11-15', { c: 'fail' }); // domingo
    expect(fallsByWeekday(s, days, rangeDates('2026-11-09', '2026-11-15'))).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });

  it('estadística por hábito', () => {
    const days = clean({}, ['2026-11-09']);
    set(days, '2026-11-10', { a: 'fail', b: 'ok' });
    const [a] = habitStats(s, days, ['2026-11-09', '2026-11-10']);
    expect(a).toMatchObject({ ok: 1, fail: 1, pct: 50 });
  });

  it('estado de cada día', () => {
    const days = clean({}, ['2026-11-09']);
    set(days, '2026-11-10', { a: 'fail' });
    set(days, '2026-11-11', { a: 'ok' });
    expect(dayState(s, days, H, '2026-11-09', '2026-11-12')).toBe('clean');
    expect(dayState(s, days, H, '2026-11-10', '2026-11-12')).toBe('fail');
    expect(dayState(s, days, H, '2026-11-11', '2026-11-12')).toBe('partial');
    expect(dayState(s, days, H, '2026-11-12', '2026-11-12')).toBe('empty');
    expect(dayState(s, days, H, '2026-11-13', '2026-11-12')).toBe('future');
  });

  it('reporte para Claude', () => {
    const days = clean({}, ['2026-11-09', '2026-11-10']);
    set(days, '2026-11-11', { a: 'fail', b: 'ok', c: 'ok' }, { a: ['Estrés'] });
    const state: AppState = { schema: 2, settings: s, days, claims: {}, chests: {}, urges: 2 };
    const text = buildReport(state, '2026-11-11');
    expect(text).toContain('día 3/90');
    expect(text).toContain('Racha: 2 días · mejor 2 · próximo escalón: día 7');
    expect(text).toContain('Disparadores (7 días): Estrés (1)');
    expect(text).toContain('Próximo premio (día 7): Comer carne · Bs 100');
    expect(text).toContain('Antojos superados con el botón de urgencia: 2');
    expect(text).toContain('Gran premio: Gran premio (Bs 500) · faltan 87 días');
    expect(text).not.toContain('Ahorro:');
  });
});

describe('ahorro y contadores', () => {
  const VH: Habit[] = [
    { id: 'a', name: 'A', q: '', ok: '', fail: '', phrase: '', value: { kind: 'bs', amount: 5 } },
    { id: 'b', name: 'B', q: '', ok: '', fail: '', phrase: '', value: { kind: 'horas', amount: 1.5 } },
    { id: 'c', name: 'C', q: '', ok: '', fail: '', phrase: '', value: { kind: 'dias', amount: 1, label: 'Mente clara' } },
    { id: 'd', name: 'D', q: '', ok: '', fail: '', phrase: '' },
  ];
  const s: Settings = { ...settings(), habits: VH, partyBonus: 200 };

  it('cada día limpio de un hábito suma su valor; una caída no suma pero no resta', () => {
    const days: Days = {};
    set(days, '2026-11-09', { a: 'ok', b: 'ok', c: 'ok', d: 'ok' });
    set(days, '2026-11-10', { a: 'fail', b: 'ok', c: 'fail' });
    set(days, '2026-11-11', { a: 'ok', b: 'fail', c: 'ok' });
    days['2026-11-11']!.party = true;
    const sv = savings(s, days, '2026-11-11');
    expect(sv.bs).toBe(5 * 2 + 200);
    expect(sv.horas).toBe(3);
    expect(sv.dias).toEqual([{ habit: VH[2], days: 2, label: 'Mente clara' }]);
    expect(sv.parties).toBe(1);
    expect(sv.byHabit.map((x) => x.total)).toEqual([10, 3, 2]);
  });

  it('no cuenta días futuros ni días antes del inicio', () => {
    const days: Days = {};
    set(days, '2026-11-08', { a: 'ok' });
    set(days, '2026-11-12', { a: 'ok' });
    expect(savings(s, days, '2026-11-11').bs).toBe(0);
  });
});

describe('montaña y semanas', () => {
  const s = settings();

  it('serie diaria con promedio de 7 días; hoy sin marcar no entra', () => {
    const days = clean({}, ['2026-11-09']);
    set(days, '2026-11-10', { a: 'ok', b: 'fail' });
    const series = dailySeries(s, days, '2026-11-11');
    expect(series.map((p) => Math.round(p.pct))).toEqual([100, 33]);
    expect(Math.round(series[1]!.avg7)).toBe(67);
    expect(series[0]!.won).toBe(true);
  });

  it('porcentaje de una semana del ciclo', () => {
    const days = clean({}, rangeDates('2026-11-09', '2026-11-15'));
    expect(weekPct(s, days, 1, '2026-11-20')).toBe(100);
    expect(weekPct(s, days, 2, '2026-11-20')).toBe(0);
    expect(weekPct(s, days, 3, '2026-11-20')).toBeNull();
  });
});
