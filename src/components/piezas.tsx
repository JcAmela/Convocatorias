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
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11.5px] font-medium whitespace-nowrap ${TONO[u.tono]}`}
    >
      {u.tono === 'critica' && (
        <svg viewBox="0 0 8 8" className="size-1.5 shrink-0" aria-hidden="true">
          <circle cx="4" cy="4" r="4" fill="currentColor" />
        </svg>
      )}
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
    <span className={`rounded-full border px-2 py-[1px] text-[11px] font-semibold tracking-wide ${estilo}`}>
      {texto}
    </span>
  );
}

/* ------------------------------------------------------------------ varios */

export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">{children}</span>
  );
}

export function IconoEstrella({ activa }: { activa: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[17px]" aria-hidden="true">
      <path
        d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"
        fill={activa ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconoFuera() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function IconoSalir() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 5h6v6M19 5l-8.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14.5V18a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 015 18V8a1.5 1.5 0 011.5-1.5H10" strokeLinecap="round" />
    </svg>
  );
}
