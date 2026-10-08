import { API, esTablero, saneaTablero } from './datos';
import { CLAVE_PUBLICA, URL_SUPABASE } from './supabase-publico';
import type { Tablero } from './tipos';

/**
 * La lectura de datos del build, la que decide si hoy se publica.
 *
 * `leeTablero()` se tragaba cualquier fallo y devolvía un tablero vacío: si la
 * API se caía durante el build, se publicaba la web sin una sola plaza. Ahora
 * el build falla, y con él falla el despliegue, así que sigue servida la
 * versión anterior, que es vieja pero está entera.
 *
 * Vive aparte de `datos.ts` porque `datos.ts` lo importa también la isla del
 * navegador, y aquí se leen variables de entorno y un fichero del disco.
 *
 * Variables:
 *   - `DATOS=fixture`: lee `pruebas/fixtures/tablero.json` y no sale a la red.
 *     Es lo que construye la CI.
 *   - `CONVOCA_API`: de dónde leer en vivo. Por defecto, la Edge Function.
 *   - `PERMITIR_BAJADA=1`: deja pasar UN build con una bajada de abiertas que
 *     se haya comprobado a mano en las fuentes. Se quita después.
 */

/** Los umbrales por los que un build se niega a publicar. */
export const UMBRALES = {
  /** Las abiertas no pueden caer más de esto frente al último build publicado. */
  bajadaMaxima: 0.3,
  /** El cron recalcula a diario a las 04:00 UTC: 26 h dejan dos de margen. */
  horasMaximas: 26,
  /** Lo que se espera a la API antes de darla por caída. */
  esperaMs: 60_000,
} as const;

/** Dónde está publicado el recuento del último build, para comparar. */
export const META_PUBLICADA = 'https://convocatorias-ten.vercel.app/datos/meta.json';

/**
 * Las fuentes cuyo fallo no impide publicar. Los portales Convoca son tres
 * municipios y su continuidad está en estudio; `(archivo)` es la escritura
 * del historial en la base, que no cambia lo que se sirve hoy. Todo lo demás
 * —las siete consultas a CIDO y su callejero— es la web entera, y una fuente
 * que no se reconoce también cuenta como fallo: mejor parar de más que
 * publicar sin la Generalitat.
 */
const NO_BLOQUEAN = new Set(['Badalona', 'El Masnou', 'Santa Coloma de Gramenet', '(archivo)']);

/** El build se niega a publicar. El mensaje dice por qué. */
export class BuildRechazado extends Error {
  override name = 'BuildRechazado';
}

type Entorno = Record<string, string | undefined>;

function entorno(): Entorno {
  return (globalThis as { process?: { env: Entorno } }).process?.env ?? {};
}

/** Los fallos de `errores` que bloquean el build, como texto. */
export function fallosQueBloquean(errores: unknown): string[] {
  if (!Array.isArray(errores)) return [];
  const fuera: string[] = [];
  for (const e of errores) {
    if (e && typeof e === 'object') {
      const { fuente, mensaje } = e as { fuente?: unknown; mensaje?: unknown };
      if (typeof fuente === 'string' && NO_BLOQUEAN.has(fuente)) continue;
      fuera.push(`${String(fuente ?? '?')}: ${String(mensaje ?? '')}`);
    } else if (typeof e === 'string') {
      if ([...NO_BLOQUEAN].some((f) => e.startsWith(`${f}:`))) continue;
      fuera.push(e);
    }
  }
  return fuera;
}

export interface Contexto {
  /** Milisegundos desde 1970, como `Date.now()`. */
  ahora: number;
  /** Abiertas del último build publicado, o `null` si no hay con qué comparar. */
  anteriores: number | null;
  permitirBajada: boolean;
}

/**
 * Los motivos para no publicar lo que ha llegado. Vacío quiere decir que se
 * puede publicar. Se mira la respuesta tal cual llega, antes de sanearla,
 * porque el saneado aplana los errores a texto.
 */
export function motivosParaNoPublicar(t: Tablero, ctx: Contexto): string[] {
  const motivos: string[] = [];
  const abiertas = t.abiertas.length;

  if (abiertas === 0) motivos.push('llegan 0 convocatorias abiertas');

  if (ctx.anteriores !== null && ctx.anteriores > 0 && !ctx.permitirBajada) {
    const bajada = (ctx.anteriores - abiertas) / ctx.anteriores;
    if (bajada > UMBRALES.bajadaMaxima) {
      motivos.push(
        `las abiertas bajan de ${ctx.anteriores} a ${abiertas} (${Math.round(bajada * 100)} %, ` +
        `el máximo es ${UMBRALES.bajadaMaxima * 100} %). Si la bajada es real y está comprobada ` +
        'en las fuentes, construye una vez con PERMITIR_BAJADA=1',
      );
    }
  }

  const fallos = fallosQueBloquean(t.errores);
  if (fallos.length) motivos.push(`fallan fuentes de CIDO: ${fallos.join(' | ')}`);

  const generado = Date.parse(t.generado);
  if (!Number.isFinite(generado)) {
    motivos.push(`\`generado\` no es una fecha: ${JSON.stringify(t.generado)}`);
  } else {
    const horas = (ctx.ahora - generado) / 3_600_000;
    if (horas > UMBRALES.horasMaximas) {
      motivos.push(`los datos tienen ${Math.round(horas)} h (\`generado\` = ${t.generado}), el máximo es ${UMBRALES.horasMaximas} h`);
    }
  }

  return motivos;
}

