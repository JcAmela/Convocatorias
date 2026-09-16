import { describe, expect, it } from 'vitest';
import { terminosDe, variantes } from './oficios';

/**
 * El puente del español al catalán es lo que hace que el buscador encuentre
 * algo: sin él, «administrativo» daba cero sobre noventa plazas de
 * *administratiu*. Son reglas sobre cadenas, del tipo que se rompe en
 * silencio, así que aquí quedan fijadas las que sostienen el buscador.
 */

/** ¿Encontraría `consulta` un anuncio que dice `texto`? */
function encuentra(consulta: string, texto: string): boolean {
  return terminosDe(consulta).every((formas) => formas.some((f) => texto.includes(f)));
}

describe('variantes', () => {
  it('conserva siempre la palabra tecleada, para quien busca en catalán', () => {
    expect(variantes('paleta')).toContain('paleta');
  });

  it('cruza los oficios que no se parecen en nada', () => {
    expect(variantes('albanil')).toContain('paleta');
    expect(variantes('fontanero')).toContain('lampista');
    expect(variantes('peon')).toContain('peo');
    expect(variantes('cocinero')).toContain('cuiner');
  });

  it('abre la raíz a toda su familia: femenino y plural de una vez', () => {
    // `enferm` cubre enfermero, enfermera y enfermería.
    expect(variantes('enfermera')).toContain('inferm');
    expect(variantes('enfermeros')).toContain('inferm');
  });

  it('-ción → -ció', () => {
    expect(variantes('oposicion')).toContain('oposicio');
    expect(variantes('educacion')).toContain('educacio');
  });

  it('-dad → -tat', () => {
    expect(variantes('discapacidad')).toContain('discapacitat');
    expect(variantes('actividad')).toContain('activitat');
  });

  it('-izar → -itzar', () => {
    expect(variantes('organizacion')).toContain('organitzacio');
  });

  it('se come la vocal final de las palabras largas', () => {
    expect(variantes('tecnico')).toContain('tecnic');
    expect(variantes('arquitecto')).toContain('arquitect');
  });

  it('no toca las palabras cortas: quitarles una letra abre demasiado', () => {
    expect(variantes('obra')).not.toContain('obr');
  });
});

describe('el buscador, de punta a punta', () => {
  it('encuentra en catalán lo que se teclea en español', () => {
    expect(encuentra('administrativo', "1 plaça d'auxiliar administratiu")).toBe(true);
    expect(encuentra('albanil', "1 plaça d'oficial paleta de la brigada")).toBe(true);
    expect(encuentra('limpieza', '2 places de peo de neteja viaria')).toBe(true);
    expect(encuentra('bolsa', 'borsa de treball de places')).toBe(true);
  });

  it('exige todas las palabras, en cualquier orden', () => {
    const texto = "1 placa d'oficial 1a de brigada municipal";
    expect(encuentra('oficial brigada', texto)).toBe(true);
    expect(encuentra('brigada oficial', texto)).toBe(true);
    expect(encuentra('oficial jardineria', texto)).toBe(false);
  });

  it('ignora acentos y mayúsculas', () => {
    expect(encuentra('MATARÓ', 'oficial 1a lampisteria mataro')).toBe(true);
  });

  it('una consulta vacía no parte en términos', () => {
    expect(terminosDe('   ')).toEqual([]);
  });
});

describe('las reglas se encadenan', () => {
  it('«organización» llega hasta organització', () => {
    // Cada regla por su cuenta daba *organitzacion* y *organizació*, dos
    // palabras que no existen, y nunca la que está escrita en el anuncio.
    expect(encuentra('organizacion', "tecnic d'organitzacio i recursos humans")).toBe(true);
  });

  it('y con el resto de la familia -ització', () => {
    expect(encuentra('dinamizacion', 'tecnic de dinamitzacio comunitaria')).toBe(true);
    expect(encuentra('especializacion', "curs d'especialitzacio")).toBe(true);
  });
});
