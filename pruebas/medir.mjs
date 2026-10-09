// La línea base de rendimiento y las capturas, para comparar cada cambio de
// diseño con el mismo método (docs/linea-base.md).
//
//   DATOS=fixture npm run build
//   npm run preview -- --port 4323        (en otra terminal)
//   node pruebas/medir.mjs [url] [pasadas] [carpeta-capturas]
//
// - LCP y TBT: Lighthouse en móvil (`--preset=perf --form-factor=mobile`),
//   N pasadas y la mediana. Lighthouse no carga lo que la isla pide después,
//   así que su CLS no vale: el CLS se mide aparte.
// - CLS: Playwright con un iPhone de 375×812, la página entera y la carga de
//   `/datos/abiertas.json` incluida (se esperan 6 s), N pasadas y la mediana.
// - Capturas: 375×812 y 1280×800, en claro y en oscuro, con la hora fijada.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

const URL_BASE = process.argv[2] ?? 'http://localhost:4323/';
const PASADAS = Number(process.argv[3] ?? 5);
const CAPTURAS = process.argv[4] ?? 'docs/linea-base';
const HORA = new Date('2026-10-08T10:00:00+02:00');

const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

function lighthouse() {
  const salida = join(tmpdir(), `lh-${process.pid}.json`);
  const r = spawnSync('npx', [
    'lighthouse', URL_BASE, '--preset=perf', '--form-factor=mobile', '--output=json',
    `--output-path=${salida}`, '--quiet', '--chrome-flags=--headless=new',
  ], { shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`lighthouse falló: ${r.stderr?.slice(-400)}`);
  const lhr = JSON.parse(readFileSync(salida, 'utf8'));
  rmSync(salida, { force: true });
  const a = lhr.audits;
  return {
    rendimiento: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcp: a['largest-contentful-paint'].numericValue,
    tbt: a['total-blocking-time'].numericValue,
    fcp: a['first-contentful-paint'].numericValue,
    elementoLcp: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? null,
  };
}

async function cls(navegador) {
  const ctx = await navegador.newContext({
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'es-ES', timezoneId: 'Europe/Madrid',
  });
  const pagina = await ctx.newPage();
  await pagina.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await pagina.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await pagina.waitForTimeout(6000);
  const valor = await pagina.evaluate(() => window.__cls);
  const cargoAbiertas = await pagina.evaluate(() =>
    performance.getEntriesByType('resource').some((e) => e.name.includes('/datos/abiertas.json')));
  await ctx.close();
  return { cls: valor, cargoAbiertas };
}

async function capturas(navegador) {
  mkdirSync(CAPTURAS, { recursive: true });
  const hechas = [];
  for (const [nombre, viewport, movil] of [['movil', { width: 375, height: 812 }, true], ['escritorio', { width: 1280, height: 800 }, false]]) {
    for (const tema of ['light', 'dark']) {
      const ctx = await navegador.newContext({
        viewport, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil,
        colorScheme: tema, locale: 'es-ES', timezoneId: 'Europe/Madrid',
      });
      const pagina = await ctx.newPage();
      await pagina.clock.setFixedTime(HORA);
      await pagina.goto(URL_BASE, { waitUntil: 'networkidle' });
      await pagina.waitForTimeout(500);
      const fichero = join(CAPTURAS, `${nombre}-${tema === 'light' ? 'claro' : 'oscuro'}.png`);
      await pagina.screenshot({ path: fichero });
      hechas.push(fichero);
      await ctx.close();
    }
  }
  return hechas;
}

const lhs = [];
for (let i = 0; i < PASADAS; i++) { lhs.push(lighthouse()); process.stderr.write(`lighthouse ${i + 1}/${PASADAS}\n`); }
const navegador = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const clss = [];
for (let i = 0; i < PASADAS; i++) { clss.push(await cls(navegador)); process.stderr.write(`cls ${i + 1}/${PASADAS}\n`); }
const fotos = await capturas(navegador);
await navegador.close();

const resultado = {
  url: URL_BASE,
  pasadas: PASADAS,
  medianas: {
    rendimiento: mediana(lhs.map((x) => x.rendimiento)),
    lcpMs: Math.round(mediana(lhs.map((x) => x.lcp))),
    tbtMs: Math.round(mediana(lhs.map((x) => x.tbt))),
    fcpMs: Math.round(mediana(lhs.map((x) => x.fcp))),
    cls: Number(mediana(clss.map((x) => x.cls)).toFixed(4)),
  },
  elementoLcp: lhs.map((x) => x.elementoLcp).find(Boolean),
  todas: { lighthouse: lhs.map(({ elementoLcp, ...r }) => r), cls: clss },
  capturas: fotos,
};
writeFileSync(join(CAPTURAS, 'medidas.json'), `${JSON.stringify(resultado, null, 2)}\n`);
console.log(JSON.stringify(resultado.medianas), resultado.elementoLcp);
