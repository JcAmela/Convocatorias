import { ordena } from './filtros';
import { leeTableroEstricto, NO_BLOQUEAN } from './lectura';
import { esPublicable } from '../../supabase/functions/_shared/publicable.ts';
import type { Grupo, Plaza, Resumen, Sitio, Tablero } from './tipos';

/**
 * Lo que se publica en `/datos/` y lo que va en el HTML de la portada.
 *
 * La web servía cada visita desde la Edge Function: 2,25 MB de JSON sin
 * caché, y el HTML llevaba otra copia empotrada de 1,97 MB. Ahora el build
 * escribe ficheros estáticos que sirve la CDN, y la portada solo trae lo que
 * pinta en la primera pantalla.
 */

/**
 * La atribución que pide la licencia, en cada fichero. CIDO publica estos
 * datos con CC BY 4.0: hay que citar a la Diputació de Barcelona, la fecha
 * de actualización y decir qué se ha cambiado.
 */
export const ATRIBUCION = {
  fuente: 'CIDO – Diputació de Barcelona',
  url: 'https://cido.diba.cat',
  licencia: 'CC BY 4.0',
  licenciaUrl: 'https://creativecommons.org/licenses/by/4.0/deed.es',
  cambios: 'Selección de campos, clasificación por plazo y lugar, y etiquetas traducidas al castellano. ' +
    'Convocatorias es una web independiente, no oficial.',
} as const;

/**
 * Campos que el navegador no usa. `municipio` y `lejos` están obsoletos (ver
 * `tipos.ts`), `estadoOrigen` solo lo mira el servidor para clasificar, y
 * `fuente` y `contratoOriginal` no se pintan. Los `null` también se van:
 * `saneaPlazas()` los repone al llegar.
 */
const SOBRAN = ['municipio', 'lejos', 'estadoOrigen', 'fuente', 'contratoOriginal'] as const;

export function recorta(p: Plaza): Partial<Plaza> {
  const q: Record<string, unknown> = { ...p };
  for (const k of SOBRAN) delete q[k];
  // Las filas viejas del archivo no traen identificadores de lugar, y para
  // ellas `municipio` es lo único que queda para enseñar dónde (`legado()`).
  if (!p.donde?.sedeId && !p.donde?.trabajoId && p.municipio) q.municipio = p.municipio;
  for (const [k, v] of Object.entries(q)) if (v === null) delete q[k];
  return q as Partial<Plaza>;
}

export { esPublicable };

/** Las cifras del tablero, con las mismas cuentas que hace la isla. */
export function resumenDe(abiertas: Plaza[], pendientes: Plaza[], cerradas: Plaza[]): Resumen {
  return {
    abiertas: abiertas.length,
    pendientes: pendientes.length,
    cerradas: cerradas.length,
    plazas: abiertas.reduce((s, p) => s + (p.plazas ?? 0), 0),
    fijas: abiertas.filter((p) => p.fijo).length,
    temporales: abiertas.filter((p) => !p.fijo).length,
    cierranEn7Dias: abiertas.filter((p) => p.diasRestantes !== null && p.diasRestantes >= 0 && p.diasRestantes <= 7).length,
  };
}

/** Los sitios que hacen falta para pintar estas plazas: sede, destino y sus comarcas. */
export function sitiosDe(plazas: Plaza[], todos: Record<string, Sitio>): Record<string, Sitio> {
  const out: Record<string, Sitio> = {};
  const mete = (id: string | null | undefined) => {
    const s = id ? todos[id] : undefined;
    if (!s || out[s.id]) return;
    out[s.id] = s;
    mete(s.comarcaId);
  };
  for (const p of plazas) {
    mete(p.donde?.sedeId);
    mete(p.donde?.trabajoId);
  }
  return out;
}

/** Cuántas tarjetas pinta la isla antes de «Ver más». Tiene que coincidir con `PAGINA` en `Tablero.tsx`. */
export const PRIMERA_PAGINA = 24;

/** Las que pinta la isla al abrir la portada sin filtros: por fecha de cierre. */
export function primeras(abiertas: Plaza[]): Plaza[] {
  return ordena(abiertas, 'fin').slice(0, PRIMERA_PAGINA);
}

/** Días que dibuja el calendario por delante. Tiene que coincidir con `Calendario.tsx`. */
const DIAS_CALENDARIO = 45;

/**
 * Lo mínimo para dibujar el calendario de cierres antes de que lleguen todas
 * las abiertas: su fecha y sus puestos, y solo las que caen en lo que se ve.
 */
export function paraCalendario(abiertas: Plaza[], hoy: string): Pick<Plaza, 'fin' | 'plazas'>[] {
  const fin = new Date(Date.parse(hoy) + DIAS_CALENDARIO * 86_400_000).toISOString().slice(0, 10);
  return abiertas
    .filter((p) => p.fin !== null && p.fin.slice(0, 10) >= hoy && p.fin.slice(0, 10) < fin)
    .map((p) => ({ fin: p.fin!.slice(0, 10), plazas: p.plazas }));
}

export interface Publicos {
  tablero: Tablero;
  commit: string | null;
}

let publicos: Promise<Publicos> | undefined;

/** El tablero que se publica, leído una vez por build. */
export function datosPublicos(): Promise<Publicos> {
  publicos ??= leeTableroEstricto().then((t) => {
    const abiertas = t.abiertas.filter(esPublicable);
    const pendientes = t.pendientes.filter(esPublicable);
    const cerradas = t.cerradas.filter(esPublicable);
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    return {
      tablero: {
        ...t, abiertas, pendientes, cerradas,
        resumen: resumenDe(abiertas, pendientes, cerradas),
        // Un fallo de una fuente que no se publica no es un aviso para nadie.
        errores: t.errores.filter((e) => ![...NO_BLOQUEAN].some((f) => String(e).startsWith(`${f}:`))),
      },
      commit: env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null,
    };
  });
  return publicos;
}

/** Lo que va en `/datos/<grupo>.json`. */
export function ficheroDeGrupo(t: Tablero, grupo: Grupo) {
  return { generado: t.generado, hoy: t.hoy, atribucion: ATRIBUCION, plazas: t[grupo].map(recorta) };
}

/** Lo que va en `/datos/meta.json`. Es lo que lee el build siguiente para comparar. */
export function ficheroMeta({ tablero: t, commit }: Publicos) {
  return {
    generado: t.generado,
    hoy: t.hoy,
    commit,
    recuentos: { abiertas: t.abiertas.length, pendientes: t.pendientes.length, cerradas: t.cerradas.length },
    resumen: t.resumen,
    errores: t.errores,
    atribucion: ATRIBUCION,
  };
}
