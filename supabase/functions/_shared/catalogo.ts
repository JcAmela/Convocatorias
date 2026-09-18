import type { Plaza, Sitio } from './tipos.ts';
import { claveLugar, idDe } from './lugares.ts';

/**
 * Qué lugar le corresponde a una convocatoria, resuelto contra el callejero.
 *
 * Aquí el catálogo **se pasa como argumento**, no se guarda en una variable
 * del módulo. En el navegador daba igual —una pestaña, un catálogo—, pero el
 * servidor va a evaluar las suscripciones de mucha gente dentro del mismo
 * proceso, y una global compartida entre invocaciones simultáneas es la clase
 * de fallo que no se reproduce cuando lo buscas. La web conserva su atajo en
 * `src/lib/localizacion.ts`, que no es más que esto con el catálogo inyectado.
 */

export type Catalogo = Record<string, Sitio>;

/** Marca las convocatorias de las que no se sabe absolutamente nada del sitio. */
export const SIN_LUGAR = 'sin-indicar';

export function sitio(cat: Catalogo, id: string | null | undefined): Sitio | null {
  return (id && cat[id]) || null;
}

/**
 * Modo de compatibilidad. Las convocatorias archivadas antes del cambio de
 * localizaciones no traen `donde`, solo el `lugar` de texto que sacaba el
 * servidor viejo del paréntesis del título. Se reconstruye un sitio mínimo
 * para que la pestaña de cerradas siga enseñando algo. Caduca solo: el
 * archivo sirve 120 días desde el 8 de septiembre de 2026.
 */
function legado(cat: Catalogo, p: Plaza): Sitio | null {
  // El mismo orden que seguía el código viejo: el lugar si lo hay y, si no, el
  // municipio cuando aporta algo distinto del organismo —en la Generalitat
  // aquel campo repetía el nombre del organismo y no servía de nada.
  const nombre = p.lugar ?? (p.municipio && p.municipio !== p.empleador ? p.municipio : null);
  if (!nombre) return null;
  const clave = claveLugar(nombre);
  if (!clave) return null;
  return cat[idDe(clave)] ?? {
    id: idDe(clave), nombre, tipo: 'municipio', comarca: null, comarcaId: null, lat: null, lon: null,
  };
}

export function sitioSede(cat: Catalogo, p: Plaza): Sitio | null {
  return sitio(cat, p.donde?.sedeId);
}

/** Dónde se trabaja, si el anuncio lo dice. */
export function sitioTrabajo(cat: Catalogo, p: Plaza): Sitio | null {
  const resuelto = sitio(cat, p.donde?.trabajoId);
  if (resuelto) return resuelto;
  // Sin ningún identificador es una fila vieja del archivo, que solo guarda
  // texto. `sanea()` le pone un `donde` vacío, así que no vale mirar si existe.
  if (!p.donde?.sedeId) return legado(cat, p);
  return null;
}

/**
 * El sitio que se enseña: el de trabajo si se sabe y, si no, el del organismo.
 * Nunca se presenta uno por el otro sin avisar: para eso está `esSoloSede()`.
 */
export function sitioMostrado(cat: Catalogo, p: Plaza): Sitio | null {
  return sitioTrabajo(cat, p) ?? sitioSede(cat, p);
}

/** true cuando lo que se enseña es la sede porque el anuncio no dice el destino. */
export function esSoloSede(cat: Catalogo, p: Plaza): boolean {
  return p.donde?.origen === 'desconocido' && Boolean(sitioSede(cat, p));
}

/** Para el buscador y para el detalle: el sitio y su comarca. */
export function lugaresTexto(cat: Catalogo, p: Plaza): string {
  const s = sitioMostrado(cat, p);
  if (!s) return '';
  return s.comarca && s.comarca !== s.nombre ? `${s.nombre}, ${s.comarca}` : s.nombre;
}

/**
 * Con qué identificadores casa una convocatoria en el filtro «Dónde». Incluye
 * su comarca, así que marcar una comarca entera trae todos sus pueblos.
 */
export function idsFiltroLugar(cat: Catalogo, p: Plaza): string[] {
  const s = sitioMostrado(cat, p);
  if (!s) return [SIN_LUGAR];
  return s.comarcaId && s.comarcaId !== s.id ? [s.id, s.comarcaId] : [s.id];
}