/**
 * Las abiertas del último build publicado, sacadas de su `meta.json`.
 * `null` cuando todavía no existe (un 404): es el primer build que lo publica.
 * Cualquier otro fallo para el build, salvo con `PERMITIR_BAJADA=1`, porque
 * sin ese número no se puede saber si hoy faltan plazas.
 */
export async function abiertasPublicadas(url: string, permitirBajada: boolean): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(UMBRALES.esperaMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`respondió ${res.status}`);
    const meta = (await res.json()) as { recuentos?: { abiertas?: unknown } };
    const n = meta?.recuentos?.abiertas;
    if (typeof n !== 'number') throw new Error('no trae `recuentos.abiertas`');
    return n;
  } catch (err) {
    if (permitirBajada) return null;
    const motivo = err instanceof Error ? err.message : String(err);
    throw new BuildRechazado(`No se pudo leer el recuento publicado (${url}): ${motivo}`);
  }
}

async function leeEnVivo(env: Entorno): Promise<Tablero> {
  const url = env.CONVOCA_API || API;
  let cuerpo: unknown;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(UMBRALES.esperaMs) });
    if (!res.ok) throw new Error(`respondió ${res.status}`);
    cuerpo = await res.json();
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    throw new BuildRechazado(`La API no contesta (${url}): ${motivo}`);
  }
  if (!esTablero(cuerpo)) throw new BuildRechazado(`La API devolvió algo que no es un tablero (${url})`);

  const permitirBajada = env.PERMITIR_BAJADA === '1';
  const anteriores = await abiertasPublicadas(META_PUBLICADA, permitirBajada);
  const motivos = motivosParaNoPublicar(cuerpo, { ahora: Date.now(), anteriores, permitirBajada });
  if (motivos.length) throw new BuildRechazado(`No se publica: ${motivos.join('; ')}.`);
  if (permitirBajada) console.warn('[datos] PERMITIR_BAJADA=1: este build se salta la comparación con el anterior. Quítalo después.');
  await latido();
  return saneaTablero(cuerpo);
}

/**
 * Una lectura con la clave pública, para que la base tenga actividad de
 * usuario aunque el navegador ya no le hable: el plan gratuito pausa el
 * proyecto tras una semana sin ella. Lee solo la fecha de la copia, que es lo
 * único que esa clave puede ver (`supabase/migraciones/2026-10-08-latido-anon.sql`).
 *
 * No para el build: si falla, se avisa y se sigue. Que no haya latido un día
 * no cambia los datos que se publican.
 */
export async function latido(): Promise<void> {
  try {
    const res = await fetch(`${URL_SUPABASE}/rest/v1/convoca_snapshot?select=id,updated_at&id=eq.1`, {
      headers: { apikey: CLAVE_PUBLICA },
      signal: AbortSignal.timeout(15_000),
    });
    const filas = res.ok ? ((await res.json()) as unknown[]) : [];
    if (!res.ok || filas.length !== 1) console.warn(`[datos] El latido a la base no devolvió la fila esperada (HTTP ${res.status}).`);
  } catch (err) {
    console.warn(`[datos] El latido a la base falló: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function leeFixture(): Promise<Tablero> {
  const { default: cuerpo } = await import('../../pruebas/fixtures/tablero.json');
  if (!esTablero(cuerpo)) throw new BuildRechazado('El fixture no tiene forma de tablero');
  if (cuerpo.abiertas.length === 0) throw new BuildRechazado('El fixture no trae abiertas');
  return saneaTablero(cuerpo as unknown as Tablero);
}

let lectura: Promise<Tablero> | undefined;

/**
 * El tablero del build. Se lee una sola vez por build aunque lo pidan varias
 * páginas: antes cada página volvía a llamar a la API.
 */
export function leeTableroEstricto(): Promise<Tablero> {
  if (!lectura) {
    const env = entorno();
    lectura = env.DATOS === 'fixture' ? leeFixture() : leeEnVivo(env);
  }
  return lectura;
}
