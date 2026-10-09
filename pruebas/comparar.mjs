// Antes y después de un cambio de diseño, con Lighthouse en móvil y las
// pasadas intercaladas (A, B, B, A, A, B…): el ruido del equipo cae por igual
// en las dos versiones. Con medidas separadas, la misma versión llegó a dar un
// FCP de 1.655 ms y de 2.063 ms en dos tandas seguidas.
//
//   node pruebas/comparar.mjs <url-antes> <url-despues> [pasadas=9]
//
// Cada URL es un `astro preview` de un build con `DATOS=fixture`: el de antes,
// desde un `git worktree` del commit anterior (docs/linea-base.md).

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [ANTES, DESPUES] = process.argv.slice(2, 4);
const PASADAS = Number(process.argv[4] ?? 9);
if (!ANTES || !DESPUES) {
  console.error('Uso: node pruebas/comparar.mjs <url-antes> <url-despues> [pasadas]');
  process.exit(1);
}

const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

function lighthouse(url) {
  const salida = join(tmpdir(), `comparar-${process.pid}.json`);
  const r = spawnSync('npx', [
    'lighthouse', url, '--preset=perf', '--form-factor=mobile', '--output=json',
    `--output-path=${salida}`, '--quiet', '--chrome-flags=--headless=new',
  ], { shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`lighthouse falló: ${r.stderr?.slice(-400)}`);
  const a = JSON.parse(readFileSync(salida, 'utf8')).audits;
  rmSync(salida, { force: true });
  return {
    lcp: a['largest-contentful-paint'].numericValue,
    tbt: a['total-blocking-time'].numericValue,
    fcp: a['first-contentful-paint'].numericValue,
  };
}

const medidas = { antes: [], despues: [] };
for (let i = 0; i < PASADAS; i++) {
  const orden = i % 2 ? [['despues', DESPUES], ['antes', ANTES]] : [['antes', ANTES], ['despues', DESPUES]];
  for (const [cual, url] of orden) medidas[cual].push(lighthouse(url));
  process.stderr.write(`${i + 1}/${PASADAS}\n`);
}

const resumen = {};
for (const cual of ['antes', 'despues']) {
  resumen[cual] = Object.fromEntries(['lcp', 'tbt', 'fcp'].map((c) =>
    [c, Math.round(mediana(medidas[cual].map((m) => m[c])))]));
}
for (const c of ['lcp', 'tbt', 'fcp']) {
  const { antes, despues } = { antes: resumen.antes[c], despues: resumen.despues[c] };
  const pct = ((despues - antes) / antes) * 100;
  console.log(`${c.toUpperCase()}: ${antes} → ${despues} ms (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`);
}
