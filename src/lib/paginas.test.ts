import { beforeAll, describe, expect, it } from 'vitest';
import {
  cierranProntoEn, cifrasDe, conFicha, fraseCifras, fraseQuien, lugarSeguro, masEn, parecidas, porLugar, rutaDeSitio,
} from './paginas';
import { usaSitios } from './localizacion';
import { SITIOS, plaza, tablero } from './pruebas';
import { DIAS_FICHA_CERRADA, primerCierreConFicha, tieneFicha } from './rutas';

const enBadalona = { sedeId: 'badalona', trabajoId: 'badalona', origen: 'sede' as const };
const enMataro = { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' as const };
const soloSedeBadalona = { sedeId: 'badalona', trabajoId: null, origen: 'desconocido' as const };

beforeAll(() => usaSitios(SITIOS));

describe('qué convocatorias tienen ficha', () => {
  const HOY = '2026-10-09';

  it(`las cerradas, solo ${DIAS_FICHA_CERRADA} días`, () => {
    expect(primerCierreConFicha(HOY)).toBe('2026-09-09');
    expect(tieneFicha({ fin: '2026-09-09' }, HOY)).toBe(true);
    expect(tieneFicha({ fin: '2026-09-08' }, HOY)).toBe(false);
    expect(tieneFicha({ fin: null }, HOY)).toBe(true);
  });

  it('todas las abiertas y pendientes, y un id repetido solo una vez, en la lista más viva', () => {
    const t = tablero({
      hoy: HOY,
      abiertas: [plaza({ id: 'a', fin: '2026-10-20' })],
      pendientes: [plaza({ id: 'p', fin: null }), plaza({ id: 'a', fin: null })],
      cerradas: [plaza({ id: 'c', fin: '2026-10-01' }), plaza({ id: 'vieja', fin: '2026-08-01' })],
    });
    expect(conFicha(t).map((f) => `${f.grupo}:${f.plaza.id}`)).toEqual(['abiertas:a', 'pendientes:p', 'cerradas:c']);
  });
});

describe('las páginas de lugar', () => {
  const t = tablero({
    abiertas: [
      plaza({ id: 'b1', donde: enBadalona, fin: '2026-09-20', diasRestantes: 4 }),
      plaza({ id: 'b2', donde: enBadalona, fin: '2026-09-18', diasRestantes: 2 }),
      plaza({ id: 'm1', donde: enMataro, fin: '2026-09-19', diasRestantes: 3 }),
      plaza({ id: 'sede', donde: soloSedeBadalona }),
    ],
    pendientes: [plaza({ id: 'bp', donde: enBadalona, fin: null, diasRestantes: null })],
  });

  it('una plaza de la que solo se sabe la sede no cuenta en ningún sitio', () => {
    expect(lugarSeguro(t.abiertas[3])).toBeNull();
    const badalona = porLugar(t).get('badalona')!;
    expect(badalona.abiertas.map((p) => p.id)).toEqual(['b1', 'b2']);
    expect(badalona.pendientes.map((p) => p.id)).toEqual(['bp']);
  });

  it('cada convocatoria cuenta también en su comarca', () => {
    expect(porLugar(t).get('comarca-barcelones')!.abiertas.map((p) => p.id)).toEqual(['b1', 'b2']);
  });

  it('solo tiene página el sitio con algo vivo', () => {
    expect(rutaDeSitio(t, SITIOS.badalona)).toBe('/municipio/badalona/');
    expect(rutaDeSitio(t, SITIOS['comarca-barcelones'])).toBe('/comarca/barcelones/');
    expect(rutaDeSitio(t, SITIOS.lleida)).toBeNull();
  });

  it('«Más en» trae las del mismo municipio sin la propia, las que cierran antes primero', () => {
    const vivas = [...t.abiertas, ...t.pendientes];
    expect(masEn(t.abiertas[0], vivas).map((p) => p.id)).toEqual(['b2', 'bp']);
  });

  it('«Cierran pronto» trae las de la comarca que cierran en 14 días, sin repetir', () => {
    expect(cierranProntoEn(t.abiertas[0], t.abiertas, t.sitios, new Set(['b2'])).map((p) => p.id)).toEqual([]);
    expect(cierranProntoEn(t.abiertas[0], t.abiertas, t.sitios, new Set()).map((p) => p.id)).toEqual(['b2']);
  });

  it('el texto de las cifras', () => {
    const v = porLugar(t).get('badalona')!;
    expect(fraseCifras(cifrasDe(v), 'en Badalona')).toBe(
      'En Badalona hay 2 convocatorias de empleo público con el plazo abierto y 1 anunciada que aún no ha abierto el plazo. ' +
      '2 cierran en los próximos 7 días.',
    );
    expect(fraseQuien(v)).toBe('Las convoca: Ayuntamiento de Prueba (3).');
  });

  it('sin abiertas, lo dice', () => {
    expect(fraseCifras({ abiertas: 0, pendientes: 2, puestos: 0, fijas: 0, cierranSemana: 0 }, 'en Lleida'))
      .toBe('En Lleida no hay ahora mismo ninguna convocatoria con el plazo abierto, pero sí 2 anunciadas que aún no han abierto el plazo.');
  });
});

describe('parecidas a una cerrada', () => {
  it('primero las del mismo oficio, y entre ellas las de cerca', () => {
    const cerrada = plaza({ id: 'c', titulo: '1 plaça d\'Auxiliar administratiu', donde: enBadalona });
    const abiertas = [
      plaza({ id: 'otro', titulo: '1 plaça de Conserge', donde: enBadalona }),
      plaza({ id: 'lejos', titulo: 'Auxiliar administratiu de suport', donde: enMataro }),
      plaza({ id: 'cerca', titulo: 'Auxiliar administratiu', donde: enBadalona }),
      plaza({ id: 'nada', titulo: 'Arquitecte', donde: enMataro }),
    ];
    expect(parecidas(cerrada, abiertas, SITIOS).map((p) => p.id)).toEqual(['cerca', 'lejos', 'otro']);
  });
});
