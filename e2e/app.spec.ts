import { expect, test, type Page } from '@playwright/test';

// Sábado 7 de noviembre de 2026, 21:00 en La Paz.
const SATURDAY_NIGHT = new Date('2026-11-07T21:00:00-04:00');
const PATTERN = [1, 2, 3, 6, 9];

async function draw(page: Page, dots: number[]) {
  const centers = [];
  for (const d of dots) {
    const box = await page.locator(`[data-dot="${d}"]`).first().boundingBox();
    if (!box) throw new Error(`sin punto ${d}`);
    centers.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  await page.mouse.move(centers[0]!.x, centers[0]!.y);
  await page.mouse.down();
  for (const c of centers.slice(1)) await page.mouse.move(c.x, c.y, { steps: 6 });
  await page.mouse.up();
}

async function createPattern(page: Page) {
  await expect(page.getByRole('heading', { name: 'Crea tu patrón' })).toBeVisible();
  await draw(page, PATTERN);
  await expect(page.getByRole('heading', { name: 'Repite tu patrón' })).toBeVisible();
  await draw(page, PATTERN);
}

async function setupManual(page: Page, start: 'Hoy' | 'Mañana' = 'Hoy') {
  await page.clock.install({ time: SATURDAY_NIGHT });
  await page.goto('./');
  await page.getByRole('button', { name: 'Configurar a mano' }).click();
  await page.getByRole('button', { name: '+ Procrastinación' }).click();
  await page.getByRole('button', { name: '+ Cigarro' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: '¿Cuándo empiezas?' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${start}`) }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await createPattern(page);
  await expect(page.getByRole('heading', { name: start === 'Hoy' ? 'Día 1 de 90' : 'Tu ciclo está por empezar' })).toBeVisible();
}

async function markClean(page: Page) {
  await page.getByRole('article', { name: 'Procrastinación' }).getByRole('button', { name: 'Cumplí' }).click();
  await page.getByRole('article', { name: 'Cigarro' }).getByRole('button', { name: 'Limpio' }).click();
}

const nav = (page: Page, name: string) => page.locator('nav.nav').getByRole('button', { name }).click();

test('configura con patrón, marca un día limpio, suma el ahorro y lo protege', async ({ page }) => {
  await setupManual(page);
  await markClean(page);
  await expect(page.getByRole('status').filter({ hasText: '¡Día limpio!' })).toBeVisible();
  await expect(page.getByLabel('Racha').locator('.big')).toHaveText('1');
  await expect(page.getByLabel('Tu ahorro')).toContainText('Bs 10');

  // Al recargar pide el patrón; uno incorrecto no abre
  await page.reload();
  await expect(page.getByText('Dibuja tu patrón')).toBeVisible();
  await draw(page, [1, 4, 7, 8]);
  await expect(page.getByRole('alert')).toHaveText('Patrón incorrecto.');
  await draw(page, PATTERN);
  await expect(page.getByRole('heading', { name: 'Día 1 de 90' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Cigarro' }).getByRole('button', { name: 'Limpio' })).toHaveAttribute('aria-pressed', 'true');

  // Todo queda cifrado: los nombres no aparecen en el almacenamiento
  const raw = await page.evaluate(() => localStorage.getItem('bitacora.vault2') ?? '');
  expect(raw.length).toBeGreaterThan(100);
  expect(raw).not.toContain('Procrastinación');
  expect(raw).not.toContain('Cigarro');
});

test('ánimo del día con un toque e insignias en Premios', async ({ page }) => {
  await setupManual(page);
  const mood = page.getByRole('group', { name: 'Tu ánimo' });
  await mood.getByRole('button', { name: 'Bien', exact: true }).click();
  await expect(mood.getByRole('button', { name: 'Bien', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await nav(page, 'Análisis');
  await expect(page.getByRole('region', { name: 'Tu ánimo' })).toContainText('Bien');
  await nav(page, 'Premios');
  await expect(page.getByRole('region', { name: 'Insignias' })).toContainText('0 de 6');
  await expect(page.getByRole('region', { name: 'Insignias' })).toContainText('Leyenda');
});

test('una caída muestra los disparadores y avisa sin juzgar', async ({ page }) => {
  await setupManual(page);
  const cig = page.getByRole('article', { name: 'Cigarro' });
  await cig.getByRole('button', { name: 'Caí' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Anotado. ¿Qué lo disparó?' })).toBeVisible();
  await cig.getByRole('button', { name: 'Estrés' }).click();
  await expect(cig.getByRole('button', { name: 'Estrés' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Hoy hubo una caída. Mañana no se negocia')).toBeVisible();

  await nav(page, 'Análisis');
  await expect(page.getByText('Lo que más te disparó: Estrés (1).')).toBeVisible();
  await expect(page.getByRole('img', { name: /Tu porcentaje diario/ })).toBeVisible();
});

test('botón de urgencia: muestra tu meta, respira 10 minutos y cuenta el antojo', async ({ page }) => {
  await setupManual(page);
  await page.getByRole('button', { name: 'Tengo un antojo' }).click();
  const dlg = page.getByRole('dialog', { name: 'Botón de urgencia' });
  await expect(dlg).toContainText('10:00');
  await expect(dlg).toContainText('«Dos minutos. Solo empiezo.»');
  await dlg.getByRole('button', { name: 'Cigarro' }).click();
  await expect(dlg).toContainText('«No fumo.»');
  await page.clock.runFor(10 * 60_000);
  await expect(dlg).toContainText('¡Pasó!');
  await dlg.getByRole('button', { name: 'Lo superé' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lo superaste' })).toBeVisible();
  await nav(page, 'Premios');
  await expect(page.getByText('1 antojo superado con el botón de urgencia')).toBeVisible();
});

test('escalón de 7 días: premio con precio pagado con tu ahorro', async ({ page }) => {
  await setupManual(page);
  await nav(page, 'Premios');
  await expect(page.getByLabel('Escalón del día 35')).toContainText('cofre sorpresa');
  await expect(page.getByLabel('Escalón del día 84')).toContainText('cofre doble');
  const day7 = page.getByLabel('Premio del día 7');
  await day7.getByRole('button', { name: 'Cambiar premio o precio' }).click();
  await page.getByLabel('Premio', { exact: true }).fill('Premio de prueba');
  await page.getByLabel('Precio en Bs').fill('30');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(day7).toContainText('Premio de prueba');
  await expect(day7).toContainText('Bs 30');

  // Siete días limpios: del sábado 7 al viernes 13
  await page.clock.setFixedTime(new Date('2026-11-13T21:00:00-04:00'));
  await page.reload();
  await draw(page, PATTERN);
  await expect(page.getByRole('heading', { name: 'Día 7 de 90' })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await markClean(page);
    await page.getByRole('button', { name: 'Día anterior' }).click();
  }
  await markClean(page);
  await expect(page.getByRole('status').filter({ hasText: '¡Escalón de 7 días!' })).toBeVisible();

  await nav(page, 'Premios');
  await expect(page.getByLabel('Tu ahorro disponible')).toContainText('70');
  await day7.getByRole('button', { name: 'Reclamar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reclamar' }).click();
  await expect(page.getByRole('status').filter({ hasText: '¡Premio de prueba! Te lo ganaste.' })).toBeVisible();
  await expect(day7).toContainText('Reclamado');
  await expect(page.getByLabel('Tu ahorro disponible').locator('.fund-amount')).toContainText('40');
});

test('semana victoriosa: el promedio con Val Q cuenta para el gran premio', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('val-quirurgico.semanas', JSON.stringify({ v: 1, start: '2026-11-07', weeks: { '2026-11-07': 70 }, at: '' }));
  });
  await page.clock.install({ time: SATURDAY_NIGHT });
  await page.goto('./');
  const config = {
    app: 'bitacora',
    kind: 'config',
    habits: [{ id: 'uno', name: 'Hábito uno', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: '' }],
    triggers: ['Estrés'],
    grand: { name: 'Gran premio de prueba', price: 0, weeks: 9 },
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'config.txt', mimeType: 'text/plain', buffer: Buffer.from(JSON.stringify(config)) });
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: /^Hoy/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await createPattern(page);
  await expect(page.getByRole('button', { name: 'Tu meta' })).toContainText('0 de 9 semanas victoriosas');

  await page.clock.setFixedTime(new Date('2026-11-13T21:00:00-04:00'));
  await page.reload();
  await draw(page, PATTERN);
  for (let i = 0; i < 7; i++) {
    await page.getByRole('article', { name: 'Hábito uno' }).getByRole('button', { name: 'Limpio' }).click();
    if (i < 6) await page.getByRole('button', { name: 'Día anterior' }).click();
  }
  await expect(page.getByRole('button', { name: 'Tu meta' })).toContainText('1 de 9 semanas victoriosas');
  await nav(page, 'Premios');
  await expect(page.getByRole('region', { name: 'Gran premio' })).toContainText('1/9 semanas');
  await nav(page, 'Análisis');
  await expect(page.getByLabel('Tus semanas').locator('.col.victory')).toHaveCount(1);
  const share = await page.evaluate(() => localStorage.getItem('bitacora.semanas') ?? '');
  expect(share).toContain('"2026-11-07":100');
  expect(share).not.toContain('Hábito');
});

test('carga la configuración con premios, gran premio y «Dije no a una fiesta»', async ({ page }) => {
  await page.clock.install({ time: SATURDAY_NIGHT });
  await page.goto('./');
  const config = {
    app: 'bitacora',
    kind: 'config',
    habits: [
      { id: 'uno', name: 'Hábito uno', q: '¿Día limpio?', ok: 'Limpio', fail: 'Caí', phrase: 'Frase uno', value: { kind: 'bs', amount: 15 } },
      { id: 'dos', name: 'Hábito dos', q: '¿Cumplí?', ok: 'Sí', fail: 'No', phrase: '', value: { kind: 'dias', amount: 1, label: 'Mente clara' } },
    ],
    triggers: ['Estrés', 'Cansancio'],
    milestones: [{ day: 7, name: 'Premio siete', price: 100 }],
    grand: { name: 'Gran premio de prueba', price: 500 },
    partyBonus: 200,
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'config.txt', mimeType: 'text/plain', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.getByText('1. Hábito uno')).toBeVisible();
  await expect(page.getByText('gran premio: Gran premio de prueba')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: /^Hoy/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await createPattern(page);

  const goal = page.getByRole('button', { name: 'Tu meta' });
  await expect(goal).toContainText('Gran premio de prueba');
  await expect(goal).toContainText('89');
  await page.getByRole('button', { name: 'Dije no a una fiesta (+Bs 200)' }).click();
  await expect(page.getByRole('status').filter({ hasText: '+Bs 200' })).toBeVisible();
  await page.getByRole('article', { name: 'Hábito dos' }).getByRole('button', { name: 'Sí' }).click();
  await expect(page.getByLabel('Tu ahorro')).toContainText('Bs 200');
  await expect(page.getByLabel('Tu ahorro')).toContainText('día de mente clara');
});

test('se puede pegar la configuración como texto', async ({ page }) => {
  await page.clock.install({ time: SATURDAY_NIGHT });
  await page.goto('./');
  await page.getByRole('button', { name: 'Pegar mi configuración o un respaldo' }).click();
  const config = { app: 'bitacora', kind: 'config', habits: [{ name: 'Hábito pegado' }], triggers: ['Estrés'] };
  await page.getByLabel('Configuración o respaldo en texto').fill(JSON.stringify(config, null, 2));
  await page.getByRole('button', { name: 'Usar este texto' }).click();
  await expect(page.getByText('1. Hábito pegado')).toBeVisible();
});

test('respaldo: se copia como texto y se restaura con su patrón', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setupManual(page);
  await markClean(page);
  await nav(page, 'Ajustes');
  await page.getByRole('button', { name: 'Copiar respaldo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Respaldo copiado' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('"app":"bitacora"');
  expect(text).not.toContain('Cigarro');

  await page.getByRole('button', { name: 'Pegar un respaldo o una configuración' }).click();
  await page.getByLabel('Texto del respaldo o de la configuración').fill(text);
  await page.getByRole('button', { name: 'Usar este texto' }).click();
  await expect(page.getByRole('heading', { name: 'Patrón del respaldo' })).toBeVisible();
  await draw(page, PATTERN);
  await page.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Respaldo restaurado' })).toBeVisible();
});

test('huella: se activa y abre la app', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  try {
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf: true,
        automaticPresenceSimulation: true,
      },
    });
  } catch {
    test.skip(true, 'Este Chromium no simula huella con PRF');
  }
  await setupManual(page);
  await nav(page, 'Ajustes');
  await page.getByRole('button', { name: 'Activar' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Huella activada.' })).toBeVisible();
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Día 1 de 90' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Día 1 de 90' })).toBeVisible();
});

test('si el ciclo empieza mañana, se puede empezar hoy', async ({ page }) => {
  await setupManual(page, 'Mañana');
  await expect(page.getByText('Empieza el domingo 8 de noviembre')).toBeVisible();
  await page.getByRole('button', { name: 'Prefiero empezar hoy' }).click();
  await expect(page.getByRole('heading', { name: 'Día 1 de 90' })).toBeVisible();
});

test('el candado bloquea la app al instante', async ({ page }) => {
  await setupManual(page);
  await page.getByRole('button', { name: 'Bloquear ahora' }).click();
  await expect(page.getByText('Dibuja tu patrón')).toBeVisible();
});

test('borra la bóveda de prueba de la versión con PIN y empieza de cero', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('bitacora.vault', '{"v":1,"prueba":true}');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Configurar a mano' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bitacora.vault'))).toBeNull();
});

test('«Cómo funciona»: aviso la primera vez y guía en Ajustes', async ({ page }) => {
  await setupManual(page);
  const banner = page.getByRole('region', { name: 'Cómo funciona' });
  await expect(banner).toContainText('¿Cómo funciona Bitácora?');
  await banner.getByRole('button', { name: 'Ver' }).click();
  const help = page.getByRole('dialog', { name: 'Cómo funciona' });
  await expect(help).toContainText('Insignias');
  await expect(help).toContainText(/semana victoriosa/i);
  await help.getByRole('button', { name: 'Entendido' }).click();
  await expect(banner).toHaveCount(0);
  await nav(page, 'Ajustes');
  await page.getByRole('button', { name: 'Ver', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cómo funciona' })).toBeVisible();
});

test('la bienvenida funciona sin internet y explica cómo instalar', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Instalar la app' })).toContainText('«Instalar aplicación»');
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test('si la app ya está instalada, lo dice en vez de pedir instalarla', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { value: async () => [{ platform: 'webapp' }] });
  });
  await page.goto('./');
  await expect(page.getByRole('status', { name: 'App instalada' })).toContainText('Ya la tienes instalada');
  await expect(page.getByRole('region', { name: 'Instalar la app' })).toHaveCount(0);
});
