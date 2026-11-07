import { describe, expect, it } from 'vitest';
import { parseFile, serializeBackup } from '../src/lib/backup';
import {
  decryptBytes,
  decryptJSON,
  deriveKey,
  encryptBytes,
  encryptJSON,
  importDataKey,
  keyFromPrf,
  newDataKey,
  randomBytes,
  toB64,
} from '../src/lib/crypto';
import { sanitizeHabits, sanitizeState } from '../src/lib/sanitize';
import { initialState } from '../src/lib/store';
import type { Habit } from '../src/lib/types';

const ITER = 1000; // iteraciones bajas solo para que las pruebas sean rápidas
const HABITS: Habit[] = [{ id: 'a', name: 'Hábito privado', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: 'Mi frase', value: { kind: 'bs', amount: 5 } }];

describe('cifrado por sobre', () => {
  it('la llave de datos se abre con el patrón correcto y con la huella', async () => {
    const dk = newDataKey();
    const salt = randomBytes(16);
    const wrappedByPattern = await encryptBytes(await deriveKey('0-4-8-5', salt, ITER), dk);
    const prf = randomBytes(32);
    const wrappedByBio = await encryptBytes(await keyFromPrf(prf), dk);

    expect(await decryptBytes(await deriveKey('0-4-8-5', salt, ITER), wrappedByPattern)).toEqual(dk);
    expect(await decryptBytes(await keyFromPrf(prf), wrappedByBio)).toEqual(dk);
    await expect(decryptBytes(await deriveKey('0-1-2-5', salt, ITER), wrappedByPattern)).rejects.toBeTruthy();
    await expect(decryptBytes(await keyFromPrf(randomBytes(32)), wrappedByBio)).rejects.toBeTruthy();
  });

  it('los datos cifrados no muestran el contenido', async () => {
    const key = await importDataKey(newDataKey());
    const state = initialState({ startDate: '2026-11-08', habits: HABITS, partyBonus: 200 });
    const sealed = await encryptJSON(key, state);
    expect(sealed.ct).not.toContain('privado');
    expect(sealed.ct).not.toContain('frase');
    const back = sanitizeState(await decryptJSON(key, sealed));
    expect(back?.settings.habits[0]?.value).toEqual({ kind: 'bs', amount: 5 });
    expect(back?.settings.partyBonus).toBe(200);
  });

  it('cada guardado usa un vector distinto', async () => {
    const key = await importDataKey(newDataKey());
    const a = await encryptJSON(key, { x: 1 });
    const b = await encryptJSON(key, { x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe('respaldos y configuración', () => {
  it('un respaldo en texto se lee de vuelta', async () => {
    const salt = randomBytes(16);
    const record = {
      v: 2 as const,
      lock: { pattern: { iter: ITER, salt: toB64(salt), wrapped: await encryptBytes(await deriveKey('0-4-8', salt, ITER), newDataKey()) } },
      data: await encryptJSON(await importDataKey(newDataKey()), { x: 1 }),
    };
    expect(parseFile(serializeBackup(record))).toEqual({ kind: 'backup', record });
  });

  it('rechaza archivos de otras apps, texto roto y respaldos de la versión con PIN', () => {
    expect(() => parseFile('{"app":"otra"}')).toThrow('Este archivo no es de Bitácora.');
    expect(() => parseFile('no es json')).toThrow('El texto no es válido.');
    expect(() => parseFile(JSON.stringify({ app: 'bitacora', kind: 'backup', schema: 1, sealed: { ct: 'x' } }))).toThrow('versión anterior');
  });

  it('lee la configuración con valores, premios con precio, gran premio y fiesta', () => {
    const file = parseFile(
      JSON.stringify({
        app: 'bitacora',
        kind: 'config',
        habits: [
          { id: 'x', name: 'Hábito', q: '¿Día limpio?', ok: 'Limpio', f: 'Caí', fr: 'Frase', value: { kind: 'bs', amount: 5 } },
          { id: 'y', name: 'Otro', value: { kind: 'dias', amount: 1, label: 'Mente clara' } },
          { id: 'z', name: 'Tercero', value: { kind: 'raro', amount: 3 } },
        ],
        triggers: ['Estrés'],
        milestones: [
          { day: 14, name: 'Cine', price: 120 },
          { day: 7, name: 'Comida', price: 100 },
          { day: 10, name: 'No es escalón', price: 1 },
        ],
        grand: { name: 'Gran premio', price: 500 },
        partyBonus: 200,
      }),
    );
    expect(file).toEqual({
      kind: 'config',
      habits: [
        { id: 'x', name: 'Hábito', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: 'Frase', value: { kind: 'bs', amount: 5 } },
        { id: 'y', name: 'Otro', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: '', value: { kind: 'dias', amount: 1, label: 'Mente clara' } },
        { id: 'z', name: 'Tercero', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: '' },
      ],
      triggers: ['Estrés'],
      milestones: [
        { day: 7, name: 'Comida', price: 100 },
        { day: 14, name: 'Cine', price: 120 },
      ],
      grand: { name: 'Gran premio', price: 500 },
      partyBonus: 200,
    });
  });

  it('genera ids estables y únicos', () => {
    const hs = sanitizeHabits([{ name: 'Comer con pantallas' }, { name: 'Comer con pantallas' }]);
    expect(hs.map((h) => h.id)).toEqual(['comer-con-pantallas', 'comer-con-pantallas-2']);
  });

  it('descarta datos inválidos al restaurar y conserva premios, cofres y comodines', () => {
    const base = initialState({ startDate: '2026-11-08', habits: HABITS });
    const st = sanitizeState({
      ...base,
      days: { 'no-fecha': {}, '2026-11-10': { states: { a: 'quizás' } }, '2026-11-11': { states: { a: 'ok' }, triggers: {}, wildcard: true, party: true } },
      claims: { '7': { claimedAt: '2026-11-15T00:00:00Z', price: 100 }, grand: { claimedAt: '', price: 500 }, hack: { price: 1 } },
      chests: { '35': { outcome: 'bs50', openedAt: '' }, '84a': { outcome: 'wildcard', openedAt: '' }, x: { outcome: 'bs50' }, '49': { outcome: 'oro' } },
      urges: 3,
    });
    expect(st?.days).toEqual({
      '2026-11-10': { states: {}, triggers: {} },
      '2026-11-11': { states: { a: 'ok' }, triggers: {}, wildcard: true, party: true },
    });
    expect(Object.keys(st?.claims ?? {})).toEqual(['7', 'grand']);
    expect(Object.keys(st?.chests ?? {})).toEqual(['35', '84a']);
    expect(st?.urges).toBe(3);
    expect(sanitizeState({ ...base, schema: 1 })).toBeNull();
  });
});

describe('pegar sin dolores de cabeza', () => {
  const config = { app: 'bitacora', kind: 'config', habits: [{ name: 'Hábito “con comillas”', phrase: 'Frase' }], triggers: ['Estrés'] };

  it('si pegas solo el nombre del archivo, te lo dice', () => {
    expect(() => parseFile('bitacora-configuracion-v2.txt ..')).toThrow('Pegaste solo el nombre del archivo');
    expect(() => parseFile('no es json')).toThrow('El texto no es válido.');
  });

  it('acepta texto de más alrededor, caracteres invisibles y espacios raros', () => {
    const pasted = `Mira esto:\n﻿${JSON.stringify(config, null, 2).replace(/ {2}/g, '  ')}\nlisto`;
    const f = parseFile(pasted);
    expect(f.kind).toBe('config');
    if (f.kind === 'config') expect(f.habits[0]?.name).toBe('Hábito “con comillas”');
  });

  it('acepta comillas tipográficas cuando el texto se copió desde una nota', () => {
    const smart = JSON.stringify({ app: 'bitacora', kind: 'config', habits: [{ name: 'Uno' }], triggers: [] }).replace(/"/g, (_, i: number) => (i % 2 ? '”' : '“'));
    const f = parseFile(smart);
    expect(f.kind === 'config' && f.habits[0]?.name).toBe('Uno');
  });
});
