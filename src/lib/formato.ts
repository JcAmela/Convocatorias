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
  cubo: 'cerrada' | 'hoy' | '3dias' | 'semana' | 'mes' | 'lejano' | 'sinfecha';
}

export function urgencia(dias: number | null): Urgencia {
  if (dias === null || dias === undefined) {
    return { tono: 'sinfecha', etiqueta: 'Sin plazo aún', cubo: 'sinfecha' };
  }
  // Lo ya vencido no puede seguir gritando en rojo "Último día": en la pestaña
  // de cerradas eso teñía de urgencia ciento y pico plazas a las que ya no
  // llegas.
  if (dias < 0) {
    const pasados = -dias;
    return {
      tono: 'calma',
      etiqueta: pasados === 1 ? 'Cerró ayer' : `Cerró hace ${pasados} días`,
      cubo: 'cerrada',
    };
  }
  if (dias === 0) return { tono: 'critica', etiqueta: 'Último día', cubo: 'hoy' };
  if (dias === 1) return { tono: 'critica', etiqueta: 'Cierra mañana', cubo: '3dias' };
  if (dias <= 3) return { tono: 'critica', etiqueta: `Quedan ${dias} días`, cubo: '3dias' };
  if (dias <= 7) return { tono: 'seria', etiqueta: `Quedan ${dias} días`, cubo: 'semana' };
  if (dias <= 30) return { tono: 'aviso', etiqueta: `Quedan ${dias} días`, cubo: 'mes' };
  return { tono: 'calma', etiqueta: `Quedan ${dias} días`, cubo: 'lejano' };
}

/** "Generalitat · Departament de Cultura" → { casa, organismo }. */
export function partesEmpleador(p: Plaza): { casa: string; organismo: string | null } {
  const trozos = p.empleador.split('·').map((t) => t.trim());
  if (trozos.length < 2) return { casa: p.empleador, organismo: null };
  return { casa: trozos[0], organismo: trozos.slice(1).join(' · ') };
}

export const ETIQUETA_AMBITO: Record<string, string> = {
  municipal: 'Ayuntamiento',
  comarcal: 'Consejo comarcal',
  generalitat: 'Generalitat',
  diputacio: 'Diputación',
};

/**
 * Los cubos del filtro «Tiempo que queda», en el orden en que se ofrecen. Vive
 * aquí y no en la barra de filtros porque el tablero necesita los mismos
 * rótulos para las fichas de «quitar este filtro».
 */
export const URGENCIAS: { valor: string; texto: string }[] = [
  { valor: 'hoy', texto: 'Cierra hoy' },
  { valor: '3dias', texto: 'En 3 días o menos' },
  { valor: 'semana', texto: 'Esta semana' },
  { valor: 'mes', texto: 'Este mes' },
  { valor: 'lejano', texto: 'Más de un mes' },
];

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

/**
 * El origen traduce casi todo al español, pero se le escapan los avisos de
 * plazo y alguna forma de selección. Acababan dentro de un recuadro redactado
 * en español —«Ojo con el plazo: Obert permanentment»— y justo en la frase
 * que más importa entender, porque dice si la fecha es firme o no.
 *
 * Once frases distintas cubren hoy los cincuenta avisos que llegan. Lo que no
 * esté aquí se enseña tal cual y marcado como catalán, que es honesto: mejor
 * la frase original que una traducción inventada.
 */
const DEL_CATALAN: Record<string, string> = {
  'obert permanentment': 'Abierto de forma permanente',
  "data orientativa; si teniu algun dubte, consulteu l'ens convocant":
    'Fecha orientativa; si tienes dudas, pregunta al organismo que convoca',
  "termini segons el web de l'ens convocant":
    'El plazo es el que diga la web del organismo que convoca',
  'obert fins a trobar la persona candidata adequada':
    'Abierto hasta encontrar a la persona adecuada',
  'obert fins inscripcio de nombre de candidats suficient':
    'Abierto hasta reunir suficientes candidaturas',
  'sense especificar': 'Sin especificar',
  'lliure designacio': 'Libre designación',
};

