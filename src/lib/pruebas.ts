import type { Plaza, Sitio, Tablero } from './tipos';

/**
 * Fábricas para las pruebas. Una `Plaza` tiene veintiséis campos y una prueba
 * sobre el buscador solo habla de dos: escribirlos todos en cada caso
 * escondería lo que cada prueba está comprobando de verdad.
 */

export function plaza(parcial: Partial<Plaza> = {}): Plaza {
  return {
    id: 'p1',
    titulo: 'Plaça de prova',
    empleador: 'Ayuntamiento de Prueba',
    donde: { sedeId: null, trabajoId: null, origen: 'desconocido' },
    municipio: null,
    lugar: null,
    ambito: 'municipal',
    tipo: 'convocatoria',
    fijo: false,
    tipoEtiqueta: 'Temporal, contrato temporal',
    contratoOriginal: 'Laboral temporal',
    fin: '2026-10-01',
    inicio: null,
    publicado: '2026-09-01',
    diasRestantes: 15,
    notaPlazo: null,
    plazas: 1,
    nivelCodigo: 'C2',
    nivelEstudios: 'ESO o Formación Profesional de grado medio',
    titulacion: null,
    otrosRequisitos: null,
    seleccion: 'Concurso: se valoran los méritos, sin examen',
    lejos: false,
    enlace: null,
    fichaOficial: null,
    ...parcial,
  };
}

export function sitio(parcial: Partial<Sitio> = {}): Sitio {
  return {
    id: 'badalona',
    nombre: 'Badalona',
    tipo: 'municipio',
    comarca: 'Barcelonès',
    comarcaId: 'comarca-barcelones',
    lat: 41.4502,
    lon: 2.2445,
    ...parcial,
  };
}

/** Los tres municipios que usan las pruebas de distancia, con coordenadas reales. */
export const SITIOS: Record<string, Sitio> = {
  badalona: sitio(),
  mataro: sitio({ id: 'mataro', nombre: 'Mataró', lat: 41.5388, lon: 2.4449, comarca: 'Maresme', comarcaId: 'comarca-maresme' }),
  lleida: sitio({ id: 'lleida', nombre: 'Lleida', lat: 41.6176, lon: 0.6200, comarca: 'Segrià', comarcaId: 'comarca-segria' }),
  'comarca-barcelones': sitio({ id: 'comarca-barcelones', nombre: 'Barcelonès', tipo: 'comarca', comarca: null, comarcaId: null, lat: null, lon: null }),
};

export function tablero(parcial: Partial<Tablero> = {}): Tablero {
  return {
    generado: '2026-09-16T06:54:14.760Z',
    hoy: '2026-09-16',
    abiertas: [],
    pendientes: [],
    cerradas: [],
    sitios: SITIOS,
    resumen: { abiertas: 0, pendientes: 0, cerradas: 0, plazas: 0, fijas: 0, temporales: 0, cierranEn7Dias: 0 },
    errores: [],
    ...parcial,
  };
}
