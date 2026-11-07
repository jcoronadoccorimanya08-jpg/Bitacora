import { describe, expect, it } from 'vitest';
import { rangeDates } from '../src/lib/dates';
import type { Days } from '../src/lib/engine';
import { chestFromRoll, claimable, grandStatus, nextPrize, pendingChests, steps, wallet, wildcards, withClaims } from '../src/lib/rewards';
import { initialState } from '../src/lib/store';
import type { Habit, Milestone } from '../src/lib/types';

const START = '2026-11-08';
const H: Habit[] = [
  { id: 'a', name: 'A', q: '', ok: '', fail: '', phrase: '', value: { kind: 'bs', amount: 10 } },
  { id: 'b', name: 'B', q: '', ok: '', fail: '', phrase: '' },
];
const MS: Milestone[] = [7, 14, 21, 28, 42, 56, 70].map((day) => ({ day, name: `Premio ${day}`, price: day * 10 }));

function cleanDays(days: Days, from: string, to: string): Days {
  for (const d of rangeDates(from, to)) days[d] = { states: { a: 'ok', b: 'ok' }, triggers: {} };
  return days;
}

describe('escalones', () => {
  it('los días sin premio son cofres y el último es doble', () => {
    const st = initialState({ startDate: START, habits: H, milestones: MS });
    const list = steps(st.settings, 0);
    expect(list).toHaveLength(12);
    expect(list.filter((x) => x.kind === 'prize').map((x) => x.day)).toEqual([7, 14, 21, 28, 42, 56, 70]);
    expect(list.filter((x) => x.kind === 'chest').map((x) => x.day)).toEqual([35, 49, 63, 77, 84]);
    const last = list.at(-1)!;
    expect(last.kind === 'chest' && last.keys).toEqual(['84a', '84b']);
  });

  it('se ganan con la mejor racha; los cofres ganados quedan por abrir', () => {
    const st = initialState({ startDate: START, habits: H, milestones: MS });
    st.claims['7'] = { claimedAt: '', price: 70 };
    st.chests['35'] = { outcome: 'bs20', openedAt: '' };
    const list = withClaims(steps(st.settings, 50), st);
    expect(claimable(list).map((x) => x.day)).toEqual([14, 21, 28, 42]);
    expect(pendingChests(list, st)).toEqual(['49']);
    expect(nextPrize(list)?.day).toBe(56);
  });
});

describe('ahorro disponible y gran premio', () => {
  it('ahorro + bonos de cofres − premios reclamados', () => {
    const st = initialState({ startDate: START, habits: H, milestones: MS, partyBonus: 300 });
    cleanDays(st.days, '2026-11-08', '2026-11-14'); // 7 días × Bs 10
    st.days['2026-11-10']!.party = true;
    st.chests['35'] = { outcome: 'bs50', openedAt: '' };
    st.claims['7'] = { claimedAt: '', price: 70 };
    expect(wallet(st.settings, st, '2026-11-14')).toEqual({ saved: 370, bonus: 50, spent: 70, balance: 350 });
  });

  it('el gran premio se reclama desde el día 90 (o su fecha)', () => {
    const st = initialState({ startDate: START, habits: H, grand: { name: 'Gran premio', price: 500 } });
    expect(grandStatus(st.settings, st, '2026-11-08')).toEqual({ kind: 'locked', target: '2027-02-05', daysLeft: 89, victories: 0, required: 0 });
    expect(grandStatus(st.settings, st, '2027-02-05')).toEqual({ kind: 'available', target: '2027-02-05', victories: 0, required: 0 });
    st.claims.grand = { claimedAt: 'x', price: 500 };
    expect(grandStatus(st.settings, st, '2027-02-06')).toEqual({ kind: 'claimed', claimedAt: 'x' });
    const dated = initialState({ startDate: START, habits: H, grand: { name: 'G', date: '2027-01-10' } });
    expect(grandStatus(dated.settings, dated, '2027-01-09')).toMatchObject({ kind: 'locked', daysLeft: 1 });
    expect(grandStatus(initialState({ startDate: START, habits: H }).settings, { claims: {} }, START)).toEqual({ kind: 'none' });
  });
});

describe('cofres y comodines', () => {
  it('reparte el cofre según la tirada', () => {
    expect(chestFromRoll(0)).toBe('bs20');
    expect(chestFromRoll(0.4)).toBe('bs50');
    expect(chestFromRoll(0.6)).toBe('wildcard');
    expect(chestFromRoll(0.9)).toBe('series');
  });

  it('los comodines salen de los cofres y se gastan salvando días', () => {
    const st = initialState({ startDate: START, habits: H });
    st.chests['35'] = { outcome: 'wildcard', openedAt: '' };
    st.chests['49'] = { outcome: 'wildcard', openedAt: '' };
    st.days['2026-11-20'] = { states: {}, triggers: {}, wildcard: true };
    expect(wildcards(st)).toEqual({ earned: 2, used: 1, available: 1 });
  });
});