/** Las que llevan una fecha o un número dentro y no caben en una tabla. */
const REGLAS: { patron: RegExp; plantilla: string }[] = [
  {
    patron: /^termini anterior:\s*(.+)$/,
    plantilla: 'Plazo anterior: $1',
  },
  {
    patron: /^el termini s'obrira l'endema de la publicacio de la convocatoria al (dogc|boe),? i sera de (\d+) dies habils$/,
    plantilla: 'El plazo se abrirá al día siguiente de publicarse la convocatoria en el $1 y durará $2 días hábiles',
  },
  {
    patron: /^el termini esta obert i finalitzara passats (\d+) dies habils des de l'endema de la publicacio de la convocatoria al (dogc|boe)$/,
    plantilla: 'El plazo está abierto y terminará $1 días hábiles después de publicarse la convocatoria en el $2',
  },
];

function traduceTrozo(trozo: string): string | null {
  const clave = normaliza(trozo).replace(/[’´`]/g, "'").trim();
  if (DEL_CATALAN[clave]) return DEL_CATALAN[clave];
  for (const { patron, plantilla } of REGLAS) {
    const encaje = patron.exec(clave);
    if (encaje) {
      return plantilla.replace(/\$(\d)/g, (_, i) => {
        const valor = encaje[Number(i)] ?? '';
        return valor === 'dogc' || valor === 'boe' ? valor.toUpperCase() : valor;
      });
    }
  }
  return null;
}

/**
 * Pasa al español una frase del origen. Los avisos compuestos llegan unidos
 * por " / ", así que se traducen por partes.
 *
 * `traducida` dice si todas las partes estaban en la tabla. Solo sirve para
 * los avisos de plazo, que el origen nunca traduce y por tanto siguen en
 * catalán cuando aquí no se reconocen; en los demás campos, lo que no está en
 * la tabla suele ser español que no hacía falta tocar.
 */
export function enEspanol(frase: string): { texto: string; traducida: boolean } {
  // Se parte por la barra con espacios a los lados, que es como el origen une
  // dos avisos. Por la barra a secas no: dentro hay fechas (17/08/2026).
  const trozos = frase.split(/\s+\/\s+/).map((t) => t.trim()).filter(Boolean);
  let traducida = true;
  const partes = trozos.map((trozo) => {
    const t = traduceTrozo(trozo);
    if (t === null) traducida = false;
    return t ?? trozo;
  });
  return { texto: partes.join('. '), traducida };
}

/** Quita acentos y pasa a minúsculas para que el buscador sea indulgente. */
export function normaliza(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Los títulos vienen en catalán y empiezan por el número de plazas
 * ("3 places de Tècnic…"), que ya mostramos aparte.
 *
 * También se les quita el paréntesis final cuando es de donde el origen sacó
 * el lugar de trabajo: la columna «Dónde» ya lo dice, y repetirlo alarga el
 * título justo donde menos sitio hay. Solo se toca si coincide exactamente,
 * así que "(mecànic)" o "(convocatòria extraordinària)" se quedan.
 */
export function tituloLimpio(p: Plaza): string {
  let bruto = p.titulo;
  if (p.lugar) {
    const cola = /\s*\(([^()]*)\)\s*$/.exec(bruto);
    // Se comparan las dos formas normalizadas: el paréntesis lo escribió quien
    // redactó el anuncio y el nombre del sitio viene del callejero, así que
    // pueden diferir en un acento o una mayúscula.
    if (cola && normaliza(cola[1].trim()) === normaliza(p.lugar.trim())) {
      bruto = bruto.slice(0, cola.index);
    }
  }
  return bruto
    .replace(/^\s*\d+\s+(places?|placa|plaça|places)\s+(de\s+la\s+|de\s+l'|del\s+|de\s+|d')?/i, '')
    .replace(/^\s*🗓️\s*/, '')
    .trim() || p.titulo;
}

/** Marca las convocatorias reanunciadas porque por fin se abrió el plazo. */
export function esActualizacion(p: Plaza): boolean {
  return p.titulo.includes('PLAZO YA ABIERTO');
}
