import type { Plaza } from './tipos';
import {
  estaCerca as estaCercaEn, kmDesde as kmDesdeEn,
} from '../../supabase/functions/_shared/geo.ts';
import { catalogoActual } from './localizacion';

export { kmEntre, RADIO_CERCA_KM } from '../../supabase/functions/_shared/geo.ts';

/**
 * Distancias, para la web. La trigonometría y el criterio de «cerca» viven en
 * `_shared/geo.ts`; aquí solo se inyecta el catálogo vigente y se guarda el
 * municipio de referencia, que es lo único de esto que es del navegador.
 */

const CLAVE_REFERENCIA = 'convocatorias:desde';

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

export const kmDesde = (p: Plaza, desdeId: string | null) => kmDesdeEn(catalogoActual(), p, desdeId);
export const estaCerca = (p: Plaza, desdeId: string | null, radio?: number) =>
  estaCercaEn(catalogoActual(), p, desdeId, radio);
