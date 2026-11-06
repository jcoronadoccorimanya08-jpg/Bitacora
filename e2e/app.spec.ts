import { expect, test, type Page } from '@playwright/test';

const MONDAY_NIGHT = new Date('2026-11-09T21:00:00-04:00');

async function typePin(page: Page, pin: string, submit: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: submit, exact: true }).click();
}

async function setupManual(page: Page) {
  await page.clock.install({ time: MONDAY_NIGHT });
  await page.goto('./');
  await page.getByRole('button', { name: 'Configurar a mano' }).click();
  await page.getByRole('button', { name: '+ Procrastinación' }).click();
  await page.getByRole('button', { name: '+ Cigarro' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: '¿Cuándo empiezas?' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Crea tu PIN' })).toBeVisible();
  await typePin(page, '1234', 'Siguiente');
  await expect(page.getByRole('heading', { name: 'Repite tu PIN' })).toBeVisible();
  await typePin(page, '1234', 'Crear');
  await expect(page.getByRole('heading', { name: 'Día 1 de 90' })).toBeVisible();
}

test('configura, marca un día limpio y lo protege con PIN', async ({ page }) => {
  await setupManual(page);

  const proc = page.getByRole('article', { name: 'Procrastinación' });
  const cig = page.getByRole('article', { name: 'Cigarro' });
  await proc.getByRole('button', { name: 'Cumplí' }).click();
  await cig.getByRole('button', { name: 'Limpio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Día limpio.' })).toBeVisible();
  await expect(page.getByLabel('Racha').locator('.big')).toHaveText('1');

  // Al recargar pide el PIN; uno incorrecto no abre
  await page.reload();
  await expect(page.getByText('Ingresa tu PIN')).toBeVisible();
  await typePin(page, '0000', 'Entrar');
  await expect(page.getByRole('alert')).toHaveText('PIN incorrecto.');
  await typePin(page, '1234', 'Entrar');
  await expect(page.getByRole('heading', { name: 'Día 1 de 90' })).toBeVisible();
  await expect(proc.getByRole('button', { name: 'Cumplí' })).toHaveAttribute('aria-pressed', 'true');

  // Los datos guardados están cifrados: el texto no aparece en el almacenamiento
  const raw = await page.evaluate(() => localStorage.getItem('bitacora.vault') ?? '');
  expect(raw).not.toContain('Procrastinación');
  expect(raw).not.toContain('Cigarro');
});

test('una caída muestra los disparadores y avisa sin juzgar', async ({ page }) => {
  await setupManual(page);
  const cig = page.getByRole('article', { name: 'Cigarro' });
  await cig.getByRole('button', { name: 'Caí' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Anotado. ¿Qué lo disparó?' })).toBeVisible();
  await cig.getByRole('button', { name: 'Estrés' }).click();
  await expect(cig.getByRole('button', { name: 'Estrés' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Hoy hubo una caída. Mañana no se negocia')).toBeVisible();

  await page.locator('nav.nav').getByRole('button', { name: 'Análisis' }).click();
  await expect(page.getByText('Lo que más te disparó: Estrés (1).')).toBeVisible();
});

test('carga una configuración desde archivo', async ({ page }) => {
  await page.clock.install({ time: MONDAY_NIGHT });
  await page.goto('./');
  const config = {
    app: 'bitacora',
    kind: 'config',
    habits: [
      { id: 'uno', name: 'Hábito uno', q: '¿Día limpio?', ok: 'Limpio', f: 'Caí', fr: 'Frase uno' },
      { id: 'dos', name: 'Hábito dos', q: '¿Cumplí?', ok: 'Sí', f: 'No', fr: '' },
    ],
    triggers: ['Estrés', 'Cansancio'],
  };
  await page.locator('input[type=file]').setInputFiles({ name: 'config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.getByText('1. Hábito uno')).toBeVisible();
  await expect(page.getByText('2. Hábito dos')).toBeVisible();
});

test('el candado bloquea la app al instante', async ({ page }) => {
  await setupManual(page);
  await page.getByRole('button', { name: 'Bloquear ahora' }).click();
  await expect(page.getByText('Ingresa tu PIN')).toBeVisible();
});
