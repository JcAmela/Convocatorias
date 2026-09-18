import { describe, expect, it } from 'vitest';
import {
  asText, coordenadasDe, daysBetween, employerLabel, grupoCodigo,
  isExcluded, lugarDelTitulo, parentheticals, sePuedePedir, ymdOf,
  type Sitio,
} from '../supabase/functions/convoca-board/index.ts';

/**
 * La función de Supabase: 817 líneas que hasta ahora no ejecutaba nadie fuera
 * de producción y que ningún typecheck miraba. Es la mitad del sistema que
 * decide qué llega al navegador, así que un error aquí no rompe una pantalla,
 * reparte datos equivocados a todo el que consulte la API.
 */

const CAJA_CATALUNA = { latMin: 40, latMax: 43.5, lonMin: -0.5, lonMax: 4 };
const CAJA_MUNDO = { latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 };

describe('coordenadasDe', () => {
  it('deja pasar una coordenada catalana', () => {
    expect(coordenadasDe(41.4502, 2.2445, CAJA_CATALUNA)).toEqual({ lat: 41.4502, lon: 2.2445 });
  });

  it('tira la longitud imposible de Sant Marçal', () => {
    // El caso real que trae hoy el callejero de CIDO.
    expect(coordenadasDe(39.616326, 27660452, CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
  });

  it('tira también una coordenada creíble pero de otro país', () => {
    // Madrid: perfectamente válida como punto del planeta, imposible como
    // municipio del callejero catalán.
    expect(coordenadasDe(40.4168, -3.7038, CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
  });

  it('la rejilla del mundo sí acepta Madrid, que es por donde entra una sede de fuera', () => {
    expect(coordenadasDe(40.4168, -3.7038, CAJA_MUNDO)).toEqual({ lat: 40.4168, lon: -3.7038 });
  });

  it('media coordenada no sitúa nada: se van las dos', () => {
    expect(coordenadasDe(41.45, null, CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
    expect(coordenadasDe(undefined, 2.24, CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
  });

  it('lo que no es un número no es una coordenada', () => {
    expect(coordenadasDe('41.45', '2.24', CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
    expect(coordenadasDe(NaN, 2.24, CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
    expect(coordenadasDe(Infinity, 2.24, CAJA_CATALUNA)).toEqual({ lat: null, lon: null });
  });

  it('el cero es un número como cualquier otro dentro de su rejilla', () => {
    expect(coordenadasDe(0, 0, CAJA_MUNDO)).toEqual({ lat: 0, lon: 0 });
  });
});

describe('lugarDelTitulo', () => {
  const callejero: Record<string, Sitio> = {
    girona: { id: 'girona', nombre: 'Girona', tipo: 'municipio', comarca: 'Gironès', comarcaId: 'comarca-girones', lat: 41.98, lon: 2.82 },
    'c:valles occidental': { id: 'comarca-valles-occidental', nombre: 'Vallès Occidental', tipo: 'comarca', comarca: 'Vallès Occidental', comarcaId: 'comarca-valles-occidental', lat: null, lon: null },
  };

  it('saca el municipio del paréntesis final', () => {
    expect(lugarDelTitulo('1 plaça de Tècnic superior (Girona)', 'generalitat', callejero)?.nombre).toBe('Girona');
  });

  it('entiende la cola territorial sin paréntesis', () => {
    const s = lugarDelTitulo('1 plaça als Serveis Territorials al Vallès Occidental', 'generalitat', callejero);
    expect(s?.id).toBe('comarca-valles-occidental');
  });

  it('un código de departamento no es un pueblo', () => {
    // Por esto se comprueba contra el callejero en vez de fiarse del texto:
    // (TEI), (SIAD) y (CMP) se colaban como si fueran municipios.
    expect(lugarDelTitulo('1 plaça de Tècnic (TEI)', 'generalitat', callejero)).toBeNull();
    expect(lugarDelTitulo("1 plaça d'Educador (Recursos Humans)", 'generalitat', callejero)).toBeNull();
  });

  it('en una plaza municipal no se mira el título: el pueblo ya se sabe', () => {
    // Y sus paréntesis son códigos internos del ayuntamiento.
    expect(lugarDelTitulo('1 plaça de Peó (Girona)', 'municipal', callejero)).toBeNull();
    expect(lugarDelTitulo('1 plaça de Peó (Girona)', 'comarcal', callejero)).toBeNull();
  });

  it('manda el último paréntesis, que es el que habla del destino', () => {
    // Los de en medio suelen ser la categoría.
    expect(lugarDelTitulo('1 plaça (TEI) de Tècnic (Girona)', 'generalitat', callejero)?.nombre).toBe('Girona');
  });
});

describe('parentheticals', () => {
  it('saca todos los paréntesis del título', () => {
    expect(parentheticals('1 plaça (TEI) de Tècnic (Girona)')).toEqual(['TEI', 'Girona']);
  });

  it('no se queda con los demasiado cortos', () => {
    expect(parentheticals('1 plaça (a) de Tècnic')).toEqual([]);
  });
});

describe('isExcluded', () => {
  it('deja fuera policía, guardia urbana y mossos', () => {
    expect(isExcluded('1 plaça de Policia local')).toBe(true);
    expect(isExcluded("1 plaça d'agent de la Guàrdia Urbana")).toBe(true);
    expect(isExcluded('1 plaça de Sergent')).toBe(true);
    expect(isExcluded('1 plaça de Mosso')).toBe(true);
  });

  it('no se lleva por delante lo que no es', () => {
    expect(isExcluded("1 plaça d'Oficial 1a de brigada")).toBe(false);
    expect(isExcluded('1 plaça de Tècnic mitjà')).toBe(false);
  });

  it('mira todos los campos que se le pasen, no solo el primero', () => {
    expect(isExcluded('1 plaça de Tècnic', 'Àrea de Policia local')).toBe(true);
  });
});

describe('asText', () => {
  it('aplana lo que la fuente manda como objeto de idiomas', () => {
    expect(asText({ ca: 'Tècnic', es: 'Técnico' })).toBe('Tècnic Técnico');
  });

  it('un hueco no es la cadena "null"', () => {
    expect(asText(null)).toBe('');
    expect(asText(undefined)).toBe('');
  });
});

describe('fechas', () => {
  it('ymdOf acepta la fecha con hora detrás', () => {
    expect(ymdOf('2026-09-16T10:30:00Z')).toBe('2026-09-16');
  });

  it('ymdOf rechaza lo que no tiene forma de fecha', () => {
    expect(ymdOf('16/09/2026')).toBeNull();
    expect(ymdOf('')).toBeNull();
    expect(ymdOf(null)).toBeNull();
    expect(ymdOf(20260916)).toBeNull();
  });

  it('daysBetween cuenta los días que quedan', () => {
    expect(daysBetween('2026-09-16', '2026-09-18')).toBe(2);
    expect(daysBetween('2026-09-16', '2026-09-16')).toBe(0);
  });

  it('daysBetween da negativo en lo ya vencido, que es de lo que vive «Cerró hace»', () => {
    expect(daysBetween('2026-09-16', '2026-09-13')).toBe(-3);
  });

  it('daysBetween cruza los cambios de hora sin descuadrarse', () => {
    // `Date.parse('2026-10-24')` es medianoche UTC, así que el horario de
    // verano no entra en la resta y el redondeo es un cinturón, no el motor.
    // Quedan igualmente fijadas las dos semanas en que el reloj se mueve, por
    // si alguien cambia el parseo a hora local y cree que da lo mismo.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});

describe('grupoCodigo', () => {
  it('lee el código del grupo que manda CIDO', () => {
    expect(grupoCodigo('C1 - Batxillerat')).toBe('C1');
    expect(grupoCodigo('A1 - Llicenciatura')).toBe('A1');
  });

  it('las agrupaciones profesionales son AP, que es como se llaman en la web', () => {
    expect(grupoCodigo('Agrupacions professionals')).toBe('AP');
  });

  it('sin grupo no se inventa uno', () => {
    expect(grupoCodigo(null)).toBeNull();
    expect(grupoCodigo('Sense especificar')).toBeNull();
  });
});

describe('employerLabel', () => {
  it('traduce la cabecera del organismo', () => {
    expect(employerLabel('Ajuntament de Badalona')).toBe('Ayuntamiento de Badalona');
    expect(employerLabel('Consell Comarcal del Baix Camp')).toBe('Consejo Comarcal del Baix Camp');
  });

  it('el punto medio es lo que luego parte la ficha en casa y organismo', () => {
    expect(employerLabel("Generalitat de Catalunya - Departament d'Educació"))
      .toBe("Generalitat de Catalunya · Departament d'Educació");
  });
});

describe('sePuedePedir', () => {
  const item = (extra: Record<string, unknown> = {}) =>
    ({ id: 'x', fin: null, estadoOrigen: null, ...extra }) as Parameters<typeof sePuedePedir>[0];

  it('manda el estado que dice CIDO, no la fecha de cierre', () => {
    // El caso de las 156: bolsas abiertas, sin fecha de cierre anunciada, que
    // acababan en la pestaña que dice que todavía no se pueden pedir.
    expect(sePuedePedir(item({ estadoOrigen: 'Termini obert', fin: null }))).toBe(true);
    expect(sePuedePedir(item({ estadoOrigen: 'Pendent de termini', fin: null }))).toBe(false);
  });

  it('y el estado manda también cuando sí hay fecha', () => {
    expect(sePuedePedir(item({ estadoOrigen: 'Pendent de termini', fin: '2026-12-01' }))).toBe(false);
    expect(sePuedePedir(item({ estadoOrigen: 'Termini obert', fin: '2026-12-01' }))).toBe(true);
  });

  it('sin estado se cae a la regla vieja: la fecha', () => {
    // Los portales Convoca no mandan estado, y el archivo guarda filas de
    // antes de que este campo existiera.
    expect(sePuedePedir(item({ fin: '2026-12-01' }))).toBe(true);
    expect(sePuedePedir(item({ fin: null }))).toBe(false);
  });

  it('un estado que no conocemos no se interpreta: manda la fecha', () => {
    expect(sePuedePedir(item({ estadoOrigen: 'Termini tancat', fin: '2026-12-01' }))).toBe(true);
  });
});
