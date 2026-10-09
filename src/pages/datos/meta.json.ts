import { datosPublicos, ficheroMeta } from '../../lib/publicos';

/**
 * `/datos/meta.json`: cuándo se calcularon los datos, cuántos hay y de qué
 * commit sale el build. Lo leen el build siguiente (para ver si faltan
 * plazas), el workflow de frescura y la isla (para saber si hay datos nuevos).
 */
export async function GET() {
  return Response.json(ficheroMeta(await datosPublicos()));
}
