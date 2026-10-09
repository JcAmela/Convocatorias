import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallosQueBloquean, motivosParaNoPublicar, UMBRALES } from './lectura';
import { plaza, tablero } from './pruebas';
import type { Tablero } from './tipos';

/**
 * El build no publica lo que no se puede publicar. Antes una API caída daba
 * una web sin plazas y un 200: el peor fallo posible, porque no avisa a nadie.
 */

const AHORA = Date.parse('2026-10-08T05:00:00Z');
const RECIEN = '2026-10-08T04:00:18Z';

const conAbiertas = (n: number, extra: Partial<Tablero> = {}): Tablero =>
  tablero({ generado: RECIEN, abiertas: Array.from({ length: n }, (_, i) => plaza({ id: `cido-${i}` })), ...extra });

describe('motivosParaNoPublicar', () => {
  const ctx = { ahora: AHORA, anteriores: null, permitirBajada: false };

  it('un tablero normal se publica', () => {
    expect(motivosParaNoPublicar(conAbiertas(900), ctx)).toEqual([]);
  });

  it('0 abiertas no se publica', () => {
    expect(motivosParaNoPublicar(conAbiertas(0), ctx).join()).toMatch(/0 convocatorias abiertas/);
  });

  it('una bajada de más del 30 % frente al build anterior no se publica', () => {
    const motivos = motivosParaNoPublicar(conAbiertas(600), { ...ctx, anteriores: 900 });
    expect(motivos.join()).toMatch(/bajan de 900 a 600/);
  });

  it('una bajada del 30 % justo sí se publica', () => {
    expect(motivosParaNoPublicar(conAbiertas(630), { ...ctx, anteriores: 900 })).toEqual([]);
  });

  it('PERMITIR_BAJADA deja pasar la bajada, pero no lo demás', () => {
    const motivos = motivosParaNoPublicar(conAbiertas(0), { ...ctx, anteriores: 900, permitirBajada: true });
    expect(motivos.join()).not.toMatch(/bajan/);
    expect(motivos.join()).toMatch(/0 convocatorias/);
  });

  it('unos datos de más de 26 h no se publican', () => {
    const viejo = new Date(AHORA - (UMBRALES.horasMaximas + 1) * 3_600_000).toISOString();
    expect(motivosParaNoPublicar(conAbiertas(900, { generado: viejo }), ctx).join()).toMatch(/el máximo es 26 h/);
  });

  it('un `generado` que no es una fecha no se publica', () => {
    expect(motivosParaNoPublicar(conAbiertas(900, { generado: 'ayer' }), ctx).join()).toMatch(/no es una fecha/);
  });

  it('un fallo de CIDO no se publica', () => {
    const t = conAbiertas(900, { errores: [{ fuente: 'Generalitat de Catalunya', mensaje: 'timeout' }] as never });
    expect(motivosParaNoPublicar(t, ctx).join()).toMatch(/Generalitat de Catalunya: timeout/);
  });
});

describe('fallosQueBloquean', () => {
  it('los portales Convoca y el archivo no bloquean', () => {
    expect(fallosQueBloquean([
      { fuente: 'Badalona', mensaje: 'x' },
      { fuente: 'El Masnou', mensaje: 'x' },
      { fuente: 'Santa Coloma de Gramenet', mensaje: 'x' },
      { fuente: '(archivo)', mensaje: 'x' },
      'Badalona: x',
    ])).toEqual([]);
  });

  it('el callejero, cualquier CIDO y una fuente desconocida sí', () => {
    expect(fallosQueBloquean([
      { fuente: '(callejero)', mensaje: 'a' },
      { fuente: 'Ayuntamientos de Girona', mensaje: 'b' },
      { fuente: 'Fuente nueva', mensaje: 'c' },
      'algo raro',
    ])).toHaveLength(4);
  });
});

