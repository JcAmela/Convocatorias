import type { Plaza, Grupo } from './tipos';
import { normaliza, urgencia, ORDEN_NIVEL, ETIQUETA_AMBITO } from './formato';
import { idsFiltroLugar, lugaresTexto } from './localizacion';
import { estaCerca, kmDesde } from './cercania';
import { terminosDe } from './oficios';

export type Vista = 'tarjetas' | 'tabla';
export type Orden = 'fin' | 'fin-lejos' | 'plazas' | 'publicado' | 'nivel' | 'cercania';
export type Pestana = Grupo | 'guardadas';
export type ClaseContrato = 'fija' | 'temporal' | 'bolsa';

export interface Filtros {
  pestana: Pestana;
  q: string;
  niveles: string[];
  contratos: ClaseContrato[];
  ambitos: string[];
  urgencias: string[];
  /** Identificadores de lugar de trabajo, los del catálogo de `lugar.ts`. */
  lugares: string[];
  /** Municipio desde el que se miden las distancias. `null` = sin elegir. */
  desde: string | null;
  /** true = esconder lo que queda a más de `RADIO_CERCA_KM` de `desde`. */
  soloCerca: boolean;
  /** Día concreto elegido en el gráfico, `YYYY-MM-DD`. */
  dia: string | null;
  orden: Orden;
  vista: Vista;
}

export const FILTROS_INICIALES: Filtros = {
  pestana: 'abiertas',
  q: '',
  niveles: [],
  contratos: [],
  ambitos: [],
  urgencias: [],
  lugares: [],
  desde: null,
  soloCerca: false,
  dia: null,
  orden: 'fin',
  vista: 'tarjetas',
};

export function claseContrato(p: Plaza): ClaseContrato {
  if (p.tipo === 'bolsa') return 'bolsa';
  return p.fijo ? 'fija' : 'temporal';
}

/** Texto sobre el que busca la caja de búsqueda, calculado una sola vez. */
const cacheTexto = new WeakMap<Plaza, string>();
function textoBuscable(p: Plaza): string {
  let t = cacheTexto.get(p);
  if (t === undefined) {
    t = normaliza(
      // `seleccion` y `tipoEtiqueta` llegan ya en español y no estaban aquí: por
      // eso «oposición» daba cero teniendo 1.191 convocatorias con ese dato, y
      // «interino» cero teniendo 313.
      [p.titulo, p.empleador, lugaresTexto(p), p.nivelEstudios, p.titulacion,
        p.otrosRequisitos, p.seleccion, p.tipoEtiqueta]
        .filter(Boolean)
        .join(' '),
    );
    cacheTexto.set(p, t);
  }
  return t;
}

/** Cada clave es un criterio; se aplican todos menos el que se quiera excluir. */
type Criterio = 'q' | 'niveles' | 'contratos' | 'ambitos' | 'urgencias' | 'lugares' | 'cerca' | 'dia';

function cumple(p: Plaza, f: Filtros, criterio: Criterio): boolean {
  switch (criterio) {
    case 'q': {
      if (!f.q.trim()) return true;
      const texto = textoBuscable(p);
      // Todas las palabras deben aparecer, en cualquier orden; de cada una
      // basta con que encaje una de sus formas, porque se teclea en español
      // y el anuncio está en catalán.
      return terminosDe(f.q).every((formas) => formas.some((forma) => texto.includes(forma)));
    }
    case 'niveles':
      return f.niveles.length === 0 || (p.nivelCodigo !== null && f.niveles.includes(p.nivelCodigo));
    case 'contratos':
      return f.contratos.length === 0 || f.contratos.includes(claseContrato(p));
    case 'ambitos':
      return f.ambitos.length === 0 || f.ambitos.includes(p.ambito);
    case 'urgencias':
      return f.urgencias.length === 0 || f.urgencias.includes(urgencia(p.diasRestantes).cubo);
    case 'lugares':
      // Una plaza puede tocar varios sitios ("Ribera de Cardós - Lleida"), así
      // que basta con que coincida uno.
      return f.lugares.length === 0 || idsFiltroLugar(p).some((id) => f.lugares.includes(id));
    case 'cerca':
      return !f.soloCerca || estaCerca(p, f.desde);
    case 'dia':
      return f.dia === null || p.fin?.slice(0, 10) === f.dia;
  }
}

const TODOS: Criterio[] = ['q', 'niveles', 'contratos', 'ambitos', 'urgencias', 'lugares', 'cerca', 'dia'];

export function aplica(plazas: Plaza[], f: Filtros, excepto?: Criterio): Plaza[] {
  const criterios = excepto ? TODOS.filter((c) => c !== excepto) : TODOS;
  return plazas.filter((p) => criterios.every((c) => cumple(p, f, c)));
}

/**
 * Cuenta cada opción sobre el resto de filtros ya aplicados, que es lo que
 * hace útil el número: dice cuántas quedarían si marcas esa casilla, no
 * cuántas hay en el total.
 */
