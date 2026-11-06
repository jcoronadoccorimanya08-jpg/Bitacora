import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatLong,
  formatRange,
  isValidISODate,
  localDateOf,
  nextMonday,
  plural,
  rangeDates,
  todayISO,
  weekday,
} from '../src/lib/dates';

describe('fechas en hora de La Paz', () => {
  it('a las 23:30 en La Paz sigue siendo el mismo día, aunque en UTC ya sea mañana', () => {
    // 2026-11-07 03:30 UTC = 2026-11-06 23:30 en La Paz (UTC−4)
    expect(todayISO(new Date('2026-11-07T03:30:00Z'))).toBe('2026-11-06');
  });

  it('a las 00:10 en La Paz ya es el día siguiente', () => {
    expect(todayISO(new Date('2026-11-07T04:10:00Z'))).toBe('2026-11-07');
  });

  it('un respaldo hecho a las 22:00 en La Paz queda con la fecha de ese día', () => {
    expect(localDateOf('2026-11-07T02:00:00.000Z')).toBe('2026-11-06');
  });

  it('plural en español', () => {
    expect(plural(1, 'día', 'días')).toBe('1 día');
    expect(plural(3, 'día', 'días')).toBe('3 días');
  });
});

describe('aritmética de días', () => {
  it('suma días cruzando mes y año', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('calcula la diferencia de días', () => {
    expect(diffDays('2026-11-06', '2027-02-03')).toBe(89);
    expect(diffDays('2026-11-06', '2026-11-06')).toBe(0);
  });

  it('valida fechas reales', () => {
    expect(isValidISODate('2026-11-06')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('6/11/2026')).toBe(false);
  });

  it('genera rangos inclusivos', () => {
    expect(rangeDates('2026-11-06', '2026-11-08')).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('el 6 de noviembre de 2026 es viernes y el próximo lunes es el 9', () => {
    expect(weekday('2026-11-06')).toBe(5);
    expect(nextMonday('2026-11-06')).toBe('2026-11-09');
    expect(nextMonday('2026-11-09')).toBe('2026-11-16');
  });
});

describe('formato en español', () => {
  it('formatea fechas largas y rangos', () => {
    expect(formatLong('2026-11-06')).toBe('viernes 6 de noviembre');
    expect(formatRange('2026-11-09', '2026-11-15')).toBe('9–15 nov');
    expect(formatRange('2026-11-30', '2026-12-06')).toBe('30 nov – 6 dic');
  });
});
