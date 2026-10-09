import type { Localizacion, Plaza, Sitio, Tablero } from './tipos';
import { URL_SUPABASE } from './supabase-publico';

/** La Edge Function del tablero. El build puede apuntar a otra con `CONVOCA_API` (`lectura.ts`). */
export const API = `${URL_SUPABASE}/functions/v1/convoca-board`;

/**
 * La API no siempre manda todos los campos. En las convocatorias antiguas
 * omite `empleador`, `enlace` o `nivelCodigo` en vez de enviarlos a `null`, y
 * 42 de las 138 cerradas llegan hoy así. Como el tipo `Plaza` los declara
 * obligatorios, el primer `empleador.split('·')` reventaba y la pestaña «Ya
 * cerradas» se quedaba en blanco entera.
 *
 * En vez de sembrar de interrogantes cada componente, los datos se ponen en
 * regla al entrar: aquí está el único sitio que sabe que el origen es
 * irregular, y de paso esta función documenta qué puede faltar.
 */
function sanea(p: Partial<Plaza> | null | undefined): Plaza {
  const q = p ?? {};
  return {
    id: q.id ?? `sin-id-${Math.random().toString(36).slice(2)}`,
    titulo: q.titulo ?? 'Convocatoria sin título',
    // Aquí no se cae al ámbito que dice la API. Las 42 plazas que llegan sin
    // organismo vienen marcadas como «generalitat» y no lo son: son escoles
    // bressol, el Parc Zoològic o los bomberos de Barcelona, o sea el
    // Ayuntamiento. Son filas viejas del archivo, guardadas por una versión
    // anterior del recolector que no rellenaba estos campos. Repetir esa
    // etiqueta sería engañar dos veces.
    empleador: q.empleador ?? 'Organismo sin identificar',
    // Las convocatorias archivadas antes del cambio de localizaciones no traen
    // `donde`. Se les fabrica uno a partir del `lugar` de texto que guardaron.
    donde: q.donde ?? legadoDonde(q),
    municipio: q.municipio ?? null,
    lugar: q.lugar ?? null,
    ambito: q.ambito ?? '',
    tipo: q.tipo ?? 'convocatoria',
    fijo: q.fijo ?? false,
    tipoEtiqueta: q.tipoEtiqueta ?? '',
    contratoOriginal: q.contratoOriginal ?? null,
    fin: q.fin ?? null,
    inicio: q.inicio ?? null,
    publicado: q.publicado ?? null,
    diasRestantes: q.diasRestantes ?? null,
    notaPlazo: q.notaPlazo ?? null,
    plazas: q.plazas ?? null,
    nivelCodigo: q.nivelCodigo ?? null,
    nivelEstudios: q.nivelEstudios ?? null,
    titulacion: q.titulacion ?? null,
    otrosRequisitos: q.otrosRequisitos ?? null,
    seleccion: q.seleccion ?? null,
    lejos: q.lejos ?? false,
    enlace: q.enlace ?? null,
    fichaOficial: q.fichaOficial ?? null,
    fuente: q.fuente,
  };
}

/** El `donde` de una fila vieja del archivo, que solo tiene texto. */
function legadoDonde(q: Partial<Plaza>): Localizacion {
  return { sedeId: null, trabajoId: null, origen: q.lugar ? 'titulo' : 'desconocido' };
}

/**
 * Cataluña, con un margen holgado. El catálogo llega del servidor y puede
 * traer una coordenada rota: hoy mismo Sant Marçal viene con
 * `lon: 27660452`, y eso no es un número raro que se quede quieto en un
 * rincón —el desplegable «desde dónde mido» ofrece los 987 municipios, así
 * que quien viva allí elige su pueblo y el tablero entero le anuncia
 * distancias de diez mil kilómetros y le ordena la lista al revés.
 *
 * Una coordenada que no cae en Cataluña no es una coordenada de esta web. Se
 * tira y el sitio se queda sin ella: sin distancia se puede vivir —no se
 * enseña ninguna y no se esconde nada—, con una distancia falsa no.
 */
const CAJA_CATALUNA = { latMin: 40, latMax: 43.5, lonMin: -0.5, lonMax: 4 };

function coordenada(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** El catálogo de sitios, con las coordenadas imposibles descartadas. */
export function saneaSitios(sitios: Record<string, Sitio> | undefined): Record<string, Sitio> {
  const out: Record<string, Sitio> = {};
  for (const [id, s] of Object.entries(sitios ?? {})) {
    if (!s) continue;
    const lat = coordenada(s.lat, CAJA_CATALUNA.latMin, CAJA_CATALUNA.latMax);
    const lon = coordenada(s.lon, CAJA_CATALUNA.lonMin, CAJA_CATALUNA.lonMax);
    // Las dos o ninguna: media coordenada no sitúa nada.
    const situado = lat !== null && lon !== null;
    out[id] = { ...s, lat: situado ? lat : null, lon: situado ? lon : null };
  }
  return out;
}

/** Una lista suelta de plazas, como llega en `/datos/<grupo>.json`. */
export function saneaPlazas(lista: unknown): Plaza[] {
  return Array.isArray(lista) ? lista.map((p) => sanea(p as Partial<Plaza>)) : [];
}

/** Deja el tablero con el contrato que promete `tipos.ts`. */
export function saneaTablero(d: Tablero): Tablero {
  return {
    ...d,
    abiertas: d.abiertas.map(sanea),
    pendientes: d.pendientes.map(sanea),
    cerradas: d.cerradas.map(sanea),
    sitios: saneaSitios(d.sitios),
    // El servidor manda `{fuente, mensaje}` y las copias viejas del archivo
    // mandan cadenas sueltas. Se aplana aquí: el aviso de la cabecera hacía
    // `join('. ')` sobre objetos y pintaba «[object Object]».
    errores: (d.errores ?? []).map((e) =>
      typeof e === 'string' ? e : `${(e as { fuente?: string }).fuente ?? ''}: ${(e as { mensaje?: string }).mensaje ?? ''}`.replace(/^: /, '')),
  };
}

/**
 * ¿Lo que ha contestado el servidor tiene la forma de un tablero? Una API que
 * responde 200 con un `{ error: ... }` dejaría la pantalla en blanco al primer
 * `datos.abiertas.map`, y eso es peor que seguir enseñando la copia anterior.
 */
export function esTablero(d: unknown): d is Tablero {
  const t = d as Tablero | null;
  return Boolean(
    t && typeof t === 'object' &&
    Array.isArray(t.abiertas) && Array.isArray(t.pendientes) && Array.isArray(t.cerradas),
  );
}