export function cuenta<T extends string>(
  plazas: Plaza[], f: Filtros, criterio: Criterio, clave: (p: Plaza) => T | null,
): Record<string, number> {
  const base = aplica(plazas, f, criterio);
  const out: Record<string, number> = {};
  for (const p of base) {
    const k = clave(p);
    if (k !== null) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Igual que `cuenta`, pero para criterios donde una plaza puede caer en varias casillas. */
export function cuentaVarias(
  plazas: Plaza[], f: Filtros, criterio: Criterio, claves: (p: Plaza) => string[],
): Record<string, number> {
  const base = aplica(plazas, f, criterio);
  const out: Record<string, number> = {};
  for (const p of base) {
    for (const k of claves(p)) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Las plazas sin fecha van siempre al final, ordenen como ordenen. */
function porFecha(a: Plaza, b: Plaza, desc: boolean): number {
  if (!a.fin && !b.fin) return 0;
  if (!a.fin) return 1;
  if (!b.fin) return -1;
  return desc ? b.fin.localeCompare(a.fin) : a.fin.localeCompare(b.fin);
}

export function ordena(plazas: Plaza[], orden: Orden, desde: string | null = null): Plaza[] {
  const copia = [...plazas];
  switch (orden) {
    case 'cercania': return copia.sort((a, b) => {
      // Las que no se sabe a qué distancia están van al final, no al principio.
      const ka = kmDesde(a, desde) ?? Infinity;
      const kb = kmDesde(b, desde) ?? Infinity;
      return ka - kb || porFecha(a, b, false);
    });
    case 'fin': return copia.sort((a, b) => porFecha(a, b, false));
    case 'fin-lejos': return copia.sort((a, b) => porFecha(a, b, true));
    case 'plazas': return copia.sort((a, b) => (b.plazas ?? 0) - (a.plazas ?? 0) || porFecha(a, b, false));
    case 'publicado': return copia.sort((a, b) => (b.publicado ?? '').localeCompare(a.publicado ?? ''));
    case 'nivel': return copia.sort(
      (a, b) => (ORDEN_NIVEL[a.nivelCodigo ?? ''] ?? 9) - (ORDEN_NIVEL[b.nivelCodigo ?? ''] ?? 9) || porFecha(a, b, false),
    );
  }
}

export function hayFiltros(f: Filtros): boolean {
  return Boolean(
    f.q.trim() || f.niveles.length || f.contratos.length || f.ambitos.length ||
    f.urgencias.length || f.lugares.length || f.soloCerca || f.dia,
  );
}

/* ------------------------------------------------------- estado en la URL */

/** Para que una búsqueda filtrada se pueda guardar en marcadores o compartir. */
export function aQuery(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.pestana !== 'abiertas') p.set('ver', f.pestana);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.niveles.length) p.set('estudios', f.niveles.join(','));
  if (f.contratos.length) p.set('tipo', f.contratos.join(','));
  if (f.ambitos.length) p.set('convoca', f.ambitos.join(','));
  if (f.urgencias.length) p.set('plazo', f.urgencias.join(','));
  if (f.lugares.length) p.set('donde', f.lugares.join(','));
  if (f.desde) p.set('desde', f.desde);
  if (f.soloCerca) p.set('cerca', '1');
  if (f.dia) p.set('dia', f.dia);
  if (f.orden !== 'fin') p.set('orden', f.orden);
  if (f.vista !== 'tarjetas') p.set('vista', f.vista);
  return p.toString();
}

/** Cubos de urgencia que ofrece la barra de filtros. */
const URGENCIAS_VALIDAS = ['hoy', '3dias', 'semana', 'mes', 'lejano'];

/**
 * La query la escribe cualquiera: un enlace viejo de cuando los valores se
 * llamaban de otra forma, un recorte a mano, un rastreador probando cosas. Lo
 * que no se reconoce se tira, porque un filtro fantasma deja la pantalla
 * vacía sin decir por qué y encima pinta una ficha con texto ilegible.
 */
export function deQuery(query: string): Filtros {
  const p = new URLSearchParams(query);
  const lista = (k: string, validos?: readonly string[]) => {
    const crudo = p.get(k) ? p.get(k)!.split(',').filter(Boolean) : [];
    return validos ? crudo.filter((v) => validos.includes(v)) : crudo;
  };
  const pestana = p.get('ver');
  const orden = p.get('orden');
  const vista = p.get('vista');
  const dia = p.get('dia');
  const desde = /^[a-z0-9-]{1,60}$/.test(p.get('desde') ?? '') ? p.get('desde') : null;
  return {
    ...FILTROS_INICIALES,
    pestana: (['abiertas', 'pendientes', 'cerradas', 'guardadas'] as const).includes(pestana as Pestana)
      ? (pestana as Pestana) : 'abiertas',
    q: p.get('q') ?? '',
    niveles: lista('estudios', Object.keys(ORDEN_NIVEL)),
    contratos: lista('tipo', ['fija', 'temporal', 'bolsa']) as ClaseContrato[],
    ambitos: lista('convoca', Object.keys(ETIQUETA_AMBITO)),
    urgencias: lista('plazo', URGENCIAS_VALIDAS),
    // Los lugares salen de los datos, así que aquí solo se comprueba la forma;
    // el que no exista en el catálogo no casará con nada y se podrá quitar
    // desde su ficha.
    lugares: lista('donde').filter((v) => /^[a-z0-9-]{1,60}$/.test(v)),
    desde,
    // Sin municipio de referencia no hay nada que medir: `?cerca=1` a secas
    // dejaba un filtro marcado que no filtraba nada y sin forma de apagarlo.
    soloCerca: Boolean(desde) && p.get('cerca') === '1',
    dia: dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null,
    // Ordenar por cercanía sin saber desde dónde dejaba el desplegable de orden
    // en blanco, con la lista ordenada por un criterio que no se veía.
    orden: (['fin', 'fin-lejos', 'plazas', 'publicado', 'nivel', 'cercania'] as const).includes(orden as Orden)
      && (orden !== 'cercania' || desde)
      ? (orden as Orden) : 'fin',
    vista: vista === 'tabla' ? 'tabla' : 'tarjetas',
  };
}
