import type { GetStaticPaths } from 'astro';
import { datosPublicos, ficheroDeGrupo } from '../../lib/publicos';
import type { Grupo } from '../../lib/tipos';

/**
 * `/datos/abiertas.json`, `/datos/pendientes.json` y `/datos/cerradas.json`.
 * La isla las pide cuando las necesita, y la CDN las sirve comprimidas.
 */
export const getStaticPaths = (() =>
  (['abiertas', 'pendientes', 'cerradas'] as const).map((grupo) => ({ params: { grupo } }))) satisfies GetStaticPaths;

export async function GET({ params }: { params: { grupo: Grupo } }) {
  const { tablero } = await datosPublicos();
  return Response.json(ficheroDeGrupo(tablero, params.grupo));
}
