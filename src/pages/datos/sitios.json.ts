import { ATRIBUCION, datosPublicos } from '../../lib/publicos';

/** `/datos/sitios.json`: el callejero entero, para los filtros y las distancias. */
export async function GET() {
  const { tablero } = await datosPublicos();
  return Response.json({ generado: tablero.generado, atribucion: ATRIBUCION, sitios: tablero.sitios });
}
