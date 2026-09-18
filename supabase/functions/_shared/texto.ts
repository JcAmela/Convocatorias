/**
 * Código que usan a la vez la función de Supabase (Deno) y la web (Astro).
 *
 * Vive bajo `supabase/functions/_shared/` porque es la carpeta que el CLI de
 * Supabase empaqueta junto a cada función, y la web lo importa por ruta
 * relativa: `moduleResolution: "Bundler"` con `allowImportingTsExtensions`
 * acepta la extensión `.ts` explícita que Deno exige. Una sola copia, los dos
 * lados la usan.
 *
 * Antes eran dos. El propio código lo advertía —«COPIA LITERAL […] y tiene
 * que seguir siéndolo»— y ese aviso no protege de nada: si las copias se
 * separan, los identificadores que viajan en `?donde=` dejan de casar y los
 * enlaces guardados fallan sin dar ningún error.
 */

/**
 * Sin acentos y en minúsculas, para comparar dos textos que vienen de sitios
 * distintos. El rango va escrito con secuencias de escape a propósito: con
 * los caracteres combinantes literales el fichero se llena de bytes
 * invisibles que cualquier copiado estropea sin que se note.
 */
export function normaliza(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
