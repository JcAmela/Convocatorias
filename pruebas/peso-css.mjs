// El CSS de la web, comprimido, no pasa de 10 KB (presupuesto de F2). Se
// ejecuta en la CI después del build:
//
//   npm run build && node pruebas/peso-css.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMITE = 10 * 1024;
const CARPETA = 'dist/_astro';
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const hojas = readdirSync(CARPETA).filter((f) => f.endsWith('.css'));
if (hojas.length === 0) {
  console.error(`No hay CSS en ${CARPETA}: ¿falta el build?`);
  process.exit(1);
}

let total = 0;
for (const f of hojas) {
  const n = gzipSync(readFileSync(join(CARPETA, f)), { level: 9 }).length;
  total += n;
  console.log(`${f}: ${kb(n)} gzip`);
}
console.log(`Total: ${kb(total)} gzip (límite: ${kb(LIMITE)})`);
if (total > LIMITE) {
  console.error('El CSS pasa del presupuesto de 10 KB gzip.');
  process.exit(1);
}
