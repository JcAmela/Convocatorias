import { describe, expect, it } from 'vitest';
import { corteDe, toca } from '../supabase/functions/convoca-correo/index.ts';

/**
 * Cuándo le toca a cada suscripción y desde cuándo se considera «nuevo».
 *
 * Son dos decisiones de una línea cada una y las dos fallan en silencio: de
 * un lado dejas a alguien sin su aviso, del otro le mandas dos. Nadie se
 * queja de lo que no le llega, así que conviene que lo diga una prueba.
 */

const ahora = Date.parse('2026-09-18T06:00:00Z');
const haceHoras = (h: number) => new Date(ahora - h * 3_600_000).toISOString();

const sus = (extra: Record<string, unknown> = {}) => ({
  id: 's1',
  usuario_id: 'u1',
  nombre: 'Mi búsqueda',
  filtros: '',
  cadencia: 'diaria',
  ultimo_envio_en: null as string | null,
  creada_en: '2026-09-01T00:00:00Z',
  ...extra,
});

describe('a quién le toca hoy', () => {
  it('a quien no ha recibido nunca, siempre', () => {
    expect(toca(sus(), ahora)).toBe(true);
    expect(toca(sus({ cadencia: 'mensual' }), ahora)).toBe(true);
  });

  it('la diaria espera 20 horas, no 24', () => {
    // La rutina no arranca clavada a la misma hora; con 24 se saltaría un día
    // cada vez que se retrasase un minuto.
    expect(toca(sus({ ultimo_envio_en: haceHoras(19) }), ahora)).toBe(false);
    expect(toca(sus({ ultimo_envio_en: haceHoras(21) }), ahora)).toBe(true);
  });

  it('la semanal no se convierte en diaria', () => {
    const s = (h: number) => sus({ cadencia: 'semanal', ultimo_envio_en: haceHoras(h) });
    expect(toca(s(24), ahora)).toBe(false);
    expect(toca(s(24 * 5), ahora)).toBe(false);
    expect(toca(s(24 * 7), ahora)).toBe(true);
  });

  it('la mensual tampoco', () => {
    const s = (d: number) => sus({ cadencia: 'mensual', ultimo_envio_en: haceHoras(24 * d) });
    expect(toca(s(20), ahora)).toBe(false);
    expect(toca(s(28), ahora)).toBe(true);
  });

  it('una cadencia que no conocemos se trata como la más lenta', () => {
    // Antes equivocarse por exceso que llenarle la bandeja a alguien.
    const s = sus({ cadencia: 'cada-hora', ultimo_envio_en: haceHoras(48) });
    expect(toca(s, ahora)).toBe(false);
  });
});

describe('desde cuándo es «nuevo»', () => {
  it('en el primer envío, desde que se dio de alta', () => {
    // Quien se suscribe hoy no quiere de golpe las mil convocatorias vivas.
    expect(corteDe(sus())).toBe('2026-09-01T00:00:00Z');
  });

  it('después, desde el último envío', () => {
    const s = sus({ ultimo_envio_en: '2026-09-17T06:00:00Z' });
    expect(corteDe(s)).toBe('2026-09-17T06:00:00Z');
  });
});
