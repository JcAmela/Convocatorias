import type { Plaza, Sitio } from './tipos.ts';
import { type Catalogo, sitio, sitioMostrado } from './catalogo.ts';

/**
 * Distancias. Igual que en `catalogo.ts`, el callejero se pasa como argumento.
 *
 * Qué es «cerca» solo puede significar una cosa: kilómetros desde donde vive
 * quien mira. Antes lo decidía una lista fija de 42 topónimos escrita a mano
 * que además se contradecía con el área que cubría el tablero.
 */

/** Radio por defecto. Media hora de coche, más o menos. */
export const RADIO_CERCA_KM = 30;

const RADIO_TIERRA_KM = 6371;

/** Distancia en línea recta entre dos sitios, o `null` si a alguno le faltan coordenadas. */
export function kmEntre(a: Sitio | null, b: Sitio | null): number | null {
  // Lo que se pregunta es si la coordenada existe, no si vale distinto de
  // cero. Hoy ningún municipio catalán da 0 —el meridiano cero pasa rozando
  // por el oeste, y el punto más occidental de Cataluña está en 0,26—, pero
  // `!a.lat` es una trampa puesta a mano para el día que el catálogo crezca
  // o que alguien redondee: un 0 legítimo se leería como «no hay dato».
  if (a?.lat == null || a.lon == null || b?.lat == null || b.lon == null) return null;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h)));
}

/** Kilómetros desde el municipio de referencia hasta donde se trabaja. */
export function kmDesde(cat: Catalogo, p: Plaza, desdeId: string | null): number | null {
  if (!desdeId) return null;
  return kmEntre(sitio(cat, desdeId), sitioMostrado(cat, p));
}

/**
 * Sin municipio de referencia no se esconde nada: la cercanía se ofrece, no se
 * impone. Y una convocatoria cuyo sitio no tiene coordenadas tampoco se
 * esconde, que sería castigarla por un hueco en el callejero.
 */
export function estaCerca(
  cat: Catalogo, p: Plaza, desdeId: string | null, radio = RADIO_CERCA_KM,
): boolean {
  const km = kmDesde(cat, p, desdeId);
  return km === null || km <= radio;
}
