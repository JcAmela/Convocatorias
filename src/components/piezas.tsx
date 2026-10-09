import type { ReactNode } from 'react';
import type { Plaza } from '../lib/tipos';
import { urgencia, type TonoUrgencia } from '../lib/formato';

/* --------------------------------------------------------------- píldoras */

const TONO: Record<TonoUrgencia, string> = {
  critica: 'bg-rust-soft text-rust',
  seria: 'bg-ochre-soft text-ochre',
  aviso: 'bg-surface-2 text-ink-2',
  calma: 'bg-surface-2 text-ink-3',
  sinfecha: 'bg-pine-soft text-pine-ink',
};

/**
 * El plazo es el único dato que puede gritar, así que es lo único que lleva
 * color de estado. Nunca va solo: el texto dice los días, no el color.
 */
export function PildoraPlazo({ dias }: { dias: number | null }) {
  const u = urgencia(dias);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium whitespace-nowrap tabular-nums ${TONO[u.tono]}`}
    >
      {u.tono === 'critica' && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />}
      {u.etiqueta}
    </span>
  );
}

/** Fija / Temporal / Bolsa: la otra decisión grande de quien busca trabajo. */
export function PildoraContrato({ plaza }: { plaza: Plaza }) {
  const bolsa = plaza.tipo === 'bolsa';
  const texto = bolsa ? 'Bolsa' : plaza.fijo ? 'Fija' : 'Temporal';
  const estilo = plaza.fijo
    ? 'border-pine/35 text-pine-ink bg-pine-soft'
    : 'border-line text-ink-3';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${estilo}`}>
      {texto}
    </span>
  );
}

/* ------------------------------------------------------------------ iconos */

/**
 * Todos los iconos de la web, con el mismo trazo de 1,75 px (global.css lo
 * mantiene igual a cualquier tamaño) y dibujados en la misma rejilla de 24.
 * Son decorativos: el texto o el `aria-label` del botón dicen lo que hacen.
 */
const TRAZOS = {
  estrella: <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />,
  pin: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  salir: (
    <>
      <path d="M13 5h6v6M19 5l-8.5 8.5" />
      <path d="M18 14.5V18a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 015 18V8a1.5 1.5 0 011.5-1.5H10" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  abajo: <path d="M6 9l6 6 6-6" />,
  marca: <path d="M5 12.5l4.5 4.5L19 7" />,
  buscar: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
  correo: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  luna: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  pantalla: (
    <>
      <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
      <path d="M8 20.5h8" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, className = 'size-4', relleno = false }: {
  nombre: NombreIcono;
  /** El tamaño, en clases de Tailwind. */
  className?: string;
  /** Relleno del color del texto: la estrella de una plaza guardada. */
  relleno?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icono shrink-0 ${className}`}
      aria-hidden="true"
      fill={relleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
