/**
 * Cuánto queda de plazo y cómo se clasifica. Compartido: la web lo usa para
 * las píldoras y el filtro de «tiempo que queda», y el aviso por correo va a
 * necesitar exactamente los mismos tramos. Si divergieran, el email diría
 * «quedan 3 días» de algo que en la web sale en verde.
 */

export type TonoUrgencia = 'critica' | 'seria' | 'aviso' | 'calma' | 'sinfecha';

export interface Urgencia {
  tono: TonoUrgencia;
  etiqueta: string;
  /** Para agrupar en el filtro de "tiempo que queda". */
  cubo: 'cerrada' | 'hoy' | '3dias' | 'semana' | 'mes' | 'lejano' | 'sinfecha';
}

export function urgencia(dias: number | null): Urgencia {
  if (dias === null || dias === undefined) {
    // «Sin plazo aún» decía dos cosas a la vez y una era falsa. Desde que el
    // servidor clasifica por el estado que manda CIDO, una convocatoria sin
    // fecha de cierre puede estar perfectamente abierta —156 lo estaban—, así
    // que la píldora dice solo lo que sabe: que no hay fecha. Si se puede
    // pedir o no lo dice la pestaña en la que está.
    return { tono: 'sinfecha', etiqueta: 'Sin fecha de cierre', cubo: 'sinfecha' };
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

export const ORDEN_NIVEL: Record<string, number> = {
  AP: 0, C2: 1, C1: 2, A2: 3, A: 4, A1: 5,
};

export const ETIQUETA_AMBITO: Record<string, string> = {
  municipal: 'Ayuntamiento',
  comarcal: 'Consejo comarcal',
  generalitat: 'Generalitat',
  diputacio: 'Diputación',
};
