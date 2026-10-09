import { expect, test } from '@playwright/test';

/**
 * La tarjeta de la lista, medida en el navegador: lo que vitest no ve porque
 * depende de pintar. Contra el build con el fixture (playwright.config.ts).
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('article').first().waitFor();
});

test('con un título de dos líneas mide 200 px o menos a 375', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'la medida es la del móvil');
  const medidas = await page.locator('article').evaluateAll((tarjetas) =>
    tarjetas.map((t) => {
      const titulo = t.querySelector('h3')!;
      const linea = parseFloat(getComputedStyle(titulo).lineHeight);
      return {
        titulo: titulo.textContent,
        lineas: Math.round(titulo.getBoundingClientRect().height / linea),
        alto: Math.round(t.getBoundingClientRect().height),
      };
    }));
  const deDos = medidas.filter((m) => m.lineas === 2);
  expect(deDos.length, 'el fixture tiene que traer títulos de dos líneas').toBeGreaterThan(0);
  for (const m of deDos) expect(m.alto, m.titulo ?? '').toBeLessThanOrEqual(200);
});

test('el título no pasa de tres líneas', async ({ page }) => {
  const lineas = await page.locator('article h3').evaluateAll((titulos) =>
    titulos.map((t) => Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight))));
  expect(Math.max(...lineas)).toBeLessThanOrEqual(3);
});

test('en el DOM el título va antes que la estrella', async ({ page }) => {
  const orden = await page.locator('article').first().evaluate((t) => {
    const titulo = t.querySelector('h3')!;
    const estrella = t.querySelector('button[aria-pressed]')!;
    return titulo.compareDocumentPosition(estrella) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(orden).toBeTruthy();
});

test('plazo a 16 px y título a 17 px, los dos en 600', async ({ page }) => {
  const t = page.locator('article').first();
  const estilo = (selector: string) => t.locator(selector).first().evaluate((e) => {
    const c = getComputedStyle(e);
    return { tamano: c.fontSize, peso: c.fontWeight };
  });
  expect(await estilo('p')).toEqual({ tamano: '16px', peso: '600' });
  expect(await estilo('h3')).toEqual({ tamano: '17px', peso: '600' });
});

test('con el dedo, la estrella se toca en 44 px o más', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'solo con pantalla táctil');
  const zona = await page.locator('article button[aria-pressed]').first().evaluate((b) => {
    const c = getComputedStyle(b, '::after');
    return Math.min(parseFloat(c.width), parseFloat(c.height));
  });
  expect(zona).toBeGreaterThanOrEqual(44);
});

test('el enlace para apuntarse ya no está en la tarjeta, sino en la ficha', async ({ page }) => {
  await expect(page.locator('article a', { hasText: 'Ir a apuntarte' })).toHaveCount(0);
  await page.locator('article h3 button').first().click();
  await expect(page.getByRole('link', { name: /Ir a apuntarte/ })).toBeVisible();
});
