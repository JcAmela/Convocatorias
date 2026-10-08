// Rehace `pruebas/fixtures/tablero.json` a partir de una copia del tablero.
//
//   node pruebas/fixtures/genera.mjs ruta/a/la/copia.json
//
// La copia se baja con una GET sin `refresh` a la Edge Function (nunca con
// `refresh=1`, que rasca las fuentes). El fixture se queda solo con plazas de
// CIDO, que son datos abiertos con licencia CC BY 4.0, y les añade cuatro
// plazas de Convoca INVENTADAS para cubrir sus casos: los datos reales de esos
// portales no se reproducen en el repositorio.
//
// La muestra es determinista —la misma copia da el mismo fixture— y se
// asegura de que salga cada variante que la web pinta distinto: cada ámbito,
// tipo y nivel, fijas y temporales, sin fecha de fin, con aviso de plazo y
// cada origen del lugar.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , origen] = process.argv;
if (!origen) {
  console.error('Uso: node pruebas/fixtures/genera.mjs <copia.json>');
  process.exit(1);
}

const copia = JSON.parse(readFileSync(origen, 'utf8'));
const deCido = (lista) => lista.filter((p) => typeof p.id === 'string' && p.id.startsWith('cido-'));

/** Una de cada `paso`, más la primera de cada variante que no haya salido. */
function muestra(lista, cuantas, variantes) {
  const paso = Math.max(1, Math.floor(lista.length / cuantas));
  const elegidas = new Map();
  for (let i = 0; i < lista.length && elegidas.size < cuantas; i += paso) elegidas.set(lista[i].id, lista[i]);
  for (const variante of variantes) {
    const vistas = new Set([...elegidas.values()].map(variante));
    for (const p of lista) {
      const v = variante(p);
      if (!vistas.has(v)) { elegidas.set(p.id, p); vistas.add(v); }
    }
  }
  // Mismo orden que en la copia.
  return lista.filter((p) => elegidas.has(p.id));
}

const VARIANTES = [
  (p) => p.ambito,
  (p) => p.tipo,
  (p) => String(p.nivelCodigo),
  (p) => String(p.fijo),
  (p) => String(p.fin === null),
  (p) => String(p.notaPlazo !== null),
  (p) => p.donde?.origen,
];

const abiertas = muestra(deCido(copia.abiertas), 140, VARIANTES);
const pendientes = muestra(deCido(copia.pendientes), 30, VARIANTES);
const cerradas = muestra(deCido(copia.cerradas), 30, VARIANTES);

/** Una plaza de Convoca inventada. Ningún dato sale de esos portales. */
function inventada(n, cambios) {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    titulo: `Plaza inventada ${n} para las pruebas`,
    empleador: 'Ayuntamiento de Badalona',
    donde: { sedeId: 'badalona', trabajoId: 'badalona', origen: 'portal' },
    municipio: 'badalona',
    lugar: null,
    ambito: 'municipal',
    tipo: 'convocatoria',
    fijo: false,
    tipoEtiqueta: 'Convocatoria de plaza',
    contratoOriginal: null,
    fin: null,
    inicio: null,
    publicado: copia.hoy,
    diasRestantes: null,
    notaPlazo: null,
    plazas: 1,
    nivelCodigo: 'C2',
    nivelEstudios: null,
    titulacion: null,
    otrosRequisitos: null,
    seleccion: null,
    lejos: false,
    enlace: `https://example.com/convocatoria-inventada-${n}`,
    fichaOficial: null,
    fuente: 'convoca',
    estadoOrigen: null,
    ...cambios,
  };
}

const masDias = (dias) => new Date(Date.parse(copia.hoy) + dias * 86_400_000).toISOString().slice(0, 10);

abiertas.push(
  inventada(1, { fin: masDias(10), diasRestantes: 10, fijo: true }),
  inventada(2, {
    tipo: 'bolsa', tipoEtiqueta: 'Bolsa de trabajo', fin: masDias(3), diasRestantes: 3,
    empleador: 'Ayuntamiento de El Masnou', municipio: 'masnou',
    donde: { sedeId: 'masnou', trabajoId: 'masnou', origen: 'portal' },
  }),
);
pendientes.push(inventada(3, {
  empleador: 'Ayuntamiento de Santa Coloma de Gramenet', municipio: 'santa-coloma-gramenet',
  donde: { sedeId: 'santa-coloma-gramenet', trabajoId: 'santa-coloma-gramenet', origen: 'portal' },
}));
cerradas.push(inventada(4, { fin: masDias(-5), diasRestantes: -5 }));

const plazasAbiertas = abiertas.reduce((s, p) => s + (Number(p.plazas) || 0), 0);
const tablero = {
  generado: copia.generado,
  hoy: copia.hoy,
  abiertas,
  pendientes,
  cerradas,
  sitios: copia.sitios,
  resumen: {
    abiertas: abiertas.length,
    pendientes: pendientes.length,
    cerradas: cerradas.length,
    plazas: plazasAbiertas,
    fijas: abiertas.filter((p) => p.fijo === true).length,
    temporales: abiertas.filter((p) => p.fijo === false).length,
    cierranEn7Dias: abiertas.filter((p) => typeof p.diasRestantes === 'number' && p.diasRestantes <= 7).length,
  },
  errores: [],
};

// Una plaza o un sitio por línea: legible en un diff y sin el doble de tamaño
// que daría la sangría completa.
const lista = (xs) => `[\n${xs.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]`;
const sitios = Object.entries(tablero.sitios).sort(([a], [b]) => a.localeCompare(b));
const texto = [
  '{',
  `  "generado": ${JSON.stringify(tablero.generado)},`,
  `  "hoy": ${JSON.stringify(tablero.hoy)},`,
  `  "abiertas": ${lista(tablero.abiertas)},`,
  `  "pendientes": ${lista(tablero.pendientes)},`,
  `  "cerradas": ${lista(tablero.cerradas)},`,
  `  "sitios": {\n${sitios.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n  },`,
  `  "resumen": ${JSON.stringify(tablero.resumen)},`,
  '  "errores": []',
  '}',
  '',
].join('\n');

const destino = new URL('./tablero.json', import.meta.url);
writeFileSync(destino, texto);
console.log(`${abiertas.length} abiertas, ${pendientes.length} pendientes, ${cerradas.length} cerradas, ${sitios.length} sitios, ${Math.round(texto.length / 1024)} KB`);
