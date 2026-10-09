import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * El contraste de cada pareja de colores que la web pone una encima de otra,
 * leído directamente de `src/styles/global.css`: si alguien toca un color y
 * rompe una pareja, la CI lo para antes de publicarlo.
 *
 * Las cifras son las de las WCAG 2.2 (nivel AA):
 *   - 4,5:1 para el texto;
 *   - 3:1 para lo que no es texto pero hay que distinguir: el borde de un
 *     campo o de una casilla, el anillo de foco, las barras del gráfico.
 */

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

function bloque(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`No encuentro el bloque ${selector} en global.css`);
  const tokens: Record<string, string> = {};
  for (const [, nombre, valor] of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens[nombre] = valor.trim();
  return tokens;
}

const claro = bloque(/^:root \{([\s\S]*?)^\}/m);
const oscuroSistema = bloque(/^ {2}:root:where\(:not\(\[data-theme='light'\]\)\) \{([\s\S]*?)^ {2}\}/m);
const oscuroElegido = bloque(/^:root\[data-theme='dark'\] \{([\s\S]*?)^\}/m);
const TEMAS = { claro, oscuro: { ...claro, ...oscuroElegido } };

function luminancia(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`«${hex}» no es un color #rrggbb`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** [delante, detrás, mínimo] */
const PAREJAS: [string, string, number][] = [
  // El texto de siempre, sobre los tres fondos.
  ...['ink', 'ink-2', 'ink-3'].flatMap((t) =>
    ['ground', 'surface', 'surface-2'].map((f): [string, string, number] => [t, f, 4.5])),
  // Una fila mientras se pulsa.
  ['ink', 'surface-3', 4.5],
  ['ink-2', 'surface-3', 4.5],
  // El verde como texto: el organismo, los enlaces.
  ['pine', 'ground', 4.5],
  ['pine', 'surface', 4.5],
  ['pine', 'surface-2', 4.5],
  ['pine-ink', 'pine-soft', 4.5],
  // El botón principal: «Ir a apuntarte», «Avísame».
  ['on-pine', 'pine', 4.5],
  // La urgencia, sobre su fondo suave y sobre la tarjeta.
  ['ochre', 'ochre-soft', 4.5],
  ['ochre', 'surface', 4.5],
  ['rust', 'rust-soft', 4.5],
  ['rust', 'surface', 4.5],
  // Lo que no es texto.
  ['line-strong', 'ground', 3],
  ['line-strong', 'surface', 3],
  ['line-strong', 'surface-2', 3],
  ['viz-barra', 'surface', 3],
];

describe('contraste de los colores', () => {
  for (const [tema, tokens] of Object.entries(TEMAS)) {
    it.each(PAREJAS)(`${tema}: %s sobre %s llega a %s:1`, (delante, detras, minimo) => {
      const valor = contraste(tokens[delante], tokens[detras]);
      expect(valor, `${delante} ${tokens[delante]} sobre ${detras} ${tokens[detras]}: ${valor.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(minimo);
    });
  }

  it('el blanco sobre pino en oscuro ya no se usa: daba 2,45:1', () => {
    expect(contraste('#ffffff', TEMAS.oscuro.pine)).toBeLessThan(4.5);
    expect(TEMAS.oscuro['on-pine']).not.toBe('#ffffff');
  });
});

describe('los dos temas oscuros', () => {
  it('el del sistema y el elegido con el botón son la misma lista', () => {
    expect(oscuroSistema).toEqual(oscuroElegido);
  });

  it('cada color del tema claro tiene su versión oscura, salvo los que se calculan', () => {
    const calculados = new Set(['material', 'muelle']);
    const sinOscuro = Object.keys(claro).filter((k) => !calculados.has(k) && !(k in oscuroElegido));
    expect(sinOscuro).toEqual([]);
  });
});
