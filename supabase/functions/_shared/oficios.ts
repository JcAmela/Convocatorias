import { normaliza } from './texto.ts';

/**
 * La página está en español y los anuncios llegan en catalán. El buscador
 * comparaba una cosa con la otra tal cual, así que no encontraba nada de lo
 * que su propio marcador de posición proponía: «administrativo» daba cero
 * sobre noventa plazas de *administratiu*, «técnico» cero sobre doscientas
 * cincuenta y seis, «enfermero» cero sobre catorce.
 *
 * Aquí cada palabra que se teclea se abre en las formas con las que puede
 * estar escrita en el anuncio. No es una traducción —para eso haría falta un
 * diccionario entero— sino los tres puentes que cubren casi todo:
 *
 *   1. dos reglas que valen para familias enteras de palabras,
 *   2. una lista corta con los oficios que no se parecen en nada,
 *   3. y la palabra original, que sigue valiendo para quien busca en catalán.
 */

/**
 * Los oficios y términos donde las dos lenguas no se parecen lo suficiente
 * para que una regla los alcance. La clave es la raíz, así que cubre el
 * masculino, el femenino y el plural de una vez: `enferm` vale para
 * enfermero, enfermera, enfermeros y enfermería.
 */
const PUENTE: Record<string, string[]> = {
  administrativ: ['administratiu'],
  servici: ['servei', 'serveis'],
  obra: ['obres'],
  ingles: ['angles'],
  peon: ['peo'],
  interin: ['interi'],
  albanil: ['paleta'],
  enferm: ['inferm'],
  maestr: ['mestre'],
  cociner: ['cuiner'],
  cocina: ['cuina'],
  limpi: ['neteja', 'netej'],
  ingenier: ['enginyer'],
  abogad: ['advocat'],
  letrad: ['lletrat'],
  psicolog: ['psicoleg'],
  geolog: ['geoleg'],
  conserj: ['conserge', 'subaltern'],
  ordenanza: ['subaltern'],
  ayudant: ['ajudant'],
  medic: ['metge', 'medic'],
  profesor: ['professor'],
  fontaner: ['lampista'],
  trabaj: ['treball'],
  tesorer: ['tresorer'],
  contab: ['comptab'],
  archiv: ['arxiu', 'arxiv'],
  escuela: ['escola'],
  guarderia: ['bressol', "llar d'infants"],
  ensen: ['ensenyament'],
  vivienda: ['habitatge'],
  agua: ['aigua', 'aigues'],
  basura: ['residus', 'escombraries'],
  residuo: ['residus'],
  deport: ['esport'],
  juventud: ['joventut'],
  mayores: ['gent gran'],
  seguridad: ['seguretat'],
  sanidad: ['sanitat'],
  salud: ['salut'],
  ciudad: ['ciutat'],
  igualdad: ['igualtat'],
  movilidad: ['mobilitat'],
  universidad: ['universitat'],
  conducir: ['conduir'],
  catalan: ['catala'],
  bolsa: ['borsa'],
  plaza: ['placa', 'places'],
};

/**
 * Las formas con las que una palabra puede aparecer en el anuncio. Se
 * comparan por `includes`, así que valen raíces: «tecnic» encuentra
 * *tècnic*, *tècnica* y *tècnics*.
 */
export function variantes(palabra: string): string[] {
  const formas = new Set<string>([palabra]);

  for (const clave in PUENTE) {
    if (palabra.startsWith(clave)) for (const forma of PUENTE[clave]) formas.add(forma);
  }

  // -ción → -ció, que es media administración pública: educación, protección,
  // atención, gestión, formación, oposición…
  if (palabra.length >= 6 && palabra.endsWith('cion')) formas.add(palabra.slice(0, -1));
  if (palabra.length >= 8 && palabra.endsWith('ciones')) formas.add(`${palabra.slice(0, -5)}ions`);

  // El plural. El español añade -es donde el catalán cierra la vocal: sociales
  // → socials, obras → obres, actividades → activitats. Era el hueco más grande
  // del buscador: «sociales» daba cero sobre 118 anuncios que dicen *socials*.
  if (palabra.length >= 5 && palabra.endsWith('es')) {
    formas.add(`${palabra.slice(0, -2)}s`);
    formas.add(palabra.slice(0, -2));
  }
  if (palabra.length >= 5 && palabra.endsWith('as')) formas.add(`${palabra.slice(0, -2)}es`);

  // -dad → -tat, que en catalán es una familia entera: discapacidad →
  // discapacitat, actividad → activitat, sostenibilidad → sostenibilitat.
  if (palabra.length >= 6 && palabra.endsWith('dad')) formas.add(`${palabra.slice(0, -3)}tat`);
  if (palabra.length >= 8 && palabra.endsWith('dades')) formas.add(`${palabra.slice(0, -5)}tats`);

  // Y la vocal final, que el catalán se come: técnico → tècnic, secretario →
  // secretari, arquitecto → arquitecte, concurso → concurs. Solo en palabras
  // largas: en las cortas quitar una letra abre demasiado la mano.
  if (palabra.length >= 5 && /[aeiou]$/.test(palabra)) formas.add(palabra.slice(0, -1));

  /**
   * -izar / -ización son -itzar / -ització. Esta va la última y sobre las
   * formas ya derivadas, no sobre la palabra tecleada, porque es la única que
   * cambia el medio de la palabra y no el final: tiene que encadenarse con las
   * de arriba. Aplicada solo al original, «organización» daba *organitzacion*
   * y *organizació* —dos palabras que no existen— y nunca *organització*, que
   * es la que está escrita en los catorce anuncios de esa familia.
   */
  for (const forma of [...formas]) {
    if (forma.includes('iza')) formas.add(forma.replace(/iza/g, 'itza'));
  }

  return [...formas];
}

/**
 * Parte la consulta en palabras y abre cada una en sus variantes. Se guarda
 * la última, porque el filtrado pregunta lo mismo una vez por plaza y por
 * criterio, y la respuesta solo cambia cuando se teclea.
 *
 * El centinela de «todavía no he calculado nada» era un carácter de control
 * NUL escrito dentro del código. Funcionaba —ninguna consulta puede valer
 * eso—, pero metía un byte nulo en el fichero y con él git daba este módulo
 * por binario: el corazón del buscador se quedaba sin diff y sin blame en
 * cada cambio. `null` no es una cadena, así que sigue sin poder coincidir
 * con nada de lo que se teclee, y el fichero vuelve a leerse como texto.
 */
let ultima: { consulta: string | null; terminos: string[][] } = { consulta: null, terminos: [] };

export function terminosDe(consulta: string): string[][] {
  if (consulta !== ultima.consulta) {
    ultima = {
      consulta,
      terminos: normaliza(consulta).split(/\s+/).filter(Boolean).map(variantes),
    };
  }
  return ultima.terminos;
}
