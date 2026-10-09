import type { Grupo, Plaza, Sitio, Tablero } from './tipos';
import { normaliza, partesEmpleador, tituloLimpio } from './formato';
import { claseContrato } from './filtros';
import { kmEntre } from './cercania';
import { esSoloSede, sitioMostrado } from './localizacion';
import { rutaComarca, rutaMunicipio, tieneFicha } from './rutas';

/**
 * Qué páginas estáticas salen de un tablero y qué enseña cada una además de
 * lo suyo. Todo se calcula en el build, sin JavaScript en el navegador.
 */

export interface ConFicha {
  plaza: Plaza;
  grupo: Grupo;
}

/**
 * Las convocatorias con ficha propia: todas las abiertas y pendientes, y las
 * cerradas de los últimos días (`DIAS_FICHA_CERRADA`). Si un id saliera en dos
 * listas, gana la más viva.
 */
export function conFicha(t: Tablero): ConFicha[] {
  const vistas = new Set<string>();
  const out: ConFicha[] = [];
  for (const grupo of ['abiertas', 'pendientes', 'cerradas'] as const) {
    for (const plaza of t[grupo]) {
      if (vistas.has(plaza.id) || !tieneFicha(plaza, t.hoy)) continue;
      vistas.add(plaza.id);
      out.push({ plaza, grupo });
    }
  }
  return out;
}

/** Por fecha de cierre, las que no tienen fecha al final. */
const porCierre = (a: Plaza, b: Plaza) =>
  (a.fin ?? '9999').localeCompare(b.fin ?? '9999') || a.titulo.localeCompare(b.titulo, 'ca');

/**
 * Dónde se trabaja, solo si el anuncio lo dice. Cuando calla, el tablero
 * enseña la sede del organismo con un asterisco; una página «Empleo público
 * en Barcelona» no puede contar como suya una plaza que puede estar en
 * Terrassa, así que esas no cuentan en ningún sitio.
 */
export function lugarSeguro(p: Plaza): Sitio | null {
  return esSoloSede(p) ? null : sitioMostrado(p);
}

/** El municipio de la ficha, o `null` si solo se sabe la comarca o nada. */
export function municipioDe(p: Plaza): Sitio | null {
  const s = lugarSeguro(p);
  return s && s.tipo === 'municipio' ? s : null;
}

/** La comarca de la ficha: la del municipio, o el propio sitio si es comarca. */
export function comarcaDe(p: Plaza, sitios: Record<string, Sitio>): Sitio | null {
  const s = lugarSeguro(p);
  if (!s) return null;
  if (s.tipo === 'comarca') return s;
  return s.comarcaId ? sitios[s.comarcaId] ?? null : null;
}

/** Otras convocatorias vivas del mismo municipio, las que cierran antes primero. */
export function masEn(p: Plaza, vivas: Plaza[], max = 5): Plaza[] {
  const m = municipioDe(p);
  if (!m) return [];
  return vivas.filter((q) => q.id !== p.id && municipioDe(q)?.id === m.id).sort(porCierre).slice(0, max);
}

/** Abiertas de la misma comarca que cierran en las próximas dos semanas. */
export function cierranProntoEn(
  p: Plaza, abiertas: Plaza[], sitios: Record<string, Sitio>, excluir: Set<string>, max = 5,
): Plaza[] {
  const c = comarcaDe(p, sitios);
  if (!c) return [];
  return abiertas
    .filter((q) => q.id !== p.id && !excluir.has(q.id) && q.diasRestantes !== null && q.diasRestantes >= 0 &&
      q.diasRestantes <= 14 && comarcaDe(q, sitios)?.id === c.id)
    .sort(porCierre)
    .slice(0, max);
}

/** Las palabras que dicen de qué va un puesto: sin artículos ni preposiciones. */
function palabras(p: Plaza): Set<string> {
  return new Set(
    normaliza(tituloLimpio(p)).split(/[^a-z0-9]+/).filter((w) => w.length >= 5),
  );
}

/**
 * Para una cerrada: abiertas parecidas, primero las del mismo oficio (que
 * comparten palabras del título) y cerca, y después las de cerca.
 */
