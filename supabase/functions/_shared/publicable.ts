/**
 * Qué se publica. Una sola regla para la web, el build y los correos: si cada
 * uno decidiera por su cuenta, un aviso por correo podría anunciar una plaza
 * que la web no enseña, o el build contar plazas que no publica.
 *
 * Hoy se publica lo que viene de CIDO. Las plazas de los portales Convoca
 * (Badalona, El Masnou y Santa Coloma) se siguen leyendo, pero no salen hasta
 * que se revise esa fuente (F1 de la hoja de ruta).
 */
export function esPublicable(p: { id: string }): boolean {
  return typeof p?.id === "string" && p.id.startsWith("cido-");
}

/** Las fuentes cuyas plazas no se publican: sus fallos tampoco se anuncian. */
export const FUENTES_NO_PUBLICADAS = ["Badalona", "El Masnou", "Santa Coloma de Gramenet"] as const;
