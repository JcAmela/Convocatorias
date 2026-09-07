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

export interface Plaza {
  id: string;
  titulo: string;
  empleador: string;
  /** Para la Generalitat repite el empleador; solo sirve en las municipales. */
  municipio: string | null;
  /** Dónde se trabaja de verdad. `null` cuando el anuncio no lo dice. */
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
  /** true cuando el puesto cae fuera del área metropolitana de Barcelona. */
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
  resumen: Resumen;
  /** Fuentes que no se pudieron consultar en esta pasada. */
  errores: string[];
  cache?: string;
}

/** Las tres listas del tablero, que también son las tres pestañas. */
export type Grupo = 'abiertas' | 'pendientes' | 'cerradas';