export function parecidas(p: Plaza, abiertas: Plaza[], sitios: Record<string, Sitio>, max = 5): Plaza[] {
  const suyas = palabras(p);
  const comarca = comarcaDe(p, sitios)?.id ?? null;
  const municipio = municipioDe(p)?.id ?? null;
  const nota = (q: Plaza) => {
    let n = 0;
    for (const w of palabras(q)) if (suyas.has(w)) n += 3;
    if (municipio && municipioDe(q)?.id === municipio) n += 2;
    else if (comarca && comarcaDe(q, sitios)?.id === comarca) n += 1;
    return n;
  };
  return abiertas
    .filter((q) => q.id !== p.id)
    .map((q) => ({ q, n: nota(q) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || porCierre(a.q, b.q))
    .slice(0, max)
    .map((x) => x.q);
}

/* ------------------------------------------------------------- listados */

/** Lo vivo de un municipio, una comarca o una categoría. */
export interface Vivas {
  abiertas: Plaza[];
  pendientes: Plaza[];
}

const vacio = (): Vivas => ({ abiertas: [], pendientes: [] });

function agrupa(t: Tablero, claves: (p: Plaza) => string[]): Map<string, Vivas> {
  const out = new Map<string, Vivas>();
  for (const grupo of ['abiertas', 'pendientes'] as const) {
    for (const p of t[grupo]) {
      for (const k of claves(p)) {
        if (!out.has(k)) out.set(k, vacio());
        out.get(k)![grupo].push(p);
      }
    }
  }
  return out;
}

/**
 * Lo vivo de cada sitio: cada convocatoria cuenta donde se trabaja (si se
 * sabe, `lugarSeguro()`) y en su comarca. Un sitio solo tiene página si sale aquí, es decir,
 * si tiene al menos una abierta o pendiente.
 */
const lugaresCalculados = new WeakMap<Tablero, Map<string, Vivas>>();

export function porLugar(t: Tablero): Map<string, Vivas> {
  // Lo piden las dos mil fichas del build: se calcula una vez por tablero.
  const hecho = lugaresCalculados.get(t);
  if (hecho) return hecho;
  const nuevo = agrupa(t, (p) => {
    const s = lugarSeguro(p);
    if (!s) return [];
    return s.comarcaId && s.comarcaId !== s.id ? [s.id, s.comarcaId] : [s.id];
  });
  lugaresCalculados.set(t, nuevo);
  return nuevo;
}

/** La página de un sitio, si la tiene en este build. */
export function rutaDeSitio(t: Tablero, s: Sitio): string | null {
  if (!porLugar(t).has(s.id)) return null;
  return s.tipo === 'comarca' ? rutaComarca(s.id) : rutaMunicipio(s.id);
}

/** Lo vivo por grupo de titulación (`C2`, `A1`…). */
export const porNivel = (t: Tablero) => agrupa(t, (p) => (p.nivelCodigo ? [p.nivelCodigo] : []));

/** Lo vivo por clase de contrato: fija, temporal o bolsa. */
export const porClase = (t: Tablero) => agrupa(t, (p) => [claseContrato(p)]);

/** Las que se enseñan en la página: abiertas por cierre y luego pendientes. */
export function primerasDe(v: Vivas, max = 30): Plaza[] {
  return [...[...v.abiertas].sort(porCierre), ...[...v.pendientes].sort(porCierre)].slice(0, max);
}

export interface Cifras {
  abiertas: number;
  pendientes: number;
  puestos: number;
  fijas: number;
  cierranSemana: number;
}

export function cifrasDe(v: Vivas): Cifras {
  return {
    abiertas: v.abiertas.length,
    pendientes: v.pendientes.length,
    puestos: v.abiertas.reduce((s, p) => s + (p.plazas ?? 0), 0),
    fijas: v.abiertas.filter((p) => p.fijo).length,
    cierranSemana: v.abiertas.filter((p) => p.diasRestantes !== null && p.diasRestantes >= 0 && p.diasRestantes <= 7).length,
  };
}

/** Quién convoca más aquí, por la casa (el ayuntamiento, la Generalitat…). */
export function quienConvoca(v: Vivas, max = 5): { nombre: string; n: number }[] {
  const n = new Map<string, number>();
  for (const p of [...v.abiertas, ...v.pendientes]) {
    const casa = partesEmpleador(p).casa;
    n.set(casa, (n.get(casa) ?? 0) + 1);
  }
  return [...n].map(([nombre, k]) => ({ nombre, n: k }))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es')).slice(0, max);
}

/** Los municipios con página más cercanos a uno, en línea recta. */
export function cercanos(m: Sitio, candidatos: Sitio[], max = 6): { sitio: Sitio; km: number }[] {
  return candidatos
    .filter((s) => s.id !== m.id && s.tipo === 'municipio')
    .map((s) => ({ sitio: s, km: kmEntre(m, s) }))
    .filter((x): x is { sitio: Sitio; km: number } => x.km !== null)
    .sort((a, b) => a.km - b.km || a.sitio.nombre.localeCompare(b.sitio.nombre, 'ca'))
    .slice(0, max);
}

/* ------------------------------------------------- textos de los listados */

const n = (k: number, uno: string, varios: string) => `${k.toLocaleString('es-ES')} ${k === 1 ? uno : varios}`;

/**
 * El párrafo con las cifras de un listado: cuántas hay abiertas, cuántas
 * esperan plazo y cuántas cierran pronto, en `donde` («en Badalona», «para
 * quien tiene la ESO»).
 */
export function fraseCifras(c: Cifras, donde: string): string {
  const abiertas = c.abiertas
    ? `${donde[0].toUpperCase()}${donde.slice(1)} hay ${n(c.abiertas, 'convocatoria de empleo público', 'convocatorias de empleo público')} con el plazo abierto`
    : `${donde[0].toUpperCase()}${donde.slice(1)} no hay ahora mismo ninguna convocatoria con el plazo abierto`;
  const pendientes = c.pendientes
    ? `${c.abiertas ? ' y' : ', pero sí'} ${n(c.pendientes, 'anunciada que aún no ha abierto el plazo', 'anunciadas que aún no han abierto el plazo')}`
    : '';
  const semana = c.cierranSemana ? ` ${n(c.cierranSemana, 'cierra', 'cierran')} en los próximos 7 días.` : '';
  const fijas = c.fijas ? ` ${c.fijas === c.abiertas ? 'Todas son' : n(c.fijas, 'es', 'son')} plaza fija.` : '';
  return `${abiertas}${pendientes}.${semana}${fijas}`;
}

/** «Las convoca sobre todo el Ayuntamiento de Badalona (5) y la Generalitat (2).» */
export function fraseQuien(v: Vivas): string | null {
  const q = quienConvoca(v, 4);
  if (q.length === 0) return null;
  const lista = q.map((x) => `${x.nombre} (${x.n})`);
  const unida = lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
  return `${q.length === 1 ? 'Las convoca' : 'Las convocan sobre todo'}: ${unida}.`;
}

export const FRASE_FICHAS =
  'Cada convocatoria lleva a su ficha, con los requisitos, el plazo exacto y el enlace oficial para apuntarte.';

export const nConvocatorias = (k: number) => n(k, 'convocatoria', 'convocatorias');

/** Las comarcas donde más hay de una categoría, para enlazar sus páginas. */
export function dondeMas(v: Vivas, t: Tablero, max = 9): { nombre: string; ruta: string; nota: string }[] {
  const cuenta = new Map<string, number>();
  for (const p of [...v.abiertas, ...v.pendientes]) {
    const c = comarcaDe(p, t.sitios);
    if (c) cuenta.set(c.id, (cuenta.get(c.id) ?? 0) + 1);
  }
  return [...cuenta]
    .sort((a, b) => b[1] - a[1] || t.sitios[a[0]].nombre.localeCompare(t.sitios[b[0]].nombre, 'ca'))
    .slice(0, max)
    .flatMap(([id, k]) => {
      const ruta = rutaDeSitio(t, t.sitios[id]);
      return ruta ? [{ nombre: t.sitios[id].nombre, ruta, nota: nConvocatorias(k) }] : [];
    });
}

/** Qué se pide en cada grupo, para el texto de su página. */
export const EXPLICA_NIVEL: Record<string, string> = {
  AP: 'Son las agrupaciones profesionales: no piden ningún título. Suelen ser puestos de peón, conserje, ayudante o limpieza.',
  C2: 'Grupo C2: piden la ESO (el graduado escolar) o un ciclo de Formación Profesional de grado medio.',
  C1: 'Grupo C1: piden el bachillerato o un ciclo de Formación Profesional de grado superior.',
  A2: 'Grupo A2: piden una diplomatura o un grado universitario.',
  A: 'Grupo A: piden un título universitario; la convocatoria no dice si es del subgrupo A1 o del A2.',
  A1: 'Grupo A1: piden una licenciatura o un grado universitario, a veces con máster.',
};

/** Qué es cada clase de plaza, para el texto de su página. */
export const EXPLICA_CLASE: Record<string, { titulo: string; texto: string }> = {
  fija: {
    titulo: 'Plazas fijas',
    texto: 'Plazas de funcionario de carrera o de personal laboral indefinido: el puesto es tuyo cuando apruebas. ' +
      'Casi siempre se entra por oposición o por concurso-oposición.',
  },
  temporal: {
    titulo: 'Plazas temporales',
    texto: 'Interinidades y contratos con fecha de fin: cubren una baja, un proyecto o una vacante mientras no se convoca la plaza fija.',
  },
  bolsa: {
    titulo: 'Bolsas de trabajo',
    texto: 'Una bolsa es una lista de espera: te apuntas una vez, te ordenan por méritos o por examen y te llaman ' +
      'cuando hace falta cubrir una baja o un contrato temporal.',
  },
};
