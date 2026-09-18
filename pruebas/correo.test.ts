import { describe, expect, it } from 'vitest';
import { asuntoCorreo, correoHtml, correoTexto, type DatosCorreo } from '../supabase/functions/_shared/correo.ts';
import { plaza, SITIOS } from '../src/lib/pruebas';

const base = (plazas = [plaza()]): DatosCorreo => ({
  plazas,
  catalogo: SITIOS,
  desde: 'badalona',
  nombreBusqueda: 'Fijas a mi alcance',
  urlTablero: 'https://ejemplo.test/?tipo=fija',
  urlGestion: 'https://ejemplo.test/suscripciones?t=abc',
  urlBaja: 'https://ejemplo.test/baja?t=abc',
});

describe('el asunto', () => {
  it('dice cuántas son', () => {
    expect(asuntoCorreo(base([plaza()]))).toBe('1 convocatoria nueva');
    expect(asuntoCorreo(base([plaza({ id: 'a' }), plaza({ id: 'b' })]))).toBe('2 convocatorias nuevas');
  });

  it('avisa de lo que corre prisa, que es lo que hace abrir el correo', () => {
    const d = base([plaza({ id: 'a', diasRestantes: 1 }), plaza({ id: 'b', diasRestantes: 40 })]);
    expect(asuntoCorreo(d)).toBe('2 convocatorias nuevas, 1 cierran ya');
  });

  it('lo ya vencido no cuenta como urgente', () => {
    const d = base([plaza({ diasRestantes: -2 })]);
    expect(asuntoCorreo(d)).toBe('1 convocatoria nueva');
  });

  it('sin novedades lo dice en el asunto, no con un correo vacío', () => {
    expect(asuntoCorreo(base([]))).toBe('Sin novedades en «Fijas a mi alcance»');
  });
});

describe('el HTML', () => {
  it('escapa lo que viene de la fuente', () => {
    // Los títulos los teclea quien publica el anuncio: no entran crudos.
    const d = base([plaza({ titulo: '1 plaça de <script>alert("x")</script> & Cia' })]);
    const html = correoHtml(d);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; Cia');
  });

  it('lleva siempre el enlace de baja', () => {
    // Sin esto no se puede enviar a nadie: es obligatorio y es de sentido común.
    expect(correoHtml(base())).toContain('https://ejemplo.test/baja?t=abc');
    expect(correoHtml(base([]))).toContain('https://ejemplo.test/baja?t=abc');
  });

  it('no usa flex ni grid, que medio cliente de correo los tira', () => {
    const html = correoHtml(base());
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).toContain('role="presentation"');
  });

  it('no enlaza a ninguna hoja de estilos ni script externos', () => {
    const html = correoHtml(base());
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
  });

  it('marca en catalán el título, que es el idioma en que llega', () => {
    expect(correoHtml(base())).toContain('lang="ca"');
  });

  it('avisa del asterisco solo cuando hay alguna sede sin destino', () => {
    const conSede = plaza({ donde: { sedeId: 'badalona', trabajoId: null, origen: 'desconocido' } });
    expect(correoHtml(base([conSede]))).toContain('Es la sede del organismo');
    const conTrabajo = plaza({ donde: { sedeId: 'mataro', trabajoId: 'mataro', origen: 'sede' } });
    expect(correoHtml(base([conTrabajo]))).not.toContain('Es la sede del organismo');
  });

  it('una convocatoria sin enlace lo dice en vez de dejar un botón muerto', () => {
    const d = base([plaza({ enlace: null, fichaOficial: null })]);
    expect(correoHtml(d)).toContain('no trae enlace');
  });
});

describe('el texto plano', () => {
  it('existe y lleva los enlaces', () => {
    // Un correo solo-HTML tiene más papeletas de acabar en spam.
    const t = correoTexto(base());
    expect(t).toContain('Darse de baja: https://ejemplo.test/baja?t=abc');
    expect(t).toContain('Ver en el tablero:');
  });

  it('no arrastra etiquetas HTML', () => {
    expect(correoTexto(base())).not.toMatch(/<[a-z]/i);
  });
});
