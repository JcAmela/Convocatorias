import { createHash } from 'node:crypto';
import type { Grupo } from './tipos';
import { conFicha } from './paginas';
import { datosPublicos, recorta } from './publicos';
import { rutaFicha } from './rutas';
import { SITIO } from '../../supabase/functions/_shared/sitio.ts';

/**
 * `/datos/indice.json`: qué fichas tiene este build, con una huella de su
 * contenido y la fecha en que cambió por última vez.
 *
 * Sirve a dos cosas:
 *   - el `lastmod` del sitemap: la fecha es la del último cambio de verdad,
 *     no la del build, porque el build siguiente lee el índice publicado y
 *     conserva la fecha de las fichas cuya huella no ha cambiado;
 *   - los correos de avisos, que solo enlazan a una ficha propia si ya está
 *     publicada (si no, al enlace oficial).
 */

export interface EntradaIndice {
  id: string;
  url: string;
  grupo: Grupo;
  huella: string;
  /** `YYYY-MM-DD`: el último día en que cambió lo que dice la ficha. */
  cambio: string;
}

export interface Indice {
  generado: string;
  fichas: EntradaIndice[];
}

export const INDICE_PUBLICADO = `${SITIO}/datos/indice.json`;

/**
 * La huella de lo que dice una ficha. Sin `diasRestantes`, que cambia cada
 * día sin que cambie nada de la convocatoria.
 */
export function huella(p: Parameters<typeof recorta>[0], grupo: Grupo): string {
  const { diasRestantes: _, ...resto } = recorta(p);
  return createHash('sha256').update(JSON.stringify({ grupo, ...resto })).digest('base64url').slice(0, 16);
}

/** Las fechas de cambio del índice publicado. Si no se puede leer, ninguna. */
async function cambiosPublicados(): Promise<Map<string, { huella: string; cambio: string }>> {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  if (env.DATOS === 'fixture') return new Map();
  try {
    const r = await fetch(INDICE_PUBLICADO, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return new Map();
    const anterior = (await r.json()) as Indice;
    return new Map(anterior.fichas.map((f) => [f.id, { huella: f.huella, cambio: f.cambio }]));
  } catch {
    return new Map();
  }
}

let indice: Promise<Indice> | undefined;

/** El índice de este build, calculado una vez. */
export function indiceDeFichas(): Promise<Indice> {
  indice ??= (async () => {
    const [{ tablero }, antes] = await Promise.all([datosPublicos(), cambiosPublicados()]);
    return {
      generado: tablero.generado,
      fichas: conFicha(tablero).map(({ plaza, grupo }) => {
        const h = huella(plaza, grupo);
        const previo = antes.get(plaza.id);
        return {
          id: plaza.id,
          url: rutaFicha(plaza),
          grupo,
          huella: h,
          cambio: previo && previo.huella === h ? previo.cambio : tablero.hoy,
        };
      }),
    };
  })();
  return indice;
}
