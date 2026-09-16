import { describe, expect, it } from 'vitest';
import { estaCerca, kmDesde, kmEntre, RADIO_CERCA_KM } from './cercania';
import { usaSitios } from './localizacion';
import { saneaSitios } from './datos';
import { plaza, sitio, SITIOS } from './pruebas';

describe('kmEntre', () => {
  it('mide una distancia conocida', () => {
    // Badalona–Mataró son unos 20 km en línea recta.
    expect(kmEntre(SITIOS.badalona, SITIOS.mataro)).toBeGreaterThan(15);
    expect(kmEntre(SITIOS.badalona, SITIOS.mataro)).toBeLessThan(25);
  });

  it('un sitio consigo mismo da cero', () => {
    expect(kmEntre(SITIOS.badalona, SITIOS.badalona)).toBe(0);
  });

  it('sin coordenadas no se inventa una distancia', () => {
    expect(kmEntre(SITIOS.badalona, sitio({ lat: null, lon: null }))).toBeNull();
    expect(kmEntre(null, SITIOS.badalona)).toBeNull();
  });

  it('el cero es una coordenada, no un hueco', () => {
    // La guarda antigua era `!a.lat`, que confundía «vale 0» con «no hay».
    const enElOrigen = sitio({ id: 'origen', lat: 0, lon: 0 });
    expect(kmEntre(enElOrigen, SITIOS.badalona)).not.toBeNull();
  });
});

describe('saneaSitios', () => {
  it('descarta las coordenadas que no caen en Cataluña', () => {
    // El caso real: el catálogo trae Sant Marçal con lon 27660452, y con ella
    // el tablero anunciaba distancias de diez mil kilómetros.
    const roto = saneaSitios({
      'sant-marcal': sitio({ id: 'sant-marcal', nombre: 'Sant Marçal', lat: 39.616326, lon: 27660452 }),
    });
    expect(roto['sant-marcal'].lat).toBeNull();
    expect(roto['sant-marcal'].lon).toBeNull();
  });

  it('deja intacto el resto del sitio, que sigue siendo un sitio', () => {
    const roto = saneaSitios({ x: sitio({ id: 'x', nombre: 'Sant Marçal', lat: 39.6, lon: 27660452 }) });
    expect(roto.x.nombre).toBe('Sant Marçal');
    expect(roto.x.tipo).toBe('municipio');
  });

  it('no toca las coordenadas buenas', () => {
    const bien = saneaSitios({ badalona: SITIOS.badalona });
    expect(bien.badalona.lat).toBe(SITIOS.badalona.lat);
    expect(bien.badalona.lon).toBe(SITIOS.badalona.lon);
  });

  it('media coordenada no sitúa nada', () => {
    const medio = saneaSitios({ x: sitio({ id: 'x', lat: 41.5, lon: null }) });
    expect(medio.x.lat).toBeNull();
  });

  it('aguanta un catálogo ausente', () => {
    expect(saneaSitios(undefined)).toEqual({});
  });
});

describe('distancias de una convocatoria', () => {
  it('sin municipio de referencia no hay distancia que enseñar', () => {
    usaSitios(SITIOS);
    const p = plaza({ donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } });
    expect(kmDesde(p, null)).toBeNull();
  });

  it('mide hasta donde se trabaja, no hasta la sede', () => {
    usaSitios(SITIOS);
    const p = plaza({ donde: { sedeId: 'lleida', trabajoId: 'mataro', origen: 'portal' } });
    const km = kmDesde(p, 'badalona')!;
    expect(km).toBeLessThan(30);
  });

  it('estaCerca no esconde lo que no sabe situar', () => {
    usaSitios(SITIOS);
    const p = plaza({ donde: { sedeId: null, trabajoId: null, origen: 'desconocido' } });
    expect(estaCerca(p, 'badalona')).toBe(true);
  });

  it('estaCerca esconde lo que queda fuera del radio', () => {
    usaSitios(SITIOS);
    const lejos = plaza({ donde: { sedeId: 'lleida', trabajoId: 'lleida', origen: 'sede' } });
    const cerca = plaza({ donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } });
    expect(estaCerca(lejos, 'badalona', RADIO_CERCA_KM)).toBe(false);
    expect(estaCerca(cerca, 'badalona', RADIO_CERCA_KM)).toBe(true);
  });
});
