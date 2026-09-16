import { describe, expect, it } from 'vitest';
import { esFinDeSemana, fechaLarga, parseFecha, partesEmpleador, urgencia } from './formato';
import { plaza } from './pruebas';

describe('parseFecha', () => {
  it('lee la fecha en hora local, no en UTC', () => {
    // `new Date('2026-09-07')` es UTC y en España puede retroceder un día.
    const f = parseFecha('2026-09-07')!;
    expect(f.getFullYear()).toBe(2026);
    expect(f.getMonth()).toBe(8);
    expect(f.getDate()).toBe(7);
  });

  it('aguanta que venga con hora detrás', () => {
    expect(parseFecha('2026-09-07T10:30:00Z')!.getDate()).toBe(7);
  });

  it('devuelve null en vez de una fecha inventada', () => {
    expect(parseFecha(null)).toBeNull();
    expect(parseFecha('')).toBeNull();
    expect(parseFecha('lo que sea')).toBeNull();
  });
});

describe('fechaLarga', () => {
  it('escribe el mes en español', () => {
    expect(fechaLarga('2026-09-16')).toBe('16 de septiembre de 2026');
  });

  it('sin fecha no escribe nada', () => {
    expect(fechaLarga(null)).toBe('');
  });
});

describe('esFinDeSemana', () => {
  it('reconoce sábado y domingo', () => {
    expect(esFinDeSemana('2026-09-19')).toBe(true);
    expect(esFinDeSemana('2026-09-20')).toBe(true);
    expect(esFinDeSemana('2026-09-21')).toBe(false);
  });
});

describe('urgencia', () => {
  it('lo ya vencido no grita en rojo', () => {
    const u = urgencia(-3);
    expect(u.tono).toBe('calma');
    expect(u.cubo).toBe('cerrada');
    expect(u.etiqueta).toBe('Cerró hace 3 días');
  });

  it('el día del cierre es el último día', () => {
    expect(urgencia(0).etiqueta).toBe('Último día');
    expect(urgencia(0).cubo).toBe('hoy');
  });

  it('mañana y hoy no caen en el mismo cubo', () => {
    expect(urgencia(1).cubo).toBe('3dias');
    expect(urgencia(0).cubo).toBe('hoy');
  });

  it('reparte los cubos por tramos', () => {
    expect(urgencia(3).cubo).toBe('3dias');
    expect(urgencia(7).cubo).toBe('semana');
    expect(urgencia(30).cubo).toBe('mes');
    expect(urgencia(31).cubo).toBe('lejano');
  });

  it('sin plazo tiene su propio cubo', () => {
    expect(urgencia(null).cubo).toBe('sinfecha');
  });
});

describe('partesEmpleador', () => {
  it('parte la casa del organismo', () => {
    const p = plaza({ empleador: "Generalitat de Catalunya · Departament d'Educació" });
    expect(partesEmpleador(p)).toEqual({
      casa: 'Generalitat de Catalunya',
      organismo: "Departament d'Educació",
    });
  });

  it('un ayuntamiento a secas no tiene organismo debajo', () => {
    expect(partesEmpleador(plaza({ empleador: 'Ayuntamiento de Badalona' })))
      .toEqual({ casa: 'Ayuntamiento de Badalona', organismo: null });
  });

  it('con dos puntos medios, el resto se queda junto', () => {
    const p = plaza({ empleador: 'Consejo Comarcal · SECOMSA · Planta' });
    expect(partesEmpleador(p).organismo).toBe('SECOMSA · Planta');
  });
});
