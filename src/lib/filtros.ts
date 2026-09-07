import type { Plaza, Grupo } from './tipos';
import { normaliza, urgencia, ORDEN_NIVEL } from './formato';

export type Vista = 'tarjetas' | 'tabla';
export type Orden = 'fin' | 'fin-lejos' | 'plazas' | 'publicado' | 'nivel';
export type Pestana = Grupo | 'guardadas';
export type ClaseContrato = 'fija' | 'temporal' | 'bolsa';

export interface Filtros {
  pestana: Pestana;
  q: string;
  niveles: string[];
  contratos: ClaseContrato[];
  ambitos: string[];
  urgencias: string[];
  /** true = esconder lo que cae fuera del área metropolitana. */
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
      [p.titulo, p.empleador, p.lugar, p.municipio, p.nivelEstudios, p.titulacion, p.otrosRequisitos]
        .filter(Boolean)
        .join(' '),
    );
    cacheTexto.set(p, t);
  }
  return t;
}

/** Cada clave es un criterio; se aplican todos menos el que se quiera excluir. */
type Criterio = 'q' | 'niveles' | 'contratos' | 'ambitos' | 'urgencias' | 'cerca' | 'dia';

function cumple(p: Plaza, f: Filtros, criterio: Criterio): boolean {
  switch (criterio) {
    case 'q': {
      if (!f.q.trim()) return true;
      const texto = textoBuscable(p);
      // Todas las palabras deben aparecer, en cualquier orden.
      return normaliza(f.q).split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
    }
    case 'niveles':
      return f.niveles.length === 0 || (p.nivelCodigo !== null && f.niveles.includes(p.nivelCodigo));
    case 'contratos':
      return f.contratos.length === 0 || f.contratos.includes(claseContrato(p));
    case 'ambitos':
      return f.ambitos.length === 0 || f.ambitos.includes(p.ambito);
    case 'urgencias':
      return f.urgencias.length === 0 || f.urgencias.includes(urgencia(p.diasRestantes).cubo);
    case 'cerca':
      return !f.soloCerca || !p.lejos;
    case 'dia':
      return f.dia === null || p.fin?.slice(0, 10) === f.dia;
  }
}

const TODOS: Criterio[] = ['q', 'niveles', 'contratos', 'ambitos', 'urgencias', 'cerca', 'dia'];

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

/** Las plazas sin fecha van siempre al final, ordenen como ordenen. */
function porFecha(a: Plaza, b: Plaza, desc: boolean): number {
  if (!a.fin && !b.fin) return 0;
  if (!a.fin) return 1;
  if (!b.fin) return -1;
  return desc ? b.fin.localeCompare(a.fin) : a.fin.localeCompare(b.fin);
}

export function ordena(plazas: Plaza[], orden: Orden): Plaza[] {
  const copia = [...plazas];
  switch (orden) {
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
    f.urgencias.length || f.soloCerca || f.dia,
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
  if (f.soloCerca) p.set('cerca', '1');
  if (f.dia) p.set('dia', f.dia);
  if (f.orden !== 'fin') p.set('orden', f.orden);
  if (f.vista !== 'tarjetas') p.set('vista', f.vista);
  return p.toString();
}

export function deQuery(query: string): Filtros {
  const p = new URLSearchParams(query);
  const lista = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : []);
  const pestana = p.get('ver');
  const orden = p.get('orden');
  const vista = p.get('vista');
  return {
    ...FILTROS_INICIALES,
    pestana: (['abiertas', 'pendientes', 'cerradas', 'guardadas'] as const).includes(pestana as Pestana)
      ? (pestana as Pestana) : 'abiertas',
    q: p.get('q') ?? '',
    niveles: lista('estudios'),
    contratos: lista('tipo') as ClaseContrato[],
    ambitos: lista('convoca'),
    urgencias: lista('plazo'),
    soloCerca: p.get('cerca') === '1',
    dia: p.get('dia'),
    orden: (['fin', 'fin-lejos', 'plazas', 'publicado', 'nivel'] as const).includes(orden as Orden)
      ? (orden as Orden) : 'fin',
    vista: vista === 'tabla' ? 'tabla' : 'tarjetas',
  };
}
