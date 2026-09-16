import { describe, expect, it } from 'vitest';
import { claveSitio, idSitio } from '../supabase/functions/convoca-board/index.ts';
import { claveLugar, idDe } from '../src/lib/localizacion';

/**
 * El servidor y el navegador fabrican por separado el identificador de un
 * municipio. Están escritos dos veces a propósito —uno corre en Deno y el otro
 * en el navegador— y el propio código lo advierte: «COPIA LITERAL […] y tiene
 * que seguir siéndolo».
 *
 * Es la clase de aviso que no sirve de nada. De ese identificador salen los
 * `?donde=` que la gente guarda en marcadores y manda por WhatsApp, así que si
 * las dos copias se separan un día, esos enlaces dejan de filtrar y **no da
 * ningún error**: la página carga, el menú funciona, y sencillamente no sale
 * la convocatoria que se quería enseñar.
 *
 * Esta prueba convierte el aviso en algo que se rompe a tiempo. El corpus son
 * topónimos reales del callejero, elegidos por lo que tienen de difícil:
 * apóstrofes, artículos, guiones interiores, dos nombres unidos por «i», y
 * hasta una errata de la fuente.
 */

const TOPONIMOS = [
  // Apóstrofe al principio, que es donde más difieren las reglas ingenuas.
  "L'Albi", "L'Aldea", "L'Escala", "L'Estany", "L'Albagés", "L'Ampolla", "L'Esquirol", "L'Argentera",
  // Guion interior: no es un separador de palabras, forma parte del nombre.
  'Mont-ral', 'Mont-ras', 'Font-rubí', 'Puig-reig', 'Vila-sana', 'Vila-seca', 'Palau-sator',
  'Mont-roig del Camp', 'Torre-serona', 'Vall-llobrega',
  // Artículo suelto delante.
  'El Bruc', 'La Masó', 'El Milà', 'La Pera', 'El Poal', 'La Quar', 'Els Torms', 'Les Piles',
  // Preposiciones en medio.
  'La Nou de Gaià', 'Ossó de Sió', 'El Pont de Bar', 'Roda de Ter', 'La Vall de Boí',
  'Canet de Mar', "Móra d'Ebre", 'Els Plans de Sió', 'Roda de Berà',
  // Dos poblaciones unidas, que son los nombres más largos del callejero.
  'Gimenells i el Pla de la Font', 'El Pont de Vilomara i Rocafort',
  'Sant Julià del Llor i Bonmatí', 'Brunyola i Sant Martí Sapresa',
  "Vandellòs i l'Hospitalet de l'Infant",
  // El artículo pospuesto entre paréntesis, y con la errata que trae la fuente.
  "Hospitalet de Llorbregat (L')",
  // Los de siempre, por si alguien «simplifica» pensando que son casos fáciles.
  'Badalona', 'Mataró', 'Barcelona', 'Santa Coloma de Gramenet', 'El Masnou',
  "L'Hospitalet de Llobregat", 'Sant Feliu de Llobregat', 'Vilanova i la Geltrú',
  // Comarcas, que pasan por las mismas funciones antes de llevar su prefijo.
  'Barcelonès', 'Vallès Occidental', 'Baix Llobregat', "Pla d'Urgell", 'Terra Alta',
];

describe('el identificador de un sitio es el mismo en el servidor y en la web', () => {
  it.each(TOPONIMOS)('%s', (nombre) => {
    expect(claveSitio(nombre)).toBe(claveLugar(nombre));
    expect(idSitio(claveSitio(nombre))).toBe(idDe(claveLugar(nombre)));
  });

  it('y ninguno de ellos se queda sin identificador', () => {
    // Una clave vacía manda la convocatoria a «sin lugar indicado». Que un
    // municipio de verdad acabe ahí sería un fallo silencioso más.
    for (const nombre of TOPONIMOS) {
      expect(idSitio(claveSitio(nombre))).not.toBe('');
    }
  });

  it('y el identificador solo lleva lo que cabe en una URL sin escapar', () => {
    for (const nombre of TOPONIMOS) {
      expect(idSitio(claveSitio(nombre))).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
