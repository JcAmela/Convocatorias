/**
 * Tipos de la API `convoca-board`.
 *
 * La función de Supabase ya hace el trabajo sucio: unifica CIDO y los portales
 * Convoca, traduce al español y clasifica cada plaza. Aquí solo describimos lo
 * que llega para que TypeScript nos avise si el contrato cambia.
 */

/** Quién convoca la plaza. */
export type Ambito = 'municipal' | 'generalitat' | 'diputacio' | (string & {});

/** Convocatoria normal o bolsa de trabajo (lista de espera). */
export type TipoPlaza = 'convocatoria' | 'bolsa' | (string & {});

/** Nivel de estudios exigido, en la nomenclatura de la función pública. */
export type NivelCodigo = 'A1' | 'A2' | 'A' | 'C1' | 'C2' | 'AP' | (string & {});

/** Un municipio o una comarca del callejero, resuelto por el servidor. */
export interface Sitio {
  /** Apto para la URL: `hospitalet-llobregat`, `comarca-baix-llobregat`. */
  id: string;
  nombre: string;
  tipo: 'municipio' | 'comarca';
  comarca: string | null;
  comarcaId: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Cuánto hay que fiarse de `trabajoId`. Es la diferencia entre saber dónde se
 * trabaja y saber solo dónde tiene la sede el organismo, que en la Generalitat
 * no es lo mismo: 119 de 463 convocatorias trabajan fuera de su sede.
 */
export type OrigenLugar = 'sede' | 'portal' | 'titulo' | 'desconocido';

export interface Localizacion {
  /** Municipio del organismo. Referencia a `Tablero.sitios`. */
  sedeId: string | null;
  /** Dónde se trabaja. `null` cuando el anuncio no lo dice. */
  trabajoId: string | null;
  origen: OrigenLugar;
}

export interface Plaza {
  id: string;
  titulo: string;
  empleador: string;
  /** Dónde está el organismo y dónde se trabaja. Falta en las filas viejas del
   * archivo, y entonces `sanea()` lo reconstruye a partir de `lugar`. */
  donde: Localizacion;
  /** @deprecated Usa `donde.sedeId`. Se conserva por el archivo y por la web ya desplegada. */
  municipio: string | null;
  /** @deprecated Usa `donde.trabajoId`. */
  lugar: string | null;
  ambito: Ambito;
  tipo: TipoPlaza;
  /** true = plaza fija (funcionario de carrera o laboral indefinido). */
  fijo: boolean;
  /** Etiqueta ya redactada en español, p. ej. "Temporal, funcionario interino". */
  tipoEtiqueta: string;
  /** Valor original del origen: "Funcionari interí", "Laboral", … */
  contratoOriginal: string | null;
  /** Fin del plazo de solicitud, `YYYY-MM-DD`. `null` si aún no se ha abierto. */
  fin: string | null;
  /** Inicio del plazo de solicitud, `YYYY-MM-DD`. */
  inicio: string | null;
  /** Fecha de publicación del anuncio, `YYYY-MM-DD`. */
  publicado: string | null;
  /** Días que faltan para el cierre, contados desde `hoy`. */
  diasRestantes: number | null;
  /** Aviso sobre el plazo cuando la fecha no es firme. */
  notaPlazo: string | null;
  plazas: number | null;
  nivelCodigo: NivelCodigo | null;
  /** Nivel ya traducido, p. ej. "Bachillerato o Formación Profesional…". */
  nivelEstudios: string | null;
  /** Titulación concreta que pide la convocatoria, en catalán. */
  titulacion: string | null;
  /** Idiomas, permisos de conducir, colegiación… en catalán. */
  otrosRequisitos: string | null;
  /** Cómo se selecciona: oposición, concurso-oposición, concurso. */
  seleccion: string | null;
  /** @deprecated El servidor lo manda siempre `false`: la distancia depende de
   * dónde viva quien mira, y eso solo lo sabe el navegador. Usa `cercania.ts`. */
  lejos: boolean;
  /** Dónde se presenta la solicitud. */
  enlace: string | null;
  /** Ficha en el portal CIDO de la Diputació. */
  fichaOficial: string | null;
  fuente?: string;
}

export interface Resumen {
  abiertas: number;
  pendientes: number;
  cerradas: number;
  plazas: number;
  fijas: number;
  temporales: number;
  cierranEn7Dias: number;
}

export interface Tablero {
  /** Momento en que el servidor calculó la respuesta (ISO 8601). */
  generado: string;
  /** Fecha de referencia para `diasRestantes`, `YYYY-MM-DD`. */
  hoy: string;
  abiertas: Plaza[];
  pendientes: Plaza[];
  cerradas: Plaza[];
  /**
   * Todos los municipios y comarcas de Cataluña, no solo los que aparecen: con
   * ellos se resuelven los identificadores del archivo viejo y se ofrece
   * cualquier pueblo como punto de referencia para medir distancias.
   */
  sitios: Record<string, Sitio>;
  resumen: Resumen;
  /** Fuentes que no se pudieron consultar en esta pasada. */
  errores: string[];
  cache?: string;
}

/** Las tres listas del tablero, que también son las tres pestañas. */
export type Grupo = 'abiertas' | 'pendientes' | 'cerradas';
