import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardaPendiente, leePendiente } from './cuenta';

/**
 * La suscripción fantasma: entrar desde «Mis búsquedas» dejaba anotado un
 * borrador sin filtros ni nombre, y Avísame lo guardaba al volver como «todo
 * Cataluña, cada día» sin que nadie lo hubiera pedido.
 */

function almacen(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

beforeEach(() => vi.stubGlobal('localStorage', almacen()));
afterEach(() => vi.unstubAllGlobals());

describe('leePendiente', () => {
  it('tira el borrador vacío y sin nombre, y lo borra', () => {
    guardaPendiente({ filtros: '', nombre: '', cadencia: 'diaria' });
    expect(leePendiente()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('una búsqueda sin filtros pero con nombre es «todo Cataluña» pedido a propósito', () => {
    guardaPendiente({ filtros: '', nombre: 'Todo', cadencia: 'semanal' });
    expect(leePendiente()).toEqual({ filtros: '', nombre: 'Todo', cadencia: 'semanal' });
  });

  it('una búsqueda con filtros se lee tal cual', () => {
    guardaPendiente({ filtros: 'estudios=C2', nombre: '', cadencia: 'diaria' });
    expect(leePendiente()?.filtros).toBe('estudios=C2');
  });
});
