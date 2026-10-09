import { normaliza } from "./texto.ts";

/**
 * La parte legible de la URL de una ficha: `/convocatoria/<slug>-<id>/`.
 *
 * Sale del título original, en catalán, sin el número de plazas ni el «Borsa
 * de treball de», que no distinguen nada: «3 places de Tècnic/a de gestió»
 * da `tecnic-a-de-gestio`. Lo que identifica la ficha es el id; el slug solo
 * dice de qué va.
 *
 * Se calcula una vez, la primera vez que se ve la plaza, y la base lo
 * congela (`2026-10-09-slug-congelado.sql`): si el organismo corrige el
 * título después, la URL publicada no cambia. En una web estática una URL
 * vieja no se puede redirigir más que con una lista de reglas limitada.
 */
export function slugDe(titulo: string): string {
  const limpio = String(titulo ?? "")
    .replace(/^\s*\d+\s+(places?|plaça|placa)\s+(de\s+la\s+|de\s+l['’]|del\s+|dels\s+|de\s+|d['’])?/i, "")
    .replace(/^\s*borsa\s+de\s+treball\s+(de\s+places\s+)?(de\s+la\s+|de\s+l['’]|del\s+|dels\s+|de\s+|d['’])?/i, "");
  const base = normaliza(limpio)
    .replace(/·/g, "")
    // «d'instal·lacions» da `installacions`, no `dinstallacions`: la partícula
    // apostrofada se va entera, como el artículo.
    .replace(/\b[dl]['’]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return "convocatoria";
  if (base.length <= MAXIMO) return base;
  // Se corta en un guion para no dejar media palabra, salvo que la primera
  // palabra ya sea larguísima.
  const corte = base.slice(0, MAXIMO + 1);
  const guion = corte.lastIndexOf("-");
  return (guion >= 20 ? corte.slice(0, guion) : base.slice(0, MAXIMO)).replace(/-+$/, "");
}

/** Lo bastante para leerse en un resultado de búsqueda sin estirar la URL. */
const MAXIMO = 60;
