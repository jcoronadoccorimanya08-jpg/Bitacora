import { describe, expect, it } from 'vitest';
import { rangeDates } from '../src/lib/dates';
import { badgeBlocks, earnedTiers } from '../src/lib/badges';
import { moodStats, type Days } from '../src/lib/engine';
import { sanitizeState } from '../src/lib/sanitize';
import { initialState } from '../src/lib/store';
import type { Habit } from '../src/lib/types';

const START = '2026-11-08';
const H: Habit[] = [
  { id: 'a', name: 'A', q: '', ok: '', fail: '', phrase: '' },
  { id: 'b', name: 'B', q: '', ok: '', fail: '', phrase: '' },
];
const st = initialState({ startDate: START, habits: H });

function clean(days: Days, dates: string[]): Days {
  for (const d of dates) days[d] = { states: { a: 'ok', b: 'ok' }, triggers: {} };
  return days;
}

describe('insignias cada 2 semanas', () => {
  it('6 bloques de 2 semanas; la semana corta del final no cuenta', () => {
    const blocks = badgeBlocks(st.settings, {}, '2026-11-01');
    expect(blocks).toHaveLength(6);
    expect(blocks[0]).toMatchObject({ weeks: [1, 2], start: '2026-11-08', end: '2026-11-21', status: 'future' });
    expect(blocks[5]).toMatchObject({ weeks: [11, 12], end: '2027-01-30' });
  });

  it('se gana con 80 % limpio en 14 días, apenas queda asegurado', () => {
    const days = clean({}, rangeDates('2026-11-08', '2026-11-19')); // 12 días al 100 %: 85,7 % aunque falten 2
    const blocks = badgeBlocks(st.settings, days, '2026-11-19');
    expect(blocks[0]).toMatchObject({ status: 'earned', pct: 100 });
    expect(earnedTiers(blocks)).toEqual(['Bronce']);
  });

  it('sigue abierto mientras alcanza y se pierde cuando ya no', () => {
    const days = clean({}, rangeDates('2026-11-08', '2026-11-10'));
    expect(badgeBlocks(st.settings, days, '2026-11-11')[0]!.status).toBe('open');
    // 3 días en 0 %: lo máximo posible es 11/14 = 78,6 %
    expect(badgeBlocks(st.settings, {}, '2026-11-11')[0]!.status).toBe('missed');
  });

  it('un bloque perdido no quita niveles', () => {
    const days = clean({}, rangeDates('2026-11-22', '2026-12-05'));
    const blocks = badgeBlocks(st.settings, days, '2026-12-05');
    expect(blocks.map((b) => b.status).slice(0, 3)).toEqual(['missed', 'earned', 'future']);
    expect(earnedTiers(blocks)).toEqual(['Bronce']);
  });
});

describe('ánimo del día', () => {
  it('promedia tu porcentaje limpio según el ánimo', () => {
    const days: Days = {
      '2026-11-08': { states: { a: 'ok', b: 'ok' }, triggers: {}, mood: 4 },
      '2026-11-09': { states: { a: 'ok', b: 'fail' }, triggers: {}, mood: 4 },
      '2026-11-10': { states: { a: 'fail' }, triggers: {}, mood: 1 },
    };
    expect(moodStats(st.settings, days, rangeDates('2026-11-08', '2026-11-10'))).toEqual([
      { mood: 4, days: 2, avgPct: 75 },
      { mood: 1, days: 1, avgPct: 0 },
    ]);
  });

  it('se valida al restaurar', () => {
    const back = sanitizeState({ ...st, days: { '2026-11-08': { states: {}, triggers: {}, mood: 3 }, '2026-11-09': { states: {}, triggers: {}, mood: 0 } } });
    expect(back?.days['2026-11-08']?.mood).toBe(3);
    expect(back?.days['2026-11-09']?.mood).toBeUndefined();
  });
});

describe('apariencia', () => {
  it('guarda tema negro, color y letra grande; valores raros vuelven a lo normal', () => {
    const ok = sanitizeState({ ...st, settings: { ...st.settings, theme: 'black', accent: 'lima', textSize: 'grande' } });
    expect(ok?.settings).toMatchObject({ theme: 'black', accent: 'lima', textSize: 'grande' });
    const odd = sanitizeState({ ...st, settings: { ...st.settings, theme: 'neon', accent: 'oro', textSize: 'xl' } });
    expect(odd?.settings.theme).toBe('system');
    expect(odd?.settings.accent).toBeUndefined();
    expect(odd?.settings.textSize).toBeUndefined();
  });
});
