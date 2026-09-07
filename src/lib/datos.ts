import type { Plaza, Tablero } from './tipos';

export const API = 'https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board';

/** Tablero vacío, para cuando la API no contesta durante el build. */
export function tableroVacio(motivo: string): Tablero {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    generado: new Date().toISOString(),
    hoy,
    abiertas: [],
    pendientes: [],
    cerradas: [],
    resumen: { abiertas: 0, pendientes: 0, cerradas: 0, plazas: 0, fijas: 0, temporales: 0, cierranEn7Dias: 0 },
    errores: [motivo],
  };
}

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

/** Deja el tablero con el contrato que promete `tipos.ts`. */
export function saneaTablero(d: Tablero): Tablero {
  return {
    ...d,
    abiertas: d.abiertas.map(sanea),
    pendientes: d.pendientes.map(sanea),
    cerradas: d.cerradas.map(sanea),
    errores: d.errores ?? [],
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

/**
 * Lee el tablero durante el build para que la página pinte contenido real en
 * el primer frame. El navegador vuelve a pedirlo al montar, así que un fallo
 * aquí degrada la primera pintada pero no rompe el sitio: nunca tumbamos el
 * build por una API que hoy no contesta.
 */
export async function leeTablero(): Promise<Tablero> {
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return tableroVacio(`La API respondió ${res.status} durante el build`);
    const cuerpo = await res.json();
    if (!esTablero(cuerpo)) return tableroVacio('La API devolvió algo que no es un tablero');
    return saneaTablero(cuerpo);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return tableroVacio(`No se pudo leer la API durante el build: ${motivo}`);
  }
}
