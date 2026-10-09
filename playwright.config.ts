import { defineConfig, devices } from '@playwright/test';

/**
 * Las pruebas en el navegador: lo que vitest no puede ver porque depende de
 * pintar —alturas, contraste en pantalla, accesibilidad del DOM real—.
 *
 * Siempre contra el build con el fixture, para que no dependan de los datos
 * del día:
 *
 *   DATOS=fixture npm run build
 *   npm run test:visual
 *
 * En local usa el Chrome instalado; en la CI, el Chromium de Playwright.
 */
const PUERTO = 4323;

export default defineConfig({
  testDir: 'pruebas/visual',
  fullyParallel: true,
  // Con más, cada Chrome se queda sin CPU y las páginas tardan más de 30 s.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    channel: process.env.CI ? undefined : 'chrome',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },
  projects: [
    { name: 'movil', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, defaultBrowserType: 'chromium' } },
    { name: 'escritorio', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // `astro preview` se va a segundo plano por su cuenta cuando cree que lo
    // lanza un agente de IA, y Playwright lo da por muerto. Con
    // ASTRO_PREVIEW_BACKGROUND se queda delante, y con `--ignore-lock` puede
    // convivir con otra vista previa abierta.
    command: `npm run preview -- --port ${PUERTO} --ignore-lock`,
    env: { ASTRO_PREVIEW_BACKGROUND: '1' },
    url: `http://localhost:${PUERTO}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
