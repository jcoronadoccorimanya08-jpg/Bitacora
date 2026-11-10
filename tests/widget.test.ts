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

describe('widget v3 (discreto): cambia de día solo', () => {
  it('manda mañana y pasado mañana, la semana, si ya marcaste y el escalón', () => {
    const st = initialState({ startDate: START, habits: H, grand: { name: 'Premio privado', price: 100 } });
    for (const d of rangeDates('2026-11-09', '2026-11-11')) st.days[d] = { states: { a: 'ok', b: 'ok' }, triggers: {} };
    const p = buildWidgetPayload(st, '2026-11-11');
    expect(p).toMatchObject({ start: START, streak: 3, todayWon: true, todayDone: true, step: 7, badges: 0 });
    expect(p.week).toEqual({ n: 1, start: START, len: 7, won: 3 });
    expect(p.ahead.map((f) => f.today)).toEqual(['2026-11-12', '2026-11-13']);
    // Mañana sin marcar todavía no cuenta; pasado mañana hay un día sin marcar, pero una caída suelta no rompe la racha.
    expect(p.ahead[0]).toMatchObject({ streak: 3, todayDone: false, todayPct: 0 });
    expect(p.ahead[1]).toMatchObject({ streak: 3, dayNumber: 5 });
    expect(p.ahead[1]!.days.at(-2)).toEqual({ d: '2026-11-12', p: 0, w: false });
    const text = JSON.stringify(p);
    for (const word of ['privado', 'Otro']) expect(text).not.toContain(word);
    st.days['2026-11-12'] = { states: { a: 'ok' }, triggers: {} };
    expect(buildWidgetPayload(st, '2026-11-12').todayDone).toBe(false);
  });

  it('modo prueba: marcado y sin días adelantados', () => {
    const st = initialState({ startDate: START, habits: H });
    const p = buildWidgetPayload(st, '2026-11-20', { test: true });
    expect(p.test).toBe(true);
    expect(p.ahead).toEqual([]);
  });

  it('solo acepta el canal de Chrome en nombre de la app Rachas', async () => {
    const { isRachasOrigin } = await import('../src/lib/widget');
    const self = 'https://jcoronadoccorimanya08-jpg.github.io';
    expect(isRachasOrigin('android-app://jcoronadoccorimanya08-jpg.github.io/io.github.jcoronadoccorimanya08.rachas', self)).toBe(true);
    expect(isRachasOrigin('android-app://io.github.jcoronadoccorimanya08.rachas', self)).toBe(true);
    expect(isRachasOrigin('android-app://io.github.jcoronadoccorimanya08.rachas.otra', self)).toBe(false);
    expect(isRachasOrigin('https://otro-sitio.example', self)).toBe(false);
  });
});

describe('aviso de widget sin actualizar', () => {
  it('solo en Android como app, si pasado un rato no llegó el canal', async () => {
    const { widgetHint } = await import('../src/lib/widget');
    const base = { android: true, standalone: true, waited: true, status: 'off' as const, referrer: '' };
    expect(widgetHint(base)).toBe('outside');
    expect(widgetHint({ ...base, referrer: 'android-app://org.chromium.webapk.a1b2/' })).toBe('outside');
    expect(widgetHint({ ...base, referrer: 'android-app://io.github.jcoronadoccorimanya08.rachas/' })).toBe('failed');
    expect(widgetHint({ ...base, status: 'saved' })).toBeNull();
    expect(widgetHint({ ...base, status: 'connecting' })).toBeNull();
    expect(widgetHint({ ...base, waited: false })).toBeNull();
    expect(widgetHint({ ...base, standalone: false })).toBeNull();
    expect(widgetHint({ ...base, android: false })).toBeNull();
  });
});
