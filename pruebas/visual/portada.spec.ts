import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** La portada entera: accesibilidad con axe y ni una petición a webfonts. */

async function graves(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length}): ${v.help}`);
}

test('0 peticiones a Google Fonts', async ({ page }) => {
  const fuentes: string[] = [];
  page.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fuentes.push(r.url()); });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(fuentes).toEqual([]);
});

for (const tema of ['light', 'dark'] as const) {
  test(`axe: nada serio ni crítico (${tema === 'light' ? 'claro' : 'oscuro'})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.goto('/');
    await page.locator('article').first().waitFor();
    expect(await graves(page)).toEqual([]);
  });
}

test('axe: nada serio ni crítico con la ficha abierta', async ({ page }) => {
  await page.goto('/');
  await page.locator('article h3 a, article h3 button').first().click();
  await page.getByRole('link', { name: /Ir a apuntarte/ }).waitFor();
  // Con el panel aún entrando, axe mide el contraste a media opacidad.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  expect(await graves(page)).toEqual([]);
});
