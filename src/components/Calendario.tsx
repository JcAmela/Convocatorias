import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plaza } from '../lib/tipos';
import { claveDia, fechaCorta, fechaLarga, parseFecha, plural } from '../lib/formato';

/** Cuántos días por delante dibujamos. Más allá el calendario se vacía. */
const DIAS = 45;
const ALTO_PLOT = 140;
const BANDA_EJE = 26;
const HUECO = 2; // el separador de 2px entre barras es superficie, no borde

/**
 * Márgenes del área de dibujo. Antes no había ninguno: las cifras del eje
 * se pintaban en x=0, encima de la primera barra, y la última fecha de abajo
 * se salía por el borde derecho de la tarjeta. Reservar estas dos franjas
 * cuesta 40px de ancho y arregla las dos colisiones.
 */
const MARGEN_IZQ = 30;
const MARGEN_DER = 14;

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
  const anchoPlot = Math.max(120, ancho - MARGEN_IZQ - MARGEN_DER);
  const paso = anchoPlot / DIAS;
  const anchoBarra = Math.max(3, paso - HUECO);
  const total = dias.reduce((s, d) => s + d.n, 0);
  const escala = (n: number) => (n / max) * (ALTO_PLOT - 12);

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
          <h2 id="cal-titulo" className="display text-xl font-semibold">
            Cuándo se cierran los plazos
          </h2>
          <p className="mt-1 max-w-[78ch] text-sm text-ink-3">
            {total > 0
              ? `${plural(total, 'convocatoria cierra', 'convocatorias cierran')} en los próximos ${DIAS} días. Pulsa un día para quedarte solo con ese.`
              : 'Ninguna de las plazas que estás viendo cierra en los próximos 45 días.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTabla((v) => !v)}
          className="hover:border-pine hover:text-pine shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-3 transition-colors"
          aria-pressed={tabla}
        >
          {tabla ? 'Ver el gráfico' : 'Ver los datos'}
        </button>
      </header>

      {tabla ? (
        <div className="scroll-fino max-h-64 overflow-y-auto rounded-lg border border-line-soft">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Convocatorias que cierran cada día. Pulsa una fecha para quedarte solo con ese día.
            </caption>
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr className="text-2xs tracking-[0.07em] text-ink-3 uppercase">
                <th scope="col" className="px-3 py-1.5 font-bold">Día</th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">Convocatorias</th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">Puestos</th>
              </tr>
            </thead>
            <tbody>
              {/* Elegir día también se hace desde aquí. Las barras del gráfico
                  solo responden al ratón, así que sin esto quien navega con el
                  teclado no tenía ninguna forma de usar el filtro por día. */}
              {dias.filter((d) => d.n > 0).map((d) => {
                const elegido = diaElegido === d.clave;
                return (
                  <tr key={d.clave} className={`border-t border-line-soft ${elegido ? 'bg-pine-soft' : ''}`}>
                    <th scope="row" className="px-3 py-1.5 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => onElegirDia(elegido ? null : d.clave)}
                        aria-pressed={elegido}
                        className="hover:text-pine text-left underline-offset-2 hover:underline"
                      >
                        {fechaLarga(d.clave)}
                      </button>
                    </th>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{d.n}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-ink-2">{d.puestos}</td>
                  </tr>
                );
              })}
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
            {/* Rejilla: líneas continuas, un tono por encima de la superficie.
                Las cifras viven en el margen izquierdo, alineadas a la
                derecha y centradas en su línea: ni tapan barras ni obligan a
                buscar a qué altura corresponden. */}
            {marcas.map((v) => (
              <g key={v}>
                <line
                  x1={MARGEN_IZQ} x2={MARGEN_IZQ + anchoPlot}
                  y1={ALTO_PLOT - escala(v)} y2={ALTO_PLOT - escala(v)}
                  stroke="var(--viz-grid)" strokeWidth={1}
                />
                <text
                  x={MARGEN_IZQ - 8} y={ALTO_PLOT - escala(v)}
                  textAnchor="end" dominantBaseline="middle"
                  className="fill-[var(--color-ink-3)] font-mono text-2xs tabular-nums"
                >
                  {v}
                </text>
              </g>
            ))}

            {dias.map((d, i) => {
              const x = MARGEN_IZQ + i * paso;
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
                    x={x - HUECO / 2} y={0} width={paso} height={ALTO_PLOT}
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

            <line
              x1={MARGEN_IZQ} x2={MARGEN_IZQ + anchoPlot}
              y1={ALTO_PLOT} y2={ALTO_PLOT}
              stroke="var(--color-line)" strokeWidth={1}
            />

            {dias.map((d, i) => {
              // Una etiqueta por semana: más marcas se pisarían entre sí.
              if (i % 7 !== 0) return null;
              // La primera se apoya en el eje y la última se ancla por su
              // final, que si no se desbordaba fuera de la tarjeta.
              const ultima = i + 7 >= DIAS;
              return (
                <text
                  key={d.clave}
                  x={MARGEN_IZQ + i * paso} y={ALTO_PLOT + 16}
                  textAnchor={i === 0 ? 'start' : ultima ? 'end' : 'middle'}
                  className="fill-[var(--color-ink-3)] font-mono text-2xs tabular-nums"
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
              className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
              style={{ left: Math.min(Math.max(78, MARGEN_IZQ + encima! * paso), ancho - 78), top: -6 }}
              aria-hidden="true"
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
