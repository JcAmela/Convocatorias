import { describe, expect, it } from 'vitest';
import { slugDe } from '../supabase/functions/_shared/slug.ts';
import {
  idDeRutaFicha, rutaComarca, rutaEstudios, rutaFicha, rutaMunicipio, rutaTipo, RUTA_SIN_TITULACION,
} from '../src/lib/rutas';
import fixture from './fixtures/tablero.json';

/**
 * Las URL se fijan una vez y no se cambian: estas pruebas son el contrato.
 * Si alguna falla tras un cambio, es que ese cambio movería direcciones que
 * Google ya puede conocer.
 */

describe('slugDe', () => {
  it('quita el número de plazas y deja el puesto, sin acentos', () => {
    expect(slugDe('3 places de Tècnic/a de gestió')).toBe('tecnic-a-de-gestio');
    expect(slugDe("1 plaça d'Auxiliar administratiu/iva")).toBe('auxiliar-administratiu-iva');
    expect(slugDe('1 plaça de la Policia')).toBe('policia');
  });

  it('quita el «Borsa de treball de places de»', () => {
    expect(slugDe("Borsa de treball de places d'Educador social")).toBe('educador-social');
    expect(slugDe('Borsa de treball de Mestre (ampliació)')).toBe('mestre-ampliacio');
  });

  it('la ele geminada, la ce trencada y el apóstrofo se escriben como en una URL', () => {
    expect(slugDe("1 plaça d'Oficial d'instal·lacions")).toBe('oficial-installacions');
    expect(slugDe('2 places de Tècnic de comerç')).toBe('tecnic-de-comerc');
  });

  it('no pasa de 60 caracteres ni deja media palabra', () => {
    const s = slugDe("1 plaça de Tècnic superior d'avaluació de resultats, impacte i valor en salut a la Direcció");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
    expect("tecnic-superior-avaluacio-de-resultats-impacte-i-valor-en-salut-a-la".startsWith(s)).toBe(true);
  });

  it('un título vacío o raro sigue dando algo', () => {
    expect(slugDe('')).toBe('convocatoria');
    expect(slugDe('🗓️ !!!')).toBe('convocatoria');
  });
});

describe('rutaFicha', () => {
  it('es /convocatoria/<slug>-<id>/ y el id se recupera de ella', () => {
    const r = rutaFicha({ id: 'cido-22268466', titulo: "1 plaça d'Expenedor-venedor", slug: undefined });
    expect(r).toBe('/convocatoria/expenedor-venedor-cido-22268466/');
    expect(idDeRutaFicha(r)).toBe('cido-22268466');
  });

  it('manda el slug congelado, aunque el título haya cambiado', () => {
    expect(rutaFicha({ id: 'cido-1', titulo: 'Título corregido', slug: 'titulo-original' }))
      .toBe('/convocatoria/titulo-original-cido-1/');
  });

  it('el mismo id da siempre la misma dirección', () => {
    const p = { id: 'cido-7', titulo: '2 places de Treballador/a social', slug: undefined };
    expect(rutaFicha(p)).toBe(rutaFicha({ ...p }));
  });

  it('los títulos repetidos del fixture no chocan', () => {
    const todas = [...fixture.abiertas, ...fixture.pendientes, ...fixture.cerradas]
      .filter((p) => p.id.startsWith('cido-'));
    const titulos = new Map<string, number>();
    for (const p of todas) titulos.set(p.titulo, (titulos.get(p.titulo) ?? 0) + 1);
    expect([...titulos.values()].some((n) => n > 1)).toBe(true);
    const rutas = todas.map((p) => rutaFicha({ id: p.id, titulo: p.titulo, slug: undefined }));
    expect(new Set(rutas).size).toBe(rutas.length);
  });
});

describe('listados', () => {
  it('lugares, estudios, tipo y sin titulación', () => {
    expect(rutaMunicipio('badalona')).toBe('/municipio/badalona/');
    expect(rutaComarca('comarca-barcelones')).toBe('/comarca/barcelones/');
    expect(rutaEstudios('C2')).toBe('/estudios/c2/');
    expect(rutaTipo('fija')).toBe('/tipo/fija/');
    expect(RUTA_SIN_TITULACION).toBe('/sin-titulacion/');
  });
});
