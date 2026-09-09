import type { Plaza, Sitio } from './tipos';
import { normaliza } from './formato';

/**
 * Los lugares llegan resueltos del servidor: cada convocatoria dice en qué
 * municipio está el organismo y, cuando el anuncio lo cuenta, en cuál se
 * trabaja. Aquí ya no se adivina nada.
 *
 * Antes este fichero tenía 283 líneas dedicadas a reconstruir a posteriori lo
 * que el origen estropeaba: trocear cadenas, descartar siglas, rescatar
 * topónimos de la cola del título y agrupar erratas por frecuencia con una
 * heurística de distancia de edición. Todo eso vive ahora en la función de
 * Supabase, que es donde se tienen los datos buenos, y lo único que queda de
 * aquello es `legado()`: el modo de compatibilidad para las convocatorias que
 * se archivaron antes del cambio.
 */

/** Marca las convocatorias de las que no se sabe absolutamente nada del sitio. */
export const SIN_LUGAR = 'sin-indicar';
export const TEXTO_SIN_LUGAR = 'Sin lugar indicado';
export const TEXTO_SOLO_CERCA = 'Solo cerca de casa';
/** Lo que significa el asterisco de la columna «Dónde». */
export const AVISO_SEDE = '(es la sede del organismo; el anuncio no dice dónde se trabaja)';

/* --------------------------------------------------- claves e identificadores */

/** Artículos y preposiciones: sobran para comparar, "de" y "del" son lo mismo. */
const PARTICULAS = new Set([
  'el', 'la', 'els', 'les', 'lo', 'los', 'de', 'del', 'dels', 'da', 'd', 'l', 'i', 'a', 'al', 'als',
]);

/**
 * La misma regla que usa el servidor para fabricar los identificadores. Las
 * dos copias tienen que seguir siendo idénticas: de aquí salen los `?donde=`
 * que la gente guarda en marcadores y manda por WhatsApp.
 */
export function claveLugar(nombre: string): string {
  return normaliza(nombre)
    .replace(/[’´`]/g, "'")
    .replace(/'/g, "' ")
    .split(/[\s.,]+/)
    .map((palabra) => palabra.replace(/'$/, ''))
    .filter((palabra) => palabra && !PARTICULAS.has(palabra))
    .join(' ');
}

export function idDe(clave: string): string {
  return clave.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ------------------------------------------------------------------ catálogo */

let catalogo: Record<string, Sitio> = {};

/** El catálogo que viene con la respuesta. Se fija antes de pintar nada. */
export function usaSitios(sitios: Record<string, Sitio> | undefined): void {
  catalogo = sitios ?? {};
}

export function sitio(id: string | null | undefined): Sitio | null {
  return (id && catalogo[id]) || null;
}

export function todosLosSitios(): Sitio[] {
  return Object.values(catalogo);
}

/**
 * Modo de compatibilidad. Las convocatorias archivadas antes de este cambio no
 * traen `donde`, solo el `lugar` de texto que sacaba el servidor viejo del
 * paréntesis del título. Se reconstruye un sitio mínimo para que la pestaña de
 * cerradas siga enseñando algo. Caduca solo: el archivo sirve 120 días.
 */
function legado(p: Plaza): Sitio | null {
  // El mismo orden que seguía el código viejo: el lugar si lo hay y, si no, el
  // municipio cuando aporta algo distinto del organismo —en la Generalitat
  // aquel campo repetía el nombre del organismo y no servía de nada.
  const nombre = p.lugar ?? (p.municipio && p.municipio !== p.empleador ? p.municipio : null);
  if (!nombre) return null;
  const clave = claveLugar(nombre);
  if (!clave) return null;
  return catalogo[idDe(clave)] ?? {
    id: idDe(clave), nombre, tipo: 'municipio', comarca: null, comarcaId: null, lat: null, lon: null,
  };
}

/* ------------------------------------------------------- lugares de una plaza */

export function sitioSede(p: Plaza): Sitio | null {
  return sitio(p.donde?.sedeId);
}

/** Dónde se trabaja, si el anuncio lo dice. */
export function sitioTrabajo(p: Plaza): Sitio | null {
  const resuelto = sitio(p.donde?.trabajoId);
  if (resuelto) return resuelto;
  // Sin ningún identificador es una fila vieja del archivo, que solo guarda
  // texto. `sanea()` le pone un `donde` vacío, así que no vale mirar si existe.
  if (!p.donde?.sedeId) return legado(p);
  return null;
}

/**
 * El sitio que se enseña: el de trabajo si se sabe y, si no, el del organismo.
 * Nunca se presenta uno por el otro sin avisar: para eso está `esSoloSede()`.
 */
export function sitioMostrado(p: Plaza): Sitio | null {
  return sitioTrabajo(p) ?? sitioSede(p);
}

export function nombreLugar(p: Plaza): string | null {
  return sitioMostrado(p)?.nombre ?? null;
}

/** true cuando lo que se enseña es la sede porque el anuncio no dice el destino. */
export function esSoloSede(p: Plaza): boolean {
  return p.donde?.origen === 'desconocido' && Boolean(sitioSede(p));
}

/** Para el buscador y para el detalle: el sitio y su comarca. */
export function lugaresTexto(p: Plaza): string {
  const s = sitioMostrado(p);
  if (!s) return '';
  return s.comarca && s.comarca !== s.nombre ? `${s.nombre}, ${s.comarca}` : s.nombre;
}

/**
 * Con qué identificadores casa una convocatoria en el filtro «Dónde». Incluye
 * su comarca, así que marcar una comarca entera trae todos sus pueblos.
 */
export function idsFiltroLugar(p: Plaza): string[] {
  const s = sitioMostrado(p);
  if (!s) return [SIN_LUGAR];
  return s.comarcaId && s.comarcaId !== s.id ? [s.id, s.comarcaId] : [s.id];
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
