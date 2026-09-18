import type { Plaza, Sitio } from './tipos';
import {
  type Catalogo,
  esSoloSede as esSoloSedeEn, idsFiltroLugar as idsFiltroLugarEn,
  lugaresTexto as lugaresTextoEn, sitio as sitioEn,
  sitioMostrado as sitioMostradoEn, sitioSede as sitioSedeEn,
  sitioTrabajo as sitioTrabajoEn,
} from '../../supabase/functions/_shared/catalogo.ts';

export { claveLugar, idDe } from '../../supabase/functions/_shared/lugares.ts';
export { SIN_LUGAR } from '../../supabase/functions/_shared/catalogo.ts';
export type { Catalogo } from '../../supabase/functions/_shared/catalogo.ts';

/**
 * El catálogo de lugares, para la web.
 *
 * La lógica vive en `_shared/catalogo.ts`, donde el callejero se pasa como
 * argumento porque el servidor atiende a mucha gente a la vez. Aquí sobra esa
 * ceremonia: una pestaña mira un tablero, así que el catálogo se fija una vez
 * al llegar los datos y estas funciones lo inyectan solas.
 */

export const TEXTO_SIN_LUGAR = 'Sin lugar indicado';
export const TEXTO_SOLO_CERCA = 'Solo cerca de casa';
/** Lo que significa el asterisco de la columna «Dónde». */
export const AVISO_SEDE = '(es la sede del organismo; el anuncio no dice dónde se trabaja)';

let catalogo: Catalogo = {};

/** El catálogo que viene con la respuesta. Se fija antes de pintar nada. */
export function usaSitios(sitios: Catalogo | undefined): void {
  catalogo = sitios ?? {};
}

/** El catálogo vigente, para quien necesite pasarlo a las funciones compartidas. */
export function catalogoActual(): Catalogo {
  return catalogo;
}

export const sitio = (id: string | null | undefined) => sitioEn(catalogo, id);
export const sitioSede = (p: Plaza) => sitioSedeEn(catalogo, p);
export const sitioTrabajo = (p: Plaza) => sitioTrabajoEn(catalogo, p);
export const sitioMostrado = (p: Plaza) => sitioMostradoEn(catalogo, p);
export const esSoloSede = (p: Plaza) => esSoloSedeEn(catalogo, p);
export const lugaresTexto = (p: Plaza) => lugaresTextoEn(catalogo, p);
export const idsFiltroLugar = (p: Plaza) => idsFiltroLugarEn(catalogo, p);

export function todosLosSitios(): Sitio[] {
  return Object.values(catalogo);
}

export function nombreLugar(p: Plaza): string | null {
  return sitioMostrado(p)?.nombre ?? null;
}

/* ------------------------------------------------------------ el desplegable */

export interface SitioContado extends Sitio {
  /** Cuántas convocatorias de la lista lo mencionan. */
  n: number;
}

/**
 * Los sitios que aparecen de verdad en una lista de convocatorias, con su
 * cuenta. El catálogo trae los mil municipios de Cataluña, pero en el menú
 * solo tienen sentido los que hoy tienen algo.
 */
export function catalogoDe(plazas: Plaza[]): SitioContado[] {
  const cuenta = new Map<string, number>();
  for (const p of plazas) {
    for (const id of idsFiltroLugar(p)) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  const out: SitioContado[] = [];
  for (const [id, n] of cuenta) {
    const s = catalogo[id];
    if (s) out.push({ ...s, n });
  }
  return out.sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
}
