import { describe, expect, it } from 'vitest';
import {
  ATRIBUCION, esPublicable, ficheroDeGrupo, ficheroMeta, paraCalendario, primeras,
  PRIMERA_PAGINA, recorta, resumenDe, sitiosDe,
} from './publicos';
import { plaza, sitio, tablero } from './pruebas';

/**
 * Lo que sale en `/datos/` y en el HTML de la portada. Si las cuentas o las
 * primeras 24 del build no coinciden con lo que calcula la isla, la portada
 * cambia de golpe al llegar los datos, o enseña cifras que no son.
 */

const EN_BADALONA = { sedeId: 'badalona', trabajoId: 'badalona', origen: 'sede' } as const;

describe('recorta', () => {
  it('quita lo que el navegador no usa y los null', () => {
    const q = recorta(plaza({
      donde: EN_BADALONA, municipio: 'x', lejos: false, fuente: 'cido', contratoOriginal: 'Laboral', notaPlazo: null,
    }));
    for (const k of ['municipio', 'lejos', 'fuente', 'contratoOriginal', 'notaPlazo']) expect(q).not.toHaveProperty(k);
    expect(q).toHaveProperty('titulo');
    expect(q).toHaveProperty('donde');
  });

  it('a una fila vieja del archivo, sin identificadores de lugar, le deja el municipio', () => {
    // Es lo único que le queda a `legado()` para decir dónde era.
    const q = recorta(plaza({ municipio: 'Sabadell' }));
    expect(q.municipio).toBe('Sabadell');
  });
});

describe('esPublicable', () => {
  it('solo publica CIDO', () => {
    expect(esPublicable(plaza({ id: 'cido-123' }))).toBe(true);
    expect(esPublicable(plaza({ id: '00000000-0000-4000-8000-000000000001' }))).toBe(false);
  });
});

describe('resumenDe', () => {
  it('cuenta igual que las cifras de la isla', () => {
    const r = resumenDe([
      plaza({ plazas: 3, fijo: true, diasRestantes: 0 }),
      plaza({ plazas: null, fijo: false, diasRestantes: 7 }),
      plaza({ plazas: 2, fijo: false, diasRestantes: 8 }),
      plaza({ plazas: 1, fijo: false, diasRestantes: null }),
    ], [plaza()], []);
    expect(r).toEqual({ abiertas: 4, pendientes: 1, cerradas: 0, plazas: 6, fijas: 1, temporales: 3, cierranEn7Dias: 2 });
  });
});

describe('sitiosDe', () => {
  it('trae la sede, el destino y sus comarcas, y nada más', () => {
    const todos = {
      badalona: sitio({ id: 'badalona', comarcaId: 'comarca-barcelones' }),
      'comarca-barcelones': sitio({ id: 'comarca-barcelones', tipo: 'comarca', comarcaId: 'comarca-barcelones' }),
      girona: sitio({ id: 'girona', comarcaId: 'comarca-girones' }),
      'comarca-girones': sitio({ id: 'comarca-girones', tipo: 'comarca', comarcaId: 'comarca-girones' }),
      lleida: sitio({ id: 'lleida' }),
    };
    const s = sitiosDe([plaza({ donde: { sedeId: 'badalona', trabajoId: 'girona', origen: 'titulo' } })], todos);
    expect(Object.keys(s).sort()).toEqual(['badalona', 'comarca-barcelones', 'comarca-girones', 'girona']);
  });
});

describe('primeras', () => {
  it('son las 24 de cierre más próximo, con las sin fecha al final', () => {
    const lista = Array.from({ length: 30 }, (_, i) =>
      plaza({ id: `cido-${i}`, fin: i % 5 === 0 ? null : `2026-11-${String(30 - i).padStart(2, '0')}` }));
    const p = primeras(lista);
    expect(p).toHaveLength(PRIMERA_PAGINA);
    const fechas = p.map((x) => x.fin).filter(Boolean) as string[];
    expect(fechas).toEqual([...fechas].sort());
    expect(p.slice(0, fechas.length).every((x) => x.fin)).toBe(true);
  });
});

describe('paraCalendario', () => {
  it('solo lo que cae en los 45 días que se dibujan, con fecha y puestos', () => {
    const c = paraCalendario([
      plaza({ fin: '2026-10-08', plazas: 2 }),
      plaza({ fin: '2026-11-21', plazas: 1 }),
      plaza({ fin: '2026-11-22', plazas: 1 }),
      plaza({ fin: '2026-10-07', plazas: 1 }),
      plaza({ fin: null }),
    ], '2026-10-08');
    expect(c).toEqual([{ fin: '2026-10-08', plazas: 2 }, { fin: '2026-11-21', plazas: 1 }]);
  });
});

describe('ficheros', () => {
  it('cada lista lleva su atribución y su fecha', () => {
    const t = tablero({ generado: '2026-10-08T04:00:00Z', abiertas: [plaza({ donde: EN_BADALONA, municipio: 'x' })] });
    const f = ficheroDeGrupo(t, 'abiertas');
    expect(f.atribucion).toBe(ATRIBUCION);
    expect(f.generado).toBe('2026-10-08T04:00:00Z');
    expect(f.plazas[0]).not.toHaveProperty('municipio');
  });

  it('meta.json trae los recuentos que compara el build siguiente', () => {
    const t = tablero({ abiertas: [plaza(), plaza()], pendientes: [plaza()], cerradas: [] });
    const m = ficheroMeta({ tablero: t, commit: 'abc' });
    expect(m.recuentos).toEqual({ abiertas: 2, pendientes: 1, cerradas: 0 });
    expect(m.commit).toBe('abc');
    expect(m.atribucion.licencia).toBe('CC BY 4.0');
  });
});
