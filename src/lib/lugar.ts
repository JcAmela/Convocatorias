import type { Plaza } from './tipos';
import { normaliza } from './formato';

/**
 * El lugar de trabajo es el dato más sucio que llega de la API, porque el
 * origen lo saca del último paréntesis del título. De ahí salen tres averías
 * que se ven en la interfaz:
 *
 *   - "als Serveis Territorials a Girona" no lleva paréntesis, así que la
 *     plaza se queda sin lugar y la columna «Dónde» pinta un guion aunque el
 *     título diga Girona con todas las letras;
 *   - hay paréntesis que no son lugares, sino códigos internos de la
 *     convocatoria: (NAJ), (OFI), (CUI), (FIS)…;
 *   - y hay erratas de quien tecleó el anuncio: "Barccelona", "LLeida",
 *     "L'Hospitalet del Llobregat".
 *
 * Este módulo lo limpia en el cliente: no podemos arreglar el origen, pero sí
 * dejar de repetir sus fallos. El resultado es un catálogo de lugares con un
 * identificador estable por sitio, que es lo que hace posible filtrar por
 * ciudad.
 */

export interface Lugar {
  /** Identificador estable, apto para la URL: `hospitalet-llobregat`. */
  id: string;
  /** Nombre para leer, la mejor de las variantes que llegaron. */
  nombre: string;
  /** Cuántas plazas lo mencionan, para ordenar el desplegable. */
  n: number;
}

/* --------------------------------------------------------------- limpieza */

/** Artículos y preposiciones: sobran para comparar, "de" y "del" son lo mismo. */
const PARTICULAS = new Set([
  'el', 'la', 'els', 'les', 'lo', 'los', 'de', 'del', 'dels', 'da', 'd', 'l', 'i', 'a', 'al', 'als',
]);

/**
 * Clave con la que se agrupan las variantes de un mismo sitio. Quita acentos,
 * mayúsculas, apóstrofos y partículas, así que "L'Hospitalet de Llobregat" y
 * "L'Hospitalet del Llobregat" acaban siendo la misma cosa.
 */
