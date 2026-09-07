import type { Plaza } from './tipos';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa'];

/**
 * Las fechas llegan como `YYYY-MM-DD` (a veces con hora). Se parsean a mano
 * porque `new Date('2026-09-07')` es UTC y en España puede retroceder un día.
 */
export function parseFecha(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function fechaLarga(iso: string | null): string {
  const f = parseFecha(iso);
  return f ? `${f.getDate()} de ${MESES[f.getMonth()]} de ${f.getFullYear()}` : '';
}

export function fechaCorta(iso: string | null): string {
  const f = parseFecha(iso);
  return f ? `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}` : '';
}

export function diaSemana(iso: string | null): string {
  const f = parseFecha(iso);
  return f ? DIAS_CORTOS[f.getDay()] : '';
}

/** Fin de semana: los plazos que caen aquí suelen correrse al lunes. */
export function esFinDeSemana(iso: string | null): boolean {
  const f = parseFecha(iso);
  if (!f) return false;
  return f.getDay() === 0 || f.getDay() === 6;
}

export function claveDia(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

export type TonoUrgencia = 'critica' | 'seria' | 'aviso' | 'calma' | 'sinfecha';

export interface Urgencia {
  tono: TonoUrgencia;
  etiqueta: string;
  /** Para agrupar en el filtro de "tiempo que queda". */
  cubo: 'hoy' | '3dias' | 'semana' | 'mes' | 'lejano' | 'sinfecha';
}

export function urgencia(dias: number | null): Urgencia {
  if (dias === null || dias === undefined) {
    return { tono: 'sinfecha', etiqueta: 'Sin plazo aún', cubo: 'sinfecha' };
  }
  if (dias <= 0) return { tono: 'critica', etiqueta: 'Último día', cubo: 'hoy' };
  if (dias === 1) return { tono: 'critica', etiqueta: 'Cierra mañana', cubo: '3dias' };
  if (dias <= 3) return { tono: 'critica', etiqueta: `Quedan ${dias} días`, cubo: '3dias' };
  if (dias <= 7) return { tono: 'seria', etiqueta: `Quedan ${dias} días`, cubo: 'semana' };
  if (dias <= 30) return { tono: 'aviso', etiqueta: `Quedan ${dias} días`, cubo: 'mes' };
  return { tono: 'calma', etiqueta: `Quedan ${dias} días`, cubo: 'lejano' };
}

/**
 * En las plazas de la Generalitat `municipio` repite el nombre del organismo,
 * así que solo sirve como lugar cuando aporta algo distinto.
 */
export function lugarDe(p: Plaza): string | null {
  if (p.lugar) return p.lugar;
  if (p.municipio && p.municipio !== p.empleador) return p.municipio;
  return null;
}

/** "Generalitat · Departament de Cultura" → { casa, organismo }. */
export function partesEmpleador(p: Plaza): { casa: string; organismo: string | null } {
  const trozos = p.empleador.split('·').map((t) => t.trim());
  if (trozos.length < 2) return { casa: p.empleador, organismo: null };
  return { casa: trozos[0], organismo: trozos.slice(1).join(' · ') };
}

export const ETIQUETA_AMBITO: Record<string, string> = {
  municipal: 'Ayuntamiento',
  generalitat: 'Generalitat',
  diputacio: 'Diputación',
};

export const ORDEN_NIVEL: Record<string, number> = {
  AP: 0, C2: 1, C1: 2, A2: 3, A: 4, A1: 5,
};

export const ETIQUETA_NIVEL: Record<string, string> = {
  AP: 'Sin titulación mínima',
  C2: 'ESO o Formación Profesional de grado medio',
  C1: 'Bachillerato o Formación Profesional de grado superior',
  A2: 'Universitario (diplomatura o grado)',
  A: 'Universitario (grado)',
  A1: 'Universitario (licenciatura o grado)',
};

/** Versión corta para las píldoras de filtro, donde no cabe la frase entera. */
export const NIVEL_CORTO: Record<string, string> = {
  AP: 'Sin titulación',
  C2: 'ESO / grado medio',
  C1: 'Bachillerato / grado superior',
  A2: 'Diplomatura',
  A: 'Grado',
  A1: 'Licenciatura o grado',
};

export function plural(n: number, singular: string, plural_: string): string {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? singular : plural_}`;
}

/** Quita acentos y pasa a minúsculas para que el buscador sea indulgente. */
export function normaliza(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Los títulos vienen en catalán y empiezan por el número de plazas
 * ("3 places de Tècnic…"), que ya mostramos aparte.
 */
export function tituloLimpio(p: Plaza): string {
  return p.titulo
    .replace(/^\s*\d+\s+(places?|placa|plaça|places)\s+(de\s+la\s+|de\s+l'|del\s+|de\s+|d')?/i, '')
    .replace(/^\s*🗓️\s*/, '')
    .trim() || p.titulo;
}

/** Marca las convocatorias reanunciadas porque por fin se abrió el plazo. */
export function esActualizacion(p: Plaza): boolean {
  return p.titulo.includes('PLAZO YA ABIERTO');
}
