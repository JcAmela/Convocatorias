import type { Plaza, Sitio } from './tipos';
import { enEspanol, esFinDeSemana, fechaLarga, partesEmpleador } from './formato';
import { esSoloSede, sitio, sitioSede, sitioTrabajo } from './localizacion';
import { kmDesde } from './cercania';

/**
 * Lo que dice la ficha de una convocatoria, como datos y no como HTML.
 *
 * Lo pintan tres sitios que tienen que decir exactamente lo mismo: la ficha
 * que se abre encima del tablero (`Detalle.tsx`), la página estática de cada
 * convocatoria y la descripción del JobPosting (`jsonld.ts`), que Google exige
 * que coincida con lo que se ve.
 */

export interface Fila {
  termino: string;
  texto: string;
  /** Una segunda línea, más pequeña: la explicación de una bolsa, la distancia. */
  detalle?: string;
  /** El texto va en catalán: el lector de pantalla lo pronuncia como tal. */
  catalan?: boolean;
  /** El sitio del que habla la fila, para enlazar su página. */
  lugar?: Sitio;
}

export interface Aviso {
  tipo: 'plazo' | 'finde';
  /** En negrita delante: «Ojo con el plazo:». */
  titulo?: string;
  texto: string;
  /** Solo `texto` puede ir en catalán; lo de alrededor es nuestro. */
  catalan?: boolean;
  cola?: string;
}

export interface Ficha {
  casa: string;
  organismo: string | null;
  avisos: Aviso[];
  filas: Fila[];
}

const NO_DICE_NADA = 'Vegeu les bases';

export function fichaDe(p: Plaza, desde: string | null = null): Ficha {
  const { casa, organismo } = partesEmpleador(p);
  const trabajo = sitioTrabajo(p);
  const sede = sitioSede(p);
  const soloSede = esSoloSede(p);
  const km = kmDesde(p, desde);
  const referencia = sitio(desde);
  const nota = p.notaPlazo ? enEspanol(p.notaPlazo) : null;
  const seleccion = p.seleccion ? enEspanol(p.seleccion) : null;

  const avisos: Aviso[] = [];
  if (nota) {
    avisos.push({
      tipo: 'plazo',
      titulo: 'Ojo con el plazo:',
      texto: nota.texto,
      catalan: !nota.traducida,
      cola: '. Confirma la fecha exacta en el enlace oficial.',
    });
  }
  if (esFinDeSemana(p.fin)) {
    avisos.push({
      tipo: 'finde',
      texto: 'El plazo termina en fin de semana, así que es probable que se corra al lunes siguiente. ' +
        'Aun así, no lo dejes para el final.',
    });
  }

  const filas: Fila[] = [];
  filas.push({
    termino: 'Cuándo puedes apuntarte',
    texto: p.fin
      ? p.inicio ? `Del ${fechaLarga(p.inicio)} al ${fechaLarga(p.fin)}` : `Hasta el ${fechaLarga(p.fin)}`
      : 'Todavía no han publicado el plazo. La convocatoria ya está anunciada, pero aún no se pueden presentar solicitudes.',
  });
  filas.push({
    termino: 'Qué tipo de plaza es',
    texto: p.tipoEtiqueta,
    detalle: p.tipo === 'bolsa'
      ? 'Una bolsa es una lista de espera: te apuntas una vez y te llaman cuando hace falta cubrir contratos temporales o sustituciones.'
      : undefined,
  });
  if (p.plazas) {
    filas.push({ termino: 'Cuántos puestos', texto: `${p.plazas} ${p.plazas === 1 ? 'puesto convocado' : 'puestos convocados'}` });
  }
  // Dos cosas distintas que antes iban revueltas. Cuando el anuncio dice dónde
  // se trabaja, eso es lo que manda; cuando calla, se enseña la sede del
  // organismo diciendo que es la sede.
  if (trabajo && !soloSede) {
    filas.push({
      termino: 'Dónde se trabaja',
      texto: trabajo.comarca && trabajo.comarca !== trabajo.nombre ? `${trabajo.nombre} · ${trabajo.comarca}` : trabajo.nombre,
      detalle: km !== null && referencia ? `A ${km} km de ${referencia.nombre}, en línea recta.` : undefined,
      lugar: trabajo,
    });
  }
  if (soloSede && sede) {
    filas.push({
      termino: 'Dónde se trabaja',
      texto: 'No consta en el anuncio.',
      detalle: `El organismo tiene la sede en ${sede.nombre}, pero eso no dice dónde estaría el puesto. ` +
        'Suele pasar en las bolsas de trabajo, que cubren varios centros a la vez. Compruébalo en la convocatoria oficial.',
    });
  }
  if (sede && trabajo && !soloSede && sede.id !== trabajo.id) {
    filas.push({
      termino: 'Dónde está el organismo',
      texto: sede.comarca && sede.comarca !== sede.nombre ? `${sede.nombre} · ${sede.comarca}` : sede.nombre,
      lugar: sede,
    });
  }
  if (p.nivelEstudios) filas.push({ termino: 'Estudios que piden', texto: p.nivelEstudios });
  if (p.titulacion && p.titulacion !== NO_DICE_NADA) {
    filas.push({ termino: 'Titulación concreta', texto: p.titulacion, catalan: true });
  }
  if (p.otrosRequisitos) filas.push({ termino: 'Además necesitas', texto: p.otrosRequisitos, catalan: true });
  // La forma de selección sí la traduce el origen salvo alguna suelta, así que
  // no se marca idioma: lo que no está en la tabla ya viene en español.
  if (seleccion) filas.push({ termino: 'Cómo se entra', texto: seleccion.texto });
  if (p.publicado) filas.push({ termino: 'Se publicó el', texto: fechaLarga(p.publicado) });

  return { casa, organismo, avisos, filas };
}

export const AVISO_OFICIAL =
  'Manda siempre lo que diga la convocatoria oficial. Esta ficha resume lo que publica CIDO ' +
  'y puede quedarse corta o desactualizada.';

/** El aviso entero, como frase: para la descripción del JobPosting. */
export const textoAviso = (a: Aviso) => `${a.titulo ? `${a.titulo} ` : ''}${a.texto}${a.cola ?? ''}`;
