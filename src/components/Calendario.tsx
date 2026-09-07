import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plaza } from '../lib/tipos';
import { claveDia, fechaCorta, fechaLarga, parseFecha, plural } from '../lib/formato';

/** Cuántos días por delante dibujamos. Más allá el calendario se vacía. */
const DIAS = 45;
const ALTO_PLOT = 132;
const BANDA_EJE = 26;
const HUECO = 2; // el separador de 2px entre barras es superficie, no borde

interface Dia {
  clave: string;
  fecha: Date;
  n: number;
  /** Puestos convocados, no convocatorias: va en el tooltip como matiz. */
  puestos: number;
}

interface Props {
  plazas: Plaza[];
  hoy: string;
  diaElegido: string | null;
  onElegirDia: (clave: string | null) => void;
}

export function Calendario({ plazas, hoy, diaElegido, onElegirDia }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(760);
  const [encima, setEncima] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dias = useMemo<Dia[]>(() => {
    const inicio = parseFecha(hoy) ?? new Date();
    const cubos = new Map<string, Dia>();
    for (let i = 0; i < DIAS; i++) {
      const f = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      cubos.set(claveDia(f), { clave: claveDia(f), fecha: f, n: 0, puestos: 0 });
    }
    for (const p of plazas) {
      if (!p.fin) continue;
      const cubo = cubos.get(p.fin.slice(0, 10));
      if (!cubo) continue;
      cubo.n += 1;
      cubo.puestos += p.plazas ?? 1;
    }
    return [...cubos.values()];
  }, [plazas, hoy]);

  const max = Math.max(1, ...dias.map((d) => d.n));
  const paso = ancho / DIAS;
  const anchoBarra = Math.max(3, paso - HUECO);
  const total = dias.reduce((s, d) => s + d.n, 0);
  const escala = (n: number) => (n / max) * (ALTO_PLOT - 10);

  // Tres líneas de referencia bastan: la rejilla informa, no compite.
  const marcas = useMemo(() => {
    const brutas = [0, max / 2, max].map((v) => Math.round(v));
    return [...new Set(brutas)];
  }, [max]);

  const activo = encima !== null ? dias[encima] : null;

  return (
    <section
      aria-labelledby="cal-titulo"
      className="rounded-xl border border-line bg-surface p-4 sm:p-5"
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="cal-titulo" className="display text-[16px] font-semibold">
            Cuándo se cierran los plazos
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {total > 0
              ? `${plural(total, 'convocatoria cierra', 'convocatorias cierran')} en los próximos ${DIAS} días. Pulsa un día para quedarte solo con ese.`
              : 'Ninguna de las plazas que estás viendo cierra en los próximos 45 días.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTabla((v) => !v)}
          className="hover:border-pine hover:text-pine rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-3 transition-colors"
          aria-pressed={tabla}
        >
          {tabla ? 'Ver el gráfico' : 'Ver los datos'}
        </button>
      </header>

      {tabla ? (
        <div className="scroll-fino max-h-64 overflow-y-auto rounded-lg border border-line-soft">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Convocatorias que cierran cada día</caption>
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr className="text-[10.5px] tracking-[0.07em] text-ink-3 uppercase">
                <th scope="col" className="px-3 py-1.5 font-bold">Día</th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">Convocatorias</th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">Puestos</th>
              </tr>
            </thead>
            <tbody>
              {dias.filter((d) => d.n > 0).map((d) => (
                <tr key={d.clave} className="border-t border-line-soft">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">{fechaLarga(d.clave)}</th>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{d.n}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-ink-2">{d.puestos}</td>
                </tr>
              ))}
              {total === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-ink-3">Sin cierres en este periodo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={caja} className="relative">
          <svg
            width={ancho}
            height={ALTO_PLOT + BANDA_EJE}
            role="img"
            aria-label={`Convocatorias que cierran cada día durante los próximos ${DIAS} días`}
            className="block overflow-visible"
          >
            {/* Rejilla: líneas continuas, un tono por encima de la superficie. */}
            {marcas.map((v) => (
              <g key={v}>
                <line
                  x1={0} x2={ancho}
                  y1={ALTO_PLOT - escala(v)} y2={ALTO_PLOT - escala(v)}
                  stroke="var(--viz-grid)" strokeWidth={1}
                />
                <text
                  x={0} y={ALTO_PLOT - escala(v) - 4}
                  className="fill-[var(--color-ink-3)] font-mono text-[10px] tabular-nums"
                >
                  {v}
                </text>
              </g>
            ))}

            {dias.map((d, i) => {
              const x = i * paso;
              const alto = d.n === 0 ? 0 : Math.max(3, escala(d.n));
              const y = ALTO_PLOT - alto;
              const elegido = diaElegido === d.clave;
              const apagada = diaElegido !== null && !elegido;
              const r = Math.min(4, anchoBarra / 2, alto);
              return (
                <g key={d.clave}>
                  {alto > 0 && (
                    <path
                      d={`M${x} ${ALTO_PLOT} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + anchoBarra - r} ${y} Q${x + anchoBarra} ${y} ${x + anchoBarra} ${y + r} L${x + anchoBarra} ${ALTO_PLOT} Z`}
                      fill={apagada ? 'var(--viz-barra-apagada)' : 'var(--viz-barra)'}
                      className="transition-[fill]"
                    />
                  )}
                  {/* Zona sensible de columna entera: nunca hay que acertarle
                      a una barra de 3px de alto. */}
                  <rect
                    x={x - HUECO / 2} y={0} width={paso} height={ALTO_PLOT + BANDA_EJE}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setEncima(i)}
                    onMouseLeave={() => setEncima(null)}
                    onClick={() => onElegirDia(elegido ? null : d.clave)}
                  />
                  {(encima === i || elegido) && (
                    <rect
                      x={x} y={0} width={anchoBarra} height={ALTO_PLOT}
                      fill="var(--color-pine)" opacity={0.08} pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}

            <line x1={0} x2={ancho} y1={ALTO_PLOT} y2={ALTO_PLOT} stroke="var(--color-line)" strokeWidth={1} />

            {dias.map((d, i) => {
              // Una etiqueta por semana: más marcas se pisarían entre sí.
              if (i % 7 !== 0) return null;
              return (
                <text
                  key={d.clave}
                  x={i * paso} y={ALTO_PLOT + 15}
                  className="fill-[var(--color-ink-3)] font-mono text-[10px] tabular-nums"
                >
                  {/* Con el día y el mes la referencia no se pierde al cambiar
                      de mes, que es donde un "lu 5" a secas confunde. */}
                  {i === 0 ? 'hoy' : fechaCorta(d.clave)}
                </text>
              );
            })}
          </svg>

          {activo && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] whitespace-nowrap shadow-lg"
              style={{ left: Math.min(Math.max(70, encima! * paso), ancho - 70), top: -6 }}
              role="status"
            >
              <p className="font-semibold">{fechaLarga(activo.clave)}</p>
              <p className="text-ink-2">
                {activo.n === 0
                  ? 'Nada cierra este día'
                  : `${plural(activo.n, 'convocatoria', 'convocatorias')} · ${activo.puestos} ${activo.puestos === 1 ? 'puesto' : 'puestos'}`}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