describe('leeTableroEstricto', () => {
  /** Respuestas por trozo de URL; lo que no esté, 404. */
  function red(respuestas: Record<string, () => Response>) {
    const pedidas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const u = String(url);
      pedidas.push(u);
      const clave = Object.keys(respuestas).find((k) => u.includes(k));
      return clave ? respuestas[clave]() : new Response('no', { status: 404 });
    }));
    return pedidas;
  }
  const json = (cuerpo: unknown, status = 200) => () => new Response(JSON.stringify(cuerpo), { status });

  async function lee() {
    const { leeTableroEstricto } = await import('./lectura');
    return leeTableroEstricto();
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('publica lo que llega bien, con su latido a la base', async () => {
    const pedidas = red({
      'convoca-board': json(conAbiertas(900)),
      'convoca_snapshot': json([{ id: 1, updated_at: RECIEN }]),
    });
    const t = await lee();
    expect(t.abiertas).toHaveLength(900);
    expect(pedidas.some((u) => u.includes('/datos/meta.json'))).toBe(true);
    expect(pedidas.some((u) => u.includes('convoca_snapshot?select=id,updated_at'))).toBe(true);
  });

  it('lee la API una sola vez aunque la pidan varias páginas', async () => {
    const pedidas = red({ 'convoca-board': json(conAbiertas(900)), 'convoca_snapshot': json([{ id: 1 }]) });
    const { leeTableroEstricto } = await import('./lectura');
    await Promise.all([leeTableroEstricto(), leeTableroEstricto(), leeTableroEstricto()]);
    expect(pedidas.filter((u) => u.includes('convoca-board'))).toHaveLength(1);
  });

  it('CONVOCA_API cambia de dónde lee', async () => {
    vi.stubEnv('CONVOCA_API', 'https://otra.test/tablero');
    const pedidas = red({ 'otra.test': json(conAbiertas(900)), 'convoca_snapshot': json([{ id: 1 }]) });
    await lee();
    expect(pedidas[0]).toBe('https://otra.test/tablero');
  });

  it('una API que no contesta para el build', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(lee()).rejects.toThrow(/La API no contesta/);
  });

  it('una API que responde 500 para el build', async () => {
    red({ 'convoca-board': json({ error: 'x' }, 500) });
    await expect(lee()).rejects.toThrow(/respondió 500/);
  });

  it('una respuesta que no es un tablero para el build', async () => {
    red({ 'convoca-board': json({ error: 'x' }) });
    await expect(lee()).rejects.toThrow(/no es un tablero/);
  });

  it('juzga lo que se publica: si todo lo que llega es de Convoca, son 0 abiertas', async () => {
    const soloConvoca = tablero({
      generado: RECIEN,
      abiertas: Array.from({ length: 50 }, (_, i) => plaza({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })),
    });
    red({ 'convoca-board': json(soloConvoca) });
    await expect(lee()).rejects.toThrow(/0 convocatorias abiertas/);
  });

  it('compara con el último build publicado y para si faltan muchas', async () => {
    red({ 'convoca-board': json(conAbiertas(500)), '/datos/meta.json': json({ recuentos: { abiertas: 900 } }) });
    await expect(lee()).rejects.toThrow(/bajan de 900 a 500/);
  });

  it('con PERMITIR_BAJADA=1 esa bajada pasa', async () => {
    vi.stubEnv('PERMITIR_BAJADA', '1');
    red({
      'convoca-board': json(conAbiertas(500)),
      '/datos/meta.json': json({ recuentos: { abiertas: 900 } }),
      'convoca_snapshot': json([{ id: 1 }]),
    });
    expect((await lee()).abiertas).toHaveLength(500);
  });

  it('si el recuento publicado no se puede leer, para', async () => {
    red({ 'convoca-board': json(conAbiertas(900)), '/datos/meta.json': json({}, 503) });
    await expect(lee()).rejects.toThrow(/recuento publicado/);
  });

  it('un latido fallido no para el build', async () => {
    red({ 'convoca-board': json(conAbiertas(900)), 'convoca_snapshot': json({ code: 'x' }, 401) });
    expect((await lee()).abiertas).toHaveLength(900);
    expect(console.warn).toHaveBeenCalled();
  });

  it('DATOS=fixture no sale a la red', async () => {
    vi.stubEnv('DATOS', 'fixture');
    const pedidas = red({});
    const t = await lee();
    expect(pedidas).toEqual([]);
    expect(t.abiertas.length).toBeGreaterThan(100);
    // Lo de Convoca que trae el fixture es inventado: nada con un id real.
    const deConvoca = [...t.abiertas, ...t.pendientes, ...t.cerradas].filter((p) => !p.id.startsWith('cido-'));
    expect(deConvoca.length).toBeGreaterThan(0);
    expect(deConvoca.every((p) => p.id.startsWith('00000000-0000-4000-8000-'))).toBe(true);
  });
});
