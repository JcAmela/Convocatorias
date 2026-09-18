import { normaliza } from './texto.ts';

/**
 * El identificador de un municipio o una comarca. Compartido entre el
 * servidor, que lo fabrica, y la web, que lo lee de la URL: de aquí salen los
 * `?donde=` que la gente guarda en marcadores y manda por WhatsApp.
 *
 * Cambiar cualquiera de estas funciones cambia esos enlaces. Antes de tocar
 * nada, mira `pruebas/identificadores.test.ts`: fija el resultado para
 * cuarenta topónimos reales elegidos por difíciles.
 */

/** Artículos y preposiciones: sobran para comparar, «de» y «del» son lo mismo. */
const PARTICULAS = new Set([
  'el', 'la', 'els', 'les', 'lo', 'los', 'de', 'del', 'dels', 'da', 'd', 'l', 'i', 'a', 'al', 'als',
]);

export function claveLugar(nombre: string): string {
  return normaliza(nombre)
    .replace(/[’´`]/g, "'")
    .replace(/'/g, "' ")
    // Los paréntesis separan como un espacio. El callejero escribe el artículo
    // de dos maneras —«El Masnou» y «Masnou (El)»— y sin esto la segunda daba
    // la clave «masnou (el)», o sea un municipio distinto: veinte pueblos
    // partidos en dos identificadores, el menú «Dónde» listándolos por
    // duplicado y los enlaces `?donde=` perdiéndose la mitad.
    .split(/[\s.,()]+/)
    .map((palabra) => palabra.replace(/'$/, ''))
    .filter((palabra) => palabra && !PARTICULAS.has(palabra))
    .join(' ');
}

/** De la clave al identificador, que tiene que caber en una URL sin escapar. */
export function idDe(clave: string): string {
  return clave.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Las comarcas llevan prefijo para no chocar nunca con un municipio homónimo. */
export function idComarca(nombre: string): string {
  return `comarca-${idDe(claveLugar(nombre))}`;
}
