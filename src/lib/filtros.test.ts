import { describe, expect, it } from 'vitest';
import {
  aplica, aQuery, claseContrato, cuenta, deQuery, FILTROS_INICIALES, hayFiltros, ordena,
  type Filtros,
} from './filtros';
import { usaSitios } from './localizacion';
import { plaza, SITIOS } from './pruebas';

const f = (parcial: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_INICIALES, ...parcial });

describe('claseContrato', () => {
  it('una bolsa es una bolsa aunque la plaza sea fija', () => {
    expect(claseContrato(plaza({ tipo: 'bolsa', fijo: true }))).toBe('bolsa');
  });

  it('separa fija de temporal', () => {
    expect(claseContrato(plaza({ tipo: 'convocatoria', fijo: true }))).toBe('fija');
    expect(claseContrato(plaza({ tipo: 'convocatoria', fijo: false }))).toBe('temporal');
  });
});

describe('aplica', () => {
  const lista = [
    plaza({ id: 'a', titulo: "Oficial 1a de brigada", nivelCodigo: 'AP', fijo: true, tipo: 'convocatoria', diasRestantes: 2 }),
    plaza({ id: 'b', titulo: 'Tècnic superior', nivelCodigo: 'A1', tipo: 'bolsa', diasRestantes: 40 }),
    plaza({ id: 'c', titulo: 'Auxiliar administratiu', nivelCodigo: 'C2', diasRestantes: 20 }),
  ];

  it('sin filtros no descarta nada', () => {
    expect(aplica(lista, f())).toHaveLength(3);
  });

  it('el buscador cruza al catalán', () => {
    expect(aplica(lista, f({ q: 'administrativo' })).map((p) => p.id)).toEqual(['c']);
  });

  it('filtra por nivel de estudios', () => {
    expect(aplica(lista, f({ niveles: ['AP'] })).map((p) => p.id)).toEqual(['a']);
  });

  it('filtra por clase de contrato', () => {
    expect(aplica(lista, f({ contratos: ['fija'] })).map((p) => p.id)).toEqual(['a']);
    expect(aplica(lista, f({ contratos: ['bolsa'] })).map((p) => p.id)).toEqual(['b']);
  });

  it('acumula filtros: todos tienen que cumplirse', () => {
    expect(aplica(lista, f({ niveles: ['AP'], contratos: ['bolsa'] }))).toHaveLength(0);
  });

  it('el filtro de día mira la fecha de cierre', () => {
    const conFecha = [plaza({ id: 'x', fin: '2026-10-01' }), plaza({ id: 'y', fin: '2026-10-02' })];
    expect(aplica(conFecha, f({ dia: '2026-10-01' })).map((p) => p.id)).toEqual(['x']);
  });

  it('puede dejarse un criterio fuera, que es como se cuentan las facetas', () => {
    const sinNivel = aplica(lista, f({ niveles: ['AP'] }), 'niveles');
    expect(sinNivel).toHaveLength(3);
  });
});

describe('cuenta', () => {
  it('dice cuántas quedarían al marcar cada casilla, no cuántas hay en total', () => {
    const lista = [
      plaza({ id: 'a', nivelCodigo: 'AP', tipo: 'bolsa' }),
      plaza({ id: 'b', nivelCodigo: 'C2', tipo: 'bolsa' }),
      plaza({ id: 'c', nivelCodigo: 'C2', tipo: 'convocatoria' }),
    ];
    // Con la bolsa ya marcada, el recuento por nivel solo mira las bolsas.
    const porNivel = cuenta(lista, f({ contratos: ['bolsa'] }), 'niveles', (p) => p.nivelCodigo);
    expect(porNivel).toEqual({ AP: 1, C2: 1 });
  });
});

describe('ordena', () => {
  it('por fecha de cierre, y las sin fecha al final', () => {
    const lista = [
      plaza({ id: 'sin', fin: null }),
      plaza({ id: 'tarde', fin: '2026-12-01' }),
      plaza({ id: 'pronto', fin: '2026-09-20' }),
    ];
    expect(ordena(lista, 'fin').map((p) => p.id)).toEqual(['pronto', 'tarde', 'sin']);
  });

  it('por cercanía, y las que no se sitúan al final', () => {
    usaSitios(SITIOS);
    const lista = [
      plaza({ id: 'lleida', donde: { sedeId: 'lleida', trabajoId: 'lleida', origen: 'sede' } }),
      plaza({ id: 'ninguno', donde: { sedeId: null, trabajoId: null, origen: 'desconocido' } }),
      plaza({ id: 'mataro', donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } }),
    ];
    expect(ordena(lista, 'cercania', 'badalona').map((p) => p.id)).toEqual(['mataro', 'lleida', 'ninguno']);
  });

  it('no altera la lista que recibe', () => {
    const lista = [plaza({ id: 'b', fin: '2026-12-01' }), plaza({ id: 'a', fin: '2026-09-20' })];
    ordena(lista, 'fin');
    expect(lista.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('estado en la URL', () => {
  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const original = f({
      pestana: 'pendientes',
      q: 'oficial brigada',
      niveles: ['C2', 'AP'],
      contratos: ['fija'],
      ambitos: ['municipal'],
      urgencias: ['semana'],
      lugares: ['badalona', 'comarca-barcelones'],
      desde: 'badalona',
      soloCerca: true,
      dia: '2026-10-01',
      orden: 'cercania',
      vista: 'tabla',
    });
    expect(deQuery(aQuery(original))).toEqual(original);
  });

  it('los filtros vacíos no ensucian la URL', () => {
    expect(aQuery(FILTROS_INICIALES)).toBe('');
  });

  it('un valor inventado se descarta en vez de dejar la pantalla vacía', () => {
    const leido = deQuery('ver=inventada&estudios=ZZ&tipo=nosetal&plazo=nunca&orden=azar&dia=ayer');
    expect(leido.pestana).toBe('abiertas');
    expect(leido.niveles).toEqual([]);
    expect(leido.contratos).toEqual([]);
    expect(leido.urgencias).toEqual([]);
    expect(leido.orden).toBe('fin');
    expect(leido.dia).toBeNull();
  });

  it('«solo cerca» sin municipio de referencia no se queda encendido', () => {
    // Un filtro marcado que no filtra nada y sin forma de apagarlo.
    expect(deQuery('cerca=1').soloCerca).toBe(false);
  });

  it('ordenar por cercanía sin saber desde dónde cae al orden por defecto', () => {
    expect(deQuery('orden=cercania').orden).toBe('fin');
  });
});

describe('hayFiltros', () => {
  it('el municipio de referencia no es un filtro: es un ajuste de quien mira', () => {
    expect(hayFiltros(f({ desde: 'badalona' }))).toBe(false);
    expect(hayFiltros(f({ desde: 'badalona', soloCerca: true }))).toBe(true);
  });

  it('el orden y la vista tampoco filtran nada', () => {
    expect(hayFiltros(f({ orden: 'plazas', vista: 'tabla' }))).toBe(false);
  });

  it('un buscador con solo espacios no cuenta', () => {
    expect(hayFiltros(f({ q: '   ' }))).toBe(false);
  });
});
