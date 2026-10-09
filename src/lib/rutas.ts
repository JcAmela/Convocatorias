import { slugDe } from '../../supabase/functions/_shared/slug.ts';
import type { ClaseContrato } from './filtros';
import type { Plaza } from './tipos';

/**
 * Las direcciones de la web. Fijadas antes de publicar ninguna ficha: una vez
 * Google las conozca no se cambian, porque una web estática no puede
 * redirigir más que con una lista corta de reglas.
 *
 * Todas acaban en «/» (`trailingSlash: 'always'` en astro.config.mjs).
 */

/**
 * La ficha de una convocatoria: `/convocatoria/<slug>-<id>/`. El id manda —es
 * el de CIDO, el mismo número que su ficha oficial— y el slug solo dice de qué
 * va. Hay títulos repetidos («1 plaça d'Administratiu» sale decenas de
 * veces), así que dos fichas pueden compartir slug pero nunca dirección.
 *
 * El slug viene congelado de la base; si una fila vieja no lo trae, se calcula
 * del título, que en una fila que ya no cambia da siempre lo mismo.
 */
export function rutaFicha(p: Pick<Plaza, 'id' | 'titulo' | 'slug'>): string {
  return `/convocatoria/${p.slug || slugDe(p.titulo)}-${p.id}/`;
}

/** El id que va al final de una dirección de ficha, o `null` si no es una. */
export function idDeRutaFicha(ruta: string): string | null {
  const m = /^\/convocatoria\/[a-z0-9-]*?-?(cido-\d+)\/$/.exec(ruta);
  return m ? m[1] : null;
}

/** `/municipio/badalona/`: el id del callejero, el mismo de `?donde=`. */
export const rutaMunicipio = (id: string) => `/municipio/${id}/`;

/** `/comarca/barcelones/`: sin el prefijo `comarca-` del id, que ya lo dice la ruta. */
export const rutaComarca = (comarcaId: string) => `/comarca/${comarcaId.replace(/^comarca-/, '')}/`;

/** `/estudios/c2/`: el grupo de titulación. */
export const rutaEstudios = (nivel: string) => `/estudios/${nivel.toLowerCase()}/`;

/** `/tipo/fija/`, `/tipo/temporal/`, `/tipo/bolsa/`. */
export const rutaTipo = (clase: ClaseContrato) => `/tipo/${clase}/`;

/** Las que no piden titulación mínima (grupo AP). */
export const RUTA_SIN_TITULACION = '/sin-titulacion/';

/**
 * Cuántos días sigue viva la ficha de una convocatoria cerrada: enseña «Plazo
 * cerrado», el enlace oficial y otras parecidas abiertas. Pasado ese tiempo
 * deja de generarse y la dirección da 404, que es una de las tres formas que
 * acepta Google de retirar una oferta. Con 30 días son unas 800 fichas
 * cerradas, lejos del tope de 20.000 ficheros por despliegue de Cloudflare
 * (la CI falla a partir de 18.000).
 */
export const DIAS_FICHA_CERRADA = 30;

/** El primer día de cierre que aún tiene ficha. */
export function primerCierreConFicha(hoy: string): string {
  return new Date(Date.parse(`${hoy}T00:00:00Z`) - DIAS_FICHA_CERRADA * 86_400_000).toISOString().slice(0, 10);
}

/** Si una convocatoria tiene página propia en este build. */
export function tieneFicha(p: Pick<Plaza, 'fin'>, hoy: string): boolean {
  return !p.fin || p.fin.slice(0, 10) >= primerCierreConFicha(hoy);
}
