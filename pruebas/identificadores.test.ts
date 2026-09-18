import { describe, expect, it } from 'vitest';
import { claveLugar, idComarca, idDe } from '../supabase/functions/_shared/lugares.ts';

/**
 * El identificador de un municipio, que es lo que viaja en los `?donde=` que
 * la gente guarda en marcadores y manda por WhatsApp. Cambiar `claveLugar` o
 * `idDe` cambia esos enlaces y los rompe **sin dar ningún error**: la página
 * carga, el menú funciona, y simplemente no sale lo que se quería enseñar.
 *
 * Durante un tiempo hubo dos copias de estas funciones, una en Deno y otra en
 * el navegador, con un comentario que pedía no separarlas nunca. Ya son una
 * sola; lo que queda por vigilar no es que coincidan, sino que sigan dando
 * exactamente el mismo resultado que hoy. El corpus son topónimos reales del
 * callejero, elegidos por lo que tienen de difícil: apóstrofes, artículos
 * delante y detrás, guiones interiores, dos pueblos unidos por «i», y hasta
 * una errata de la fuente.
 */

/**
 * Cada topónimo con el identificador que produce hoy. No es una lista de
 * ejemplos: es el contrato. Si una de estas parejas deja de cumplirse, los
 * `?donde=` que hay guardados por ahí apuntan a otra cosa y nadie se entera.
 */
const TOPONIMOS: [string, string][] = [
  ["L'Albi", "albi"],
  ["L'Aldea", "aldea"],
  ["L'Escala", "escala"],
  ["L'Estany", "estany"],
  ["L'Albagés", "albages"],
  ["L'Ampolla", "ampolla"],
  ["L'Esquirol", "esquirol"],
  ["L'Argentera", "argentera"],
  ["Mont-ral", "mont-ral"],
  ["Mont-ras", "mont-ras"],
  ["Font-rubí", "font-rubi"],
  ["Puig-reig", "puig-reig"],
  ["Vila-sana", "vila-sana"],
  ["Vila-seca", "vila-seca"],
  ["Palau-sator", "palau-sator"],
  ["Mont-roig del Camp", "mont-roig-camp"],
  ["Torre-serona", "torre-serona"],
  ["Vall-llobrega", "vall-llobrega"],
  ["El Bruc", "bruc"],
  ["La Masó", "maso"],
  ["El Milà", "mila"],
  ["La Pera", "pera"],
  ["El Poal", "poal"],
  ["La Quar", "quar"],
  ["Els Torms", "torms"],
  ["Les Piles", "piles"],
  ["La Nou de Gaià", "nou-gaia"],
  ["Ossó de Sió", "osso-sio"],
  ["El Pont de Bar", "pont-bar"],
  ["Roda de Ter", "roda-ter"],
  ["La Vall de Boí", "vall-boi"],
  ["Canet de Mar", "canet-mar"],
  ["Móra d'Ebre", "mora-ebre"],
  ["Els Plans de Sió", "plans-sio"],
  ["Roda de Berà", "roda-bera"],
  ["Gimenells i el Pla de la Font", "gimenells-pla-font"],
  ["El Pont de Vilomara i Rocafort", "pont-vilomara-rocafort"],
  ["Sant Julià del Llor i Bonmatí", "sant-julia-llor-bonmati"],
  ["Brunyola i Sant Martí Sapresa", "brunyola-sant-marti-sapresa"],
  ["Vandellòs i l'Hospitalet de l'Infant", "vandellos-hospitalet-infant"],
  ["Hospitalet de Llorbregat (L')", "hospitalet-llorbregat"],
  ["Badalona", "badalona"],
  ["Mataró", "mataro"],
  ["Barcelona", "barcelona"],
  ["Santa Coloma de Gramenet", "santa-coloma-gramenet"],
  ["El Masnou", "masnou"],
  ["L'Hospitalet de Llobregat", "hospitalet-llobregat"],
  ["Sant Feliu de Llobregat", "sant-feliu-llobregat"],
  ["Vilanova i la Geltrú", "vilanova-geltru"],
  ["Barcelonès", "barcelones"],
  ["Vallès Occidental", "valles-occidental"],
  ["Baix Llobregat", "baix-llobregat"],
  ["Pla d'Urgell", "pla-urgell"],
  ["Terra Alta", "terra-alta"],
];

/**
 * Las dos formas en que el callejero escribe el artículo. Son el mismo pueblo
 * y tienen que dar el mismo identificador: mientras no lo dieron, veinte
 * municipios estuvieron partidos en dos, el menú «Dónde» los listaba por
 * duplicado y un enlace ?donde=vendrell se dejaba fuera las convocatorias
 * archivadas como "Vendrell (El)".
 */
const ARTICULO_POSPUESTO: [string, string][] = [
  ['El Masnou', 'Masnou (El)'],
  ['La Garriga', 'Garriga (La)'],
  ['El Vendrell', 'Vendrell (El)'],
  ["La Seu d'Urgell", "Seu d'Urgell (La)"],
  ['Els Prats de Rei', 'Prats de Rei (Els)'],
  ['La Pobla de Segur', 'Pobla de Segur (La)'],
  ['El Catllar', 'Catllar (El)'],
  ['La Sénia', 'Sénia (La)'],
];

describe('el artículo, delante o detrás, da el mismo pueblo', () => {
  it.each(ARTICULO_POSPUESTO)('%s == %s', (delante, detras) => {
    expect(idDe(claveLugar(detras))).toBe(idDe(claveLugar(delante)));
  });

  it('y el identificador es el de la forma normal, sin rastro del paréntesis', () => {
    expect(idDe(claveLugar('Masnou (El)'))).toBe('masnou');
    expect(idDe(claveLugar("Seu d'Urgell (La)"))).toBe('seu-urgell');
  });

  it('tampoco deja rastro el artículo apostrofado entre paréntesis', () => {
    // Tal cual lo manda la fuente, con su errata incluida.
    expect(idDe(claveLugar("Hospitalet de Llorbregat (L')"))).toBe('hospitalet-llorbregat');
  });
});

describe('el identificador aguanta los topónimos difíciles', () => {
  it.each(TOPONIMOS)('%s -> %s', (nombre, esperado) => {
    expect(idDe(claveLugar(nombre))).toBe(esperado);
  });

  it('ninguno se queda sin identificador', () => {
    // Una clave vacía manda la convocatoria a «sin lugar indicado». Que un
    // municipio de verdad acabe ahí sería un fallo silencioso más.
    for (const [nombre] of TOPONIMOS) {
      expect(idDe(claveLugar(nombre))).not.toBe('');
    }
  });

  it('y solo lleva lo que cabe en una URL sin escapar', () => {
    for (const [nombre] of TOPONIMOS) {
      expect(idDe(claveLugar(nombre))).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe('las comarcas', () => {
  it('llevan prefijo para no chocar con un municipio homónimo', () => {
    expect(idComarca('Barcelonès')).toBe('comarca-barcelones');
    expect(idDe(claveLugar('Barcelona'))).toBe('barcelona');
  });
});
