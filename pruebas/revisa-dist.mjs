// Lo que el build publica, revisado antes de que lo vea nadie. Se ejecuta en
// la CI después de `npm run build`:
//
//   node pruebas/revisa-dist.mjs
//
// Falla si:
//   - dist pasa de 18.000 ficheros (Cloudflare Pages corta en 20.000);
//   - un listado lleva JobPosting, o lo lleva una ficha que no está abierta;
//   - un JobPosting no trae validThrough o ya ha caducado;
//   - un bloque JSON-LD no es JSON válido;
//   - una descripción pasa de 160 caracteres;
//   - sin dominio propio (robots.txt sin Sitemap), una ficha o un listado
//     no lleva noindex;
//   - una ficha carga JavaScript de /_astro (las fichas van sin islas);
//   - el sitemap trae una cerrada o una URL que no existe.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const MAX_FICHEROS = 18_000;
const fallos = [];
const falla = (m) => fallos.push(m);

function recorre(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? recorre(join(dir, e.name)) : [join(dir, e.name)]);
}

const ficheros = recorre(DIST);
if (ficheros.length > MAX_FICHEROS) falla(`dist tiene ${ficheros.length} ficheros (máximo ${MAX_FICHEROS})`);

const meta = JSON.parse(readFileSync(join(DIST, 'datos/meta.json'), 'utf8'));
const grupoDe = new Map();
for (const g of ['abiertas', 'pendientes', 'cerradas']) {
  for (const p of JSON.parse(readFileSync(join(DIST, `datos/${g}.json`), 'utf8')).plazas) grupoDe.set(p.id, g);
}
const sinDominio = !readFileSync(join(DIST, 'robots.txt'), 'utf8').includes('Sitemap:');
const LISTADOS = /^(municipio|comarca|estudios|tipo|sin-titulacion)(\/|$)/;

const decodifica = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let fichas = 0;
let conEmpleo = 0;
for (const f of ficheros.filter((x) => x.endsWith('.html'))) {
  const ruta = relative(DIST, f).split(sep).join('/').replace(/index\.html$/, '');
  const html = readFileSync(f, 'utf8');
  const esFicha = ruta.startsWith('convocatoria/');
  const esListado = LISTADOS.test(ruta);

  const desc = /<meta name="description" content="([^"]*)"/.exec(html);
  if (desc && [...decodifica(desc[1])].length > 160) falla(`${ruta}: descripción de ${decodifica(desc[1]).length} caracteres`);

  const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const datos = [];
  for (const b of bloques) {
    try { datos.push(JSON.parse(b)); } catch { falla(`${ruta}: JSON-LD que no es JSON`); }
  }
  const empleos = datos.flat().filter((d) => d && d['@type'] === 'JobPosting');

  if (empleos.length && !esFicha) falla(`${ruta}: JobPosting fuera de una ficha`);
  if (esFicha) {
    fichas++;
    const id = /(cido-\d+)\/$/.exec(ruta)?.[1];
    const grupo = grupoDe.get(id);
    if (!grupo) falla(`${ruta}: ficha de una convocatoria que no está en /datos/`);
    if (empleos.length > 1) falla(`${ruta}: más de un JobPosting`);
    for (const e of empleos) {
      conEmpleo++;
      if (grupo !== 'abiertas') falla(`${ruta}: JobPosting en una convocatoria ${grupo}`);
      if (!e.validThrough) falla(`${ruta}: JobPosting sin validThrough`);
      else if (e.validThrough.slice(0, 10) < meta.hoy) falla(`${ruta}: JobPosting caducado (${e.validThrough})`);
      for (const k of ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation']) {
        if (!e[k]) falla(`${ruta}: JobPosting sin ${k}`);
      }
    }
    if (/<script[^>]+src="\/_astro\//.test(html)) falla(`${ruta}: la ficha carga JavaScript de /_astro`);
  }
  if (sinDominio && (esFicha || esListado) && !/<meta name="robots" content="noindex/.test(html)) {
    falla(`${ruta}: sin noindex y sin dominio propio`);
  }
}

if (existsSync(join(DIST, 'sitemap.xml'))) {
  const locs = [...readFileSync(join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  for (const p of locs) {
    const fichero = join(DIST, p, 'index.html');
    if (!existsSync(fichero)) falla(`sitemap: ${p} no existe`);
    const id = /(cido-\d+)\/$/.exec(p)?.[1];
    if (id && grupoDe.get(id) === 'cerradas') falla(`sitemap: ${p} está cerrada`);
  }
  console.log(`sitemap: ${locs.length} URL`);
} else {
  falla('falta sitemap.xml');
}

console.log(`${ficheros.length} ficheros, ${fichas} fichas, ${conEmpleo} con JobPosting${sinDominio ? ', todo con noindex' : ''}`);
if (fallos.length) {
  console.error(`\n${fallos.length} problemas:\n${fallos.slice(0, 50).map((m) => `  - ${m}`).join('\n')}`);
  process.exit(1);
}
