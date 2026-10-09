import type { APIRoute } from 'astro';
import { ORDEN_NIVEL } from '../lib/formato';
import { indiceDeFichas } from '../lib/indice';
import { usaSitios } from '../lib/localizacion';
import { porClase, porLugar, porNivel, rutaDeSitio, type Vivas } from '../lib/paginas';
import { datosPublicos } from '../lib/publicos';
import { RUTA_SIN_TITULACION, rutaEstudios, rutaTipo } from '../lib/rutas';
import { absoluta } from '../lib/seo';

/**
 * El sitemap, hecho a mano y no con `@astrojs/sitemap`: el `lastmod` de cada
 * ficha es el día en que cambió de verdad (`indice.json`), y esa integración
 * solo ve las rutas, no los datos. Sin las cerradas, que no hay por qué
 * pedirle a Google que visite.
 *
 * Se genera siempre, pero solo se anuncia en robots.txt con dominio propio.
 */
export const GET: APIRoute = async () => {
  const [{ tablero }, indice] = await Promise.all([datosPublicos(), indiceDeFichas()]);
  usaSitios(tablero.sitios);
  const cambio = new Map(indice.fichas.map((f) => [f.id, f.cambio]));
  const ultimo = (v: Vivas) =>
    [...v.abiertas, ...v.pendientes].map((p) => cambio.get(p.id) ?? tablero.hoy).sort().at(-1) ?? tablero.hoy;

  const urls: { loc: string; lastmod: string }[] = [{ loc: absoluta('/'), lastmod: tablero.generado.slice(0, 10) }];
  for (const [id, v] of porLugar(tablero)) {
    const s = tablero.sitios[id];
    const ruta = s ? rutaDeSitio(tablero, s) : null;
    if (ruta) urls.push({ loc: absoluta(ruta), lastmod: ultimo(v) });
  }
  for (const [nivel, v] of porNivel(tablero)) {
    if (!(nivel in ORDEN_NIVEL)) continue;
    urls.push({ loc: absoluta(nivel === 'AP' ? RUTA_SIN_TITULACION : rutaEstudios(nivel)), lastmod: ultimo(v) });
  }
  for (const [clase, v] of porClase(tablero)) {
    urls.push({ loc: absoluta(rutaTipo(clase as Parameters<typeof rutaTipo>[0])), lastmod: ultimo(v) });
  }
  for (const f of indice.fichas) {
    if (f.grupo !== 'cerradas') urls.push({ loc: absoluta(f.url), lastmod: f.cambio });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
