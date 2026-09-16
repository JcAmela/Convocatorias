import { beforeEach, describe, expect, it } from 'vitest';
import {
  catalogoDe, claveLugar, esSoloSede, idDe, idsFiltroLugar, lugaresTexto, nombreLugar,
  sitioMostrado, usaSitios, SIN_LUGAR,
} from './localizacion';
import { plaza, SITIOS } from './pruebas';

beforeEach(() => usaSitios(SITIOS));

describe('claveLugar e idDe', () => {
  it('tira artículos y preposiciones: «de» y «del» son lo mismo', () => {
    expect(claveLugar("L'Hospitalet de Llobregat")).toBe('hospitalet llobregat');
  });

  it('ignora acentos y mayúsculas', () => {
    expect(claveLugar('Mataró')).toBe(claveLugar('MATARO'));
  });

  it('fabrica identificadores aptos para la URL', () => {
    expect(idDe(claveLugar("L'Hospitalet de Llobregat"))).toBe('hospitalet-llobregat');
    expect(idDe(claveLugar('Sant Feliu de Llobregat'))).toBe('sant-feliu-llobregat');
  });
});

describe('qué sitio se enseña', () => {
  it('manda el lugar de trabajo cuando el anuncio lo dice', () => {
    const p = plaza({ donde: { sedeId: 'badalona', trabajoId: 'mataro', origen: 'portal' } });
    expect(nombreLugar(p)).toBe('Mataró');
    expect(esSoloSede(p)).toBe(false);
  });

  it('cae a la sede cuando no se sabe dónde se trabaja, y lo avisa', () => {
    const p = plaza({ donde: { sedeId: 'badalona', trabajoId: null, origen: 'desconocido' } });
    expect(nombreLugar(p)).toBe('Badalona');
    expect(esSoloSede(p)).toBe(true);
  });

  it('sin ningún dato no enseña un sitio cualquiera', () => {
    const p = plaza({ donde: { sedeId: null, trabajoId: null, origen: 'desconocido' } });
    expect(sitioMostrado(p)).toBeNull();
    expect(nombreLugar(p)).toBeNull();
  });

  it('modo de compatibilidad: una fila vieja solo trae texto', () => {
    const p = plaza({
      donde: { sedeId: null, trabajoId: null, origen: 'titulo' },
      lugar: 'Mataró',
    });
    expect(nombreLugar(p)).toBe('Mataró');
  });

  it('el municipio que solo repite el organismo no vale como lugar', () => {
    const p = plaza({
      donde: { sedeId: null, trabajoId: null, origen: 'desconocido' },
      empleador: 'Generalitat de Catalunya',
      municipio: 'Generalitat de Catalunya',
    });
    expect(nombreLugar(p)).toBeNull();
  });
});

describe('idsFiltroLugar', () => {
  it('una plaza casa con su municipio y con su comarca', () => {
    const p = plaza({ donde: { sedeId: 'badalona', trabajoId: 'badalona', origen: 'sede' } });
    expect(idsFiltroLugar(p)).toEqual(['badalona', 'comarca-barcelones']);
  });

  it('la que no se sitúa cae en «sin lugar indicado», que es marcable', () => {
    const p = plaza({ donde: { sedeId: null, trabajoId: null, origen: 'desconocido' } });
    expect(idsFiltroLugar(p)).toEqual([SIN_LUGAR]);
  });

  it('una comarca no se repite a sí misma', () => {
    const p = plaza({ donde: { sedeId: 'comarca-barcelones', trabajoId: 'comarca-barcelones', origen: 'sede' } });
    expect(idsFiltroLugar(p)).toEqual(['comarca-barcelones']);
  });
});

describe('lugaresTexto', () => {
  it('da al buscador el sitio y su comarca', () => {
    const p = plaza({ donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } });
    expect(lugaresTexto(p)).toBe('Mataró, Maresme');
  });

  it('sin sitio no aporta texto', () => {
    const p = plaza({ donde: { sedeId: null, trabajoId: null, origen: 'desconocido' } });
    expect(lugaresTexto(p)).toBe('');
  });
});

describe('catalogoDe', () => {
  it('solo saca los sitios que aparecen de verdad, con su cuenta', () => {
    const lista = [
      plaza({ id: '1', donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } }),
      plaza({ id: '2', donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } }),
      plaza({ id: '3', donde: { sedeId: 'badalona', trabajoId: 'badalona', origen: 'sede' } }),
    ];
    const salida = catalogoDe(lista);
    expect(salida.find((s) => s.id === 'mataro')!.n).toBe(2);
    expect(salida.find((s) => s.id === 'lleida')).toBeUndefined();
  });

  it('ordena por cuántas plazas tiene cada uno', () => {
    const lista = [
      plaza({ id: '1', donde: { sedeId: 'badalona', trabajoId: 'badalona', origen: 'sede' } }),
      plaza({ id: '2', donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } }),
      plaza({ id: '3', donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } }),
    ];
    expect(catalogoDe(lista)[0].id).toBe('mataro');
  });
});
