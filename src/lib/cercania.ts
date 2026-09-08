import type { Plaza, Sitio } from './tipos';
import { sitioMostrado, sitio } from './localizacion';

/**
 * Qué es «cerca».
 *
 * Antes lo decidía una lista fija de 42 topónimos escrita a mano, que además
 * se contradecía con el área que cubría el tablero: Mataró estaba en la lista
 * de lejanos y a la vez dentro del radio que dejaba entrar convocatorias. Y
 * como la lista miraba el paréntesis del título, las de Badalona, El Masnou y
 * Santa Coloma nunca se marcaban.
 *
 * Ahora cada convocatoria trae las coordenadas de su municipio y la web sirve
 * a toda Cataluña, así que «cerca» solo puede significar una cosa: kilómetros
 * desde donde vive quien está mirando. Se elige el pueblo una vez y se guarda
 * en este navegador.
 */

const CLAVE_REFERENCIA = 'convocatorias:desde';

/** Radio por defecto. Media hora de coche, más o menos. */
export const RADIO_CERCA_KM = 30;

export function referenciaGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE_REFERENCIA);
  } catch {
    return null;
  }
}

export function guardaReferencia(id: string | null): void {
  try {
    if (id) localStorage.setItem(CLAVE_REFERENCIA, id);
    else localStorage.removeItem(CLAVE_REFERENCIA);
  } catch {
    // Sin almacenamiento la elección dura lo que dure la pestaña.
  }
}

const RADIO_TIERRA_KM = 6371;

/** Distancia en línea recta entre dos sitios, o `null` si a alguno le faltan coordenadas. */
export function kmEntre(a: Sitio | null, b: Sitio | null): number | null {
  if (!a?.lat || !a?.lon || !b?.lat || !b?.lon) return null;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h)));
}

/** Kilómetros desde el municipio de referencia hasta donde se trabaja. */
export function kmDesde(p: Plaza, desdeId: string | null): number | null {
  if (!desdeId) return null;
  return kmEntre(sitio(desdeId), sitioMostrado(p));
}

/**
 * Sin municipio de referencia no se esconde nada: la cercanía se ofrece, no se
 * impone. Y una convocatoria cuyo sitio no tiene coordenadas tampoco se
 * esconde, que sería castigarla por un hueco en el callejero.
 */
export function estaCerca(p: Plaza, desdeId: string | null, radio = RADIO_CERCA_KM): boolean {
  const km = kmDesde(p, desdeId);
  return km === null || km <= radio;
}
