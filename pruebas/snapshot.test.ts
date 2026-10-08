import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Una visita no puede rascar las fuentes. Antes, si la copia tenía más de
 * tres horas o era de otro día, cualquier GET relanzaba el scraping entero:
 * diez consultas a CIDO y a Convoca y una escritura en la base por cada
 * navegador que llegaba tarde. Ahora eso solo lo hace `?refresh=1`, el cron.
 *
 * La prueba llama al manejador que la función registra con `Deno.serve` y
 * cuenta las peticiones que salen: sin `refresh` tiene que salir una sola, la
 * lectura de la copia.
 */

type Manejador = (req: Request) => Promise<Response>;
let servir: Manejador;

beforeAll(async () => {
  await import('../supabase/functions/convoca-board/index.ts');
  const servidas = (globalThis as Record<string, unknown>).__servidas as Manejador[];
  servir = servidas[servidas.length - 1];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Un fetch falso que contesta la lectura de la copia y anota todo lo demás. */
function fuente(copia: { data: unknown; updated_at: string } | null) {
  const pedidas: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    pedidas.push(String(url));
    if (String(url).includes('convoca_snapshot')) {
      return new Response(JSON.stringify(copia ? [copia] : []), { status: 200 });
    }
    return new Response('no debería salir', { status: 599 });
  }));
  return pedidas;
}

const pide = (q = '') => servir(new Request(`https://x.test/convoca-board${q}`));

describe('convoca-board sin refresh', () => {
  it('sirve la copia de ayer marcada como stale, sin rascar nada', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const pedidas = fuente({
      data: { generado: '2026-10-07T04:00:12Z', hoy: '2026-10-07', abiertas: [] },
      updated_at: '2026-10-07T04:00:12Z',
    });

    const res = await pide();
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.cache).toBe('stale');
    expect(cuerpo.generado).toBe('2026-10-07T04:00:12Z');
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]).toContain('convoca_snapshot');
  });

  it('una copia de hoy pero de hace más de tres horas también se sirve tal cual', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const pedidas = fuente({
      data: { generado: '2026-10-08T04:00:12Z', hoy: '2026-10-08' },
      updated_at: '2026-10-08T04:00:12Z',
    });

    const cuerpo = await (await pide()).json();

    expect(cuerpo.cache).toBe('stale');
    expect(cuerpo.generado).toBe('2026-10-08T04:00:12Z');
    expect(pedidas).toHaveLength(1);
  });

  it('la copia reciente y del mismo día sale como hit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T05:00:00Z'));
    fuente({
      data: { generado: '2026-10-08T04:00:12Z', hoy: '2026-10-08' },
      updated_at: '2026-10-08T04:00:12Z',
    });

    expect((await (await pide()).json()).cache).toBe('hit');
  });

  it('sin ninguna copia contesta 503 y tampoco rasca', async () => {
    const pedidas = fuente(null);

    const res = await pide();

    expect(res.status).toBe(503);
    expect(pedidas).toHaveLength(1);
  });

  it('con refresh=1 sí va a las fuentes', async () => {
    const pedidas = fuente(null);

    await pide('?refresh=1');

    expect(pedidas.some((u) => u.includes('diba.cat') || u.includes('convoca.online'))).toBe(true);
  });
});
