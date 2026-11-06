import { describe, expect, it } from 'vitest';
import { parseFile, openBackup, serializeBackup } from '../src/lib/backup';
import { deriveKey, randomBytes, seal, unseal } from '../src/lib/crypto';
import { sanitizeHabits, sanitizeState } from '../src/lib/sanitize';

const ITER = 1000; // iteraciones bajas solo para que las pruebas sean rápidas

describe('cifrado', () => {
  it('cifra y descifra con el PIN correcto', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('2468', salt, ITER);
    const sealed = await seal(key, salt, ITER, { hola: 'mundo' });
    expect(sealed.ct).not.toContain('mundo');
    expect(await unseal(key, sealed)).toEqual({ hola: 'mundo' });
  });

  it('falla con un PIN incorrecto', async () => {
    const salt = randomBytes(16);
    const sealed = await seal(await deriveKey('2468', salt, ITER), salt, ITER, { x: 1 });
    await expect(unseal(await deriveKey('1357', salt, ITER), sealed)).rejects.toBeTruthy();
  });

  it('cada guardado usa un vector distinto', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('2468', salt, ITER);
    const a = await seal(key, salt, ITER, { x: 1 });
    const b = await seal(key, salt, ITER, { x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe('respaldos y configuración', () => {
  const state = {
    schema: 1,
    settings: {
      startDate: '2026-11-09',
      cycleLength: 90,
      habits: [{ id: 'a', name: 'A', q: '¿?', ok: 'Limpio', fail: 'Caí', phrase: '' }],
      triggers: ['Estrés'],
      theme: 'system',
      autoLockMinutes: 1,
      createdAt: '',
    },
    days: { '2026-11-09': { states: { a: 'ok' }, triggers: {} } },
    rewards: {},
  };

  it('un respaldo se abre solo con su PIN', async () => {
    const salt = randomBytes(16);
    const sealed = await seal(await deriveKey('9090', salt, ITER), salt, ITER, state);
    const file = parseFile(serializeBackup(sealed));
    expect(file.kind).toBe('backup');
    if (file.kind !== 'backup') return;
    await expect(openBackup(file.sealed, '0000')).rejects.toThrow('PIN');
    const restored = await openBackup(file.sealed, '9090');
    expect(restored.days['2026-11-09']?.states.a).toBe('ok');
  });

  it('lee un archivo de configuración con los nombres cortos del prototipo', () => {
    const file = parseFile(
      JSON.stringify({ app: 'bitacora', kind: 'config', habits: [{ id: 'x', name: 'Hábito', q: '¿Día limpio?', ok: 'Limpio', f: 'Caí', fr: 'Frase' }], triggers: ['Estrés'] }),
    );
    expect(file).toEqual({
      kind: 'config',
      habits: [{ id: 'x', name: 'Hábito', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: 'Frase' }],
      triggers: ['Estrés'],
    });
  });

  it('rechaza archivos de otras apps', () => {
    expect(() => parseFile('{"app":"otra"}')).toThrow('Este archivo no es de Bitácora.');
    expect(() => parseFile('no es json')).toThrow('El archivo no es válido.');
  });

  it('genera ids estables y únicos', () => {
    const hs = sanitizeHabits([{ name: 'Comer con pantallas' }, { name: 'Comer con pantallas' }]);
    expect(hs.map((h) => h.id)).toEqual(['comer-con-pantallas', 'comer-con-pantallas-2']);
  });

  it('descarta datos inválidos al restaurar', () => {
    const st = sanitizeState({ ...state, days: { 'no-fecha': {}, '2026-11-10': { states: { a: 'quizás' } } } });
    expect(st?.days).toEqual({ '2026-11-10': { states: {}, triggers: {} } });
  });
});
