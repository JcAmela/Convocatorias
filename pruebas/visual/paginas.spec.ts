import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Las páginas estáticas: la ficha de cada convocatoria y los listados. Sin
 * islas, con noindex mientras no haya dominio propio y accesibles.
 */

/** La ficha de la primera tarjeta de la portada. */
async function primeraFicha(page: import('@playwright/test').Page) {
  await page.goto('/');
  const href = await page.locator('article h3 a').first().getAttribute('href');
  expect(href).toMatch(/^\/convocatoria\/[a-z0-9-]+-cido-\d+\/$/);
  return href!;
}

test('en el tablero, un clic en el título abre la ficha encima sin salir de la página', async ({ page }) => {
  await page.goto('/');
  await page.locator('article h3 a').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('la ficha: el título original en el h1, sin JavaScript de /_astro y con noindex', async ({ page }) => {
  const ruta = await primeraFicha(page);
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto(ruta);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveAttribute('lang', 'ca');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(scripts.filter((s) => s.includes('/_astro/'))).toEqual([]);
});

test('la ficha: la barra de acción se ve y no tapa el final de la página', async ({ page }) => {
  await page.goto(await primeraFicha(page));
  const barra = page.getByRole('link', { name: /Ir a apuntarte|Ficha oficial/ }).first();
  await expect(barra).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const pie = await page.locator('footer').boundingBox();
  const accion = await barra.boundingBox();
  expect(pie!.y + pie!.height).toBeLessThanOrEqual(accion!.y + 1);
});

test('la ficha: axe sin nada serio ni crítico', async ({ page }) => {
  await page.goto(await primeraFicha(page));
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('un listado: tarjetas que enlazan a sus fichas, migas y ningún JobPosting', async ({ page }) => {
  await page.goto(await primeraFicha(page));
  const municipio = page.locator('nav[aria-label="Migas de pan"] a[href^="/municipio/"]');
  await municipio.click();
  await expect(page.locator('h1')).toContainText('Empleo público en');
  await expect(page.locator('article h3 a').first()).toHaveAttribute('href', /^\/convocatoria\//);
  const jsonld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(jsonld.join('')).not.toContain('JobPosting');
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