export function claveLugar(nombre: string): string {
  return normaliza(nombre)
    .replace(/[’´`]/g, "'")
    .replace(/'/g, "' ")
    .split(/[\s.,]+/)
    .map((palabra) => palabra.replace(/'$/, ''))
    .filter((palabra) => palabra && !PARTICULAS.has(palabra))
    .join(' ');
}

function idDe(clave: string): string {
  return clave.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "BST", "NAJ", "FDJ": siglas del organismo coladas donde va el lugar. */
function esSigla(t: string): boolean {
  return /^[A-ZÀ-ÜÇ]{2,5}$/.test(t);
}

/**
 * Un valor crudo puede traer varios sitios ("Ribera de Cardós - Lleida") o
 * venir con la sigla del servicio delante ("BST - Girona"). Se parte por los
 * separadores seguros y se tira lo que no puede ser un topónimo.
 */
function trocea(crudo: string): string[] {
  return crudo
    .replace(/^[A-ZÀ-ÜÇ]{2,5}\s*[-–—]\s*/, '')
    .split(/\s*[,;/]\s*|\s+[-–—]\s+/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 3 && !esSigla(t) && !/^\d+$/.test(t));
}

/**
 * Los organismos territoriales llevan el sitio en el nombre y siempre al
 * final del título: "…als Serveis Territorials a Girona". Se busca solo en la
 * cola para no confundir el lugar de trabajo con el del centro que se cita de
 * pasada en mitad de la frase.
 */
const ORGANO_TERRITORIAL =
  'Serveis Territorials|Servei Territorial|Oficina Territorial|Delegació Territorial|' +
  'Demarcació Territorial|Direcció Territorial|Gerència Territorial';

const COLA_TERRITORIAL = new RegExp(
  '(?:' + ORGANO_TERRITORIAL + ')' +
    '(?:\\s+(?:als|a la|a l\'|al|a|dels|de la|de l\'|del|de|d\'))?' +
    '\\s+([^,;()]{3,40})\\s*$',
  'i',
);

function delTitulo(titulo: string): string[] {
  const sinParentesis = titulo.replace(/\s*\([^()]*\)\s*$/, '').trim();
  const hallazgo = COLA_TERRITORIAL.exec(sinParentesis);
  if (!hallazgo) return [];
  const candidato = hallazgo[1].trim();
  if (/\d/.test(candidato) || candidato.split(/\s+/).length > 5) return [];
  return trocea(candidato);
}

/**
 * De dónde se saca el lugar, por orden: el campo propio, el municipio cuando
 * aporta algo distinto del organismo y, si no hay nada, el título.
 */
function crudosDe(p: Plaza): string[] {
  const directos: string[] = [];
  if (p.lugar) directos.push(...trocea(p.lugar));
  if (p.municipio && p.municipio !== p.empleador) directos.push(...trocea(p.municipio));
  return directos.length ? directos : delTitulo(p.titulo);
}

/* ---------------------------------------------------------------- erratas */

/**
 * ¿Se diferencian en un solo carácter? Se compara mordiendo por los dos
 * extremos, que para cadenas cortas sale más barato que una matriz de
 * Levenshtein y basta para lo que hay que cazar.
 *
 * A partir de seis letras, porque en nombres cortos un carácter ya distingue
 * dos pueblos de verdad (Salt y Salou, Olot y Olost).
 */
function casiIgual(a: string, b: string): boolean {
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  if (larga.length - corta.length > 1 || larga.length < 6) return false;
  let i = 0;
  while (i < corta.length && corta[i] === larga[i]) i++;
  let j = 0;
  while (j < corta.length - i && corta[corta.length - 1 - j] === larga[larga.length - 1 - j]) j++;
  return i + j >= corta.length;
}

/* --------------------------------------------------------------- catálogo */

let catalogo: Lugar[] = [];
let porClave = new Map<string, Lugar>();
let cache = new WeakMap<Plaza, Lugar[]>();

/**
 * Recorre todas las plazas y monta el catálogo de lugares. Hay que llamarlo
 * antes de pintar: `lugaresDe` se sirve luego de la caché.
 *
 * Las erratas se corrigen con los propios datos en vez de con una lista de
 * municipios escrita a mano, que envejecería mal: una grafía que aparece una
 * o dos veces y se parece en un carácter a otra mucho más frecuente es una
 * errata, no un pueblo. Así "Barccelona" (1) cae en "Barcelona" (172) sin que
 * nadie tenga que mantener nada.
 */
export function preparaLugares(plazas: Plaza[]): Lugar[] {
  const variantes = new Map<string, Map<string, number>>();
  const crudos = new Map<Plaza, string[]>();

  for (const p of plazas) {
    const lista = crudosDe(p);
    crudos.set(p, lista);
    for (const nombre of lista) {
      const clave = claveLugar(nombre);
      if (!clave) continue;
      const cuenta = variantes.get(clave) ?? new Map<string, number>();
      cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
      variantes.set(clave, cuenta);
    }
  }

  const frecuencia = new Map<string, number>();
  for (const [clave, cuenta] of variantes) {
    frecuencia.set(clave, [...cuenta.values()].reduce((s, n) => s + n, 0));
  }

  const fusion = new Map<string, string>();
  for (const [clave, n] of frecuencia) {
    if (n > 2) continue;
    let destino: string | null = null;
    let mejor = 0;
    for (const [otra, m] of frecuencia) {
      if (otra === clave || m < n * 3 || m <= mejor) continue;
      if (casiIgual(clave, otra)) { destino = otra; mejor = m; }
    }
    if (destino) fusion.set(clave, destino);
  }
  const resuelve = (clave: string) => fusion.get(clave) ?? clave;

  // Las variantes fundidas se suman a su destino antes de elegir cómo se escribe.
  const finales = new Map<string, Map<string, number>>();
  for (const [clave, cuenta] of variantes) {
    const destino = resuelve(clave);
    const acumulado = finales.get(destino) ?? new Map<string, number>();
    for (const [nombre, n] of cuenta) acumulado.set(nombre, (acumulado.get(nombre) ?? 0) + n);
    finales.set(destino, acumulado);
  }

  porClave = new Map();
  catalogo = [];
  for (const [clave, cuenta] of finales) {
    // La grafía buena es la que más se repite. A igualdad gana la que tiene
    // más palabras, que es la que conserva el artículo ("El Vendrell" y no
    // "Vendrell"), y entre esas la más corta, que es la que no arrastra el
    // "del" de más ni la letra doblada.
    const palabras = (t: string) => t.split(/\s+/).length;
    const nombre = [...cuenta.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        palabras(b[0]) - palabras(a[0]) ||
        a[0].length - b[0].length ||
        a[0].localeCompare(b[0], 'es'),
    )[0][0];
    const lugar: Lugar = {
      id: idDe(clave),
      nombre,
      n: [...cuenta.values()].reduce((s, n) => s + n, 0),
    };
    porClave.set(clave, lugar);
    catalogo.push(lugar);
  }
  catalogo.sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));

  cache = new WeakMap();
  for (const [p, lista] of crudos) {
    const vistos = new Set<string>();
    const suyos: Lugar[] = [];
    for (const nombre of lista) {
      const lugar = porClave.get(resuelve(claveLugar(nombre)));
      if (lugar && !vistos.has(lugar.id)) { vistos.add(lugar.id); suyos.push(lugar); }
    }
    cache.set(p, suyos);
  }

  return catalogo;
}

export function catalogoLugares(): Lugar[] {
  return catalogo;
}

/**
 * Los lugares de una plaza. Si nadie ha preparado el catálogo todavía —una
 * tarjeta suelta, una prueba— se limpia al vuelo, sin corregir erratas: para
 * eso hace falta ver el conjunto.
 */
export function lugaresDe(p: Plaza): Lugar[] {
  const guardado = cache.get(p);
  if (guardado) return guardado;
  const vistos = new Set<string>();
  const suyos: Lugar[] = [];
  for (const nombre of crudosDe(p)) {
    const clave = claveLugar(nombre);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    suyos.push(porClave.get(clave) ?? { id: idDe(clave), nombre, n: 1 });
  }
  cache.set(p, suyos);
  return suyos;
}

/** El que se enseña cuando solo cabe uno: la fila de la tabla, la tarjeta. */
export function lugarPrincipal(p: Plaza): string | null {
  return lugaresDe(p)[0]?.nombre ?? null;
}

/** Todos, separados por comas, para el detalle y para el buscador. */
export function lugaresTexto(p: Plaza): string {
  return lugaresDe(p).map((l) => l.nombre).join(', ');
}

export function idsLugar(p: Plaza): string[] {
  return lugaresDe(p).map((l) => l.id);
}

/**
 * Una de cada cinco plazas no dice dónde se trabaja, y no por un fallo
 * nuestro: ni el título ni el organismo lo cuentan. Tienen su propia casilla
 * en el filtro para que se puedan pedir a propósito y, sobre todo, para que
 * quede claro que existen en vez de desaparecer sin explicación en cuanto se
 * marca un municipio.
 */
export const SIN_LUGAR = 'sin-indicar';

/** Los identificadores con los que filtra y cuenta el menú «Dónde». */
export function idsFiltroLugar(p: Plaza): string[] {
  const ids = idsLugar(p);
  return ids.length ? ids : [SIN_LUGAR];
}
