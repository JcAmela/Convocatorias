import type { Plaza } from './tipos';
import { catalogoActual } from './localizacion';
import {
  type Criterio, type Filtros,
  aplica as aplicaEn, cuenta as cuentaEn, cuentaVarias as cuentaVariasEn,
  ordena as ordenaEn, type Orden,
} from '../../supabase/functions/_shared/filtros.ts';

export {
  FILTROS_INICIALES, claseContrato, hayFiltros, aQuery, deQuery,
  type Filtros, type Orden, type Pestana, type Vista, type ClaseContrato,
} from '../../supabase/functions/_shared/filtros.ts';

/**
 * Filtrar, para la web.
 *
 * La lógica vive en `_shared/filtros.ts`, donde el catálogo de lugares se
 * pasa como argumento porque el servidor evalúa las suscripciones de mucha
 * gente a la vez. Aquí se inyecta el vigente y los componentes llaman igual
 * que siempre.
 */

export const aplica = (plazas: Plaza[], f: Filtros, excepto?: Criterio) =>
  aplicaEn(catalogoActual(), plazas, f, excepto);

export const cuenta = <T extends string>(
  plazas: Plaza[], f: Filtros, criterio: Criterio, clave: (p: Plaza) => T | null,
) => cuentaEn(catalogoActual(), plazas, f, criterio, clave);

export const cuentaVarias = (
  plazas: Plaza[], f: Filtros, criterio: Criterio, claves: (p: Plaza) => string[],
) => cuentaVariasEn(catalogoActual(), plazas, f, criterio, claves);

export const ordena = (plazas: Plaza[], orden: Orden, desde: string | null = null) =>
  ordenaEn(catalogoActual(), plazas, orden, desde);
