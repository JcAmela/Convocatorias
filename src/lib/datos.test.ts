import { describe, expect, it } from 'vitest';
import { esTablero, saneaTablero, soloLoVisible, tableroVacio } from './datos';
import { plaza, tablero } from './pruebas';
import type { Plaza, Tablero } from './tipos';

describe('esTablero', () => {
  it('reconoce un tablero', () => {
    expect(esTablero(tablero())).toBe(true);
  });

  it('rechaza lo que no lo es, que es lo que evita la pantalla en blanco', () => {
    // Una API que contesta 200 con `{ error: ... }` reventaba en el primer
    // `datos.abiertas.map`.
    expect(esTablero({ error: 'algo' })).toBe(false);
    expect(esTablero(null)).toBe(false);
    expect(esTablero('texto')).toBe(false);
    expect(esTablero({ abiertas: [], pendientes: [] })).toBe(false);
  });
});

describe('saneaTablero', () => {
  it('rellena los campos que el origen omite en las filas viejas', () => {
    const cruda = { titulo: 'Plaça antiga' } as Partial<Plaza>;
    const t = saneaTablero(tablero({ cerradas: [cruda as Plaza] }));
    const p = t.cerradas[0];
    expect(p.empleador).toBe('Organismo sin identificar');
    expect(p.donde).toBeTruthy();
    expect(p.id).toBeTruthy();
    expect(p.fijo).toBe(false);
  });

  it('no reetiqueta como Generalitat lo que no lo es', () => {
    // El ámbito que declara el origen para esas filas es falso.
    const t = saneaTablero(tablero({ cerradas: [{ titulo: 'x' } as Plaza] }));
    expect(t.cerradas[0].empleador).not.toContain('Generalitat');
  });

  it('aplana los errores para que no salga «[object Object]»', () => {
    const conObjetos = { ...tablero(), errores: [{ fuente: 'cido', mensaje: 'timeout' }] as unknown as string[] };
    expect(saneaTablero(conObjetos).errores).toEqual(['cido: timeout']);
  });

  it('deja pasar los errores que ya son texto', () => {
    const t = saneaTablero({ ...tablero(), errores: ['se cayó'] });
    expect(t.errores).toEqual(['se cayó']);
  });

  it('aguanta un tablero sin catálogo de sitios', () => {
    const sinSitios = { ...tablero(), sitios: undefined } as unknown as Tablero;
    expect(saneaTablero(sinSitios).sitios).toEqual({});
  });
});

describe('soloLoVisible', () => {
  it('se queda con lo que se pinta en el primer frame', () => {
    const t = soloLoVisible(tablero({
      abiertas: [plaza()],
      pendientes: [plaza({ id: 'p' })],
      cerradas: [plaza({ id: 'c' })],
    }));
    expect(t.abiertas).toHaveLength(1);
    expect(t.pendientes).toHaveLength(0);
    expect(t.cerradas).toHaveLength(0);
  });

  it('conserva el resumen, que es de donde salen los números de las pestañas', () => {
    const t = soloLoVisible(tablero({ resumen: { ...tablero().resumen, pendientes: 352 } }));
    expect(t.resumen.pendientes).toBe(352);
  });
});

describe('tableroVacio', () => {
  it('es un tablero de verdad, para que el build nunca se caiga por la API', () => {
    const t = tableroVacio('la API no contesta');
    expect(esTablero(t)).toBe(true);
    expect(t.errores).toEqual(['la API no contesta']);
  });
});
