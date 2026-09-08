import type { Plaza } from '../lib/tipos';
import { fechaCorta, partesEmpleador, tituloLimpio } from '../lib/formato';
import { nombreLugar, esSoloSede } from '../lib/localizacion';
import { kmDesde } from '../lib/cercania';
import { PildoraPlazo, PildoraContrato, IconoEstrella } from './piezas';

interface Props {
  plazas: Plaza[];
  /** Municipio desde el que se miden las distancias. `null` = sin elegir. */
  desde: string | null;
  guardadas: Set<string>;
  onGuardar: (id: string) => void;
  onAbrir: (plaza: Plaza) => void;
}

/**
 * La vista compacta. Cuando hay trescientas plazas, poder barrer una lista
 * densa con la vista es más rápido que pasar tarjetas, y además es el
 * equivalente accesible del mismo conjunto de datos.
 */
export function Tabla({ plazas, desde, guardadas, onGuardar, onAbrir }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[760px] border-collapse text-base">
        <caption className="sr-only">Plazas que cumplen los filtros</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-2xs tracking-[0.08em] text-ink-3 uppercase">
            <th scope="col" className="px-3 py-2 font-bold">Plazo</th>
            <th scope="col" className="px-3 py-2 font-bold">Puesto</th>
            <th scope="col" className="px-3 py-2 font-bold">Quién convoca</th>
            <th scope="col" className="px-3 py-2 font-bold">Dónde</th>
            <th scope="col" className="px-3 py-2 text-right font-bold">Puestos</th>
            <th scope="col" className="px-3 py-2 font-bold">Cierra</th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Guardar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plazas.map((p) => {
            const { casa } = partesEmpleador(p);
            const lugar = nombreLugar(p);
            const km = kmDesde(p, desde);
            const guardada = guardadas.has(p.id);
            return (
              <tr key={p.id} className="hover:bg-surface-2 border-b border-line-soft transition-colors last:border-0">
                <td className="px-3 py-2.5 align-middle">
                  <PildoraPlazo dias={p.diasRestantes} />
                </td>
                {/* El tope de dos líneas es lo que hace compacta a la vista
                    compacta. Sin él las filas iban de 46 a 109px según lo
                    largo que fuera el título: más del doble de variación, y
                    con ella se pierde el renglón regular que es justo la
                    razón de mirar una tabla en vez de las tarjetas. El título
                    y la píldora van como dos piezas de una fila flexible, así
                    que recortar el uno no se lleva por delante al otro.
                    (Aquí había un `max-w-[340px]` que no hacía nada: con
                    `table-layout: auto` el CSS ignora el ancho máximo de una
                    celda, y la columna se dibujaba a 451px.) */}
                <td className="px-3 py-2.5 align-middle">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      lang="ca"
                      title={tituloLimpio(p)}
                      onClick={() => onAbrir(p)}
                      className="hover:text-pine line-clamp-2 text-left font-medium transition-colors"
                    >
                      {tituloLimpio(p)}
                    </button>
                    <span className="mt-px shrink-0">
                      <PildoraContrato plaza={p} />
                    </span>
                  </div>
                </td>
                <td className="text-pine max-w-[190px] px-3 py-2.5 align-middle text-sm">{casa}</td>
                <td className="px-3 py-2.5 align-middle text-sm text-ink-3">
                  {lugar ?? '—'}
                  {/* El asterisco avisa de que ese municipio es la sede del
                      organismo y no el destino: el anuncio no lo dice. */}
                  {lugar && esSoloSede(p) && (
                    <abbr title="Es la sede del organismo; el anuncio no dice dónde se trabaja" className="ml-0.5 cursor-help no-underline text-ink-3">*</abbr>
                  )}
                  {km !== null && <span className="ml-1.5 font-mono text-2xs text-ink-3">{km} km</span>}
                </td>
                <td className="px-3 py-2.5 text-right align-middle font-mono text-sm tabular-nums text-ink-2">
                  {p.plazas ?? '—'}
                </td>
                <td className="px-3 py-2.5 align-middle font-mono text-sm whitespace-nowrap tabular-nums">
                  {p.fin ? fechaCorta(p.fin) : '—'}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  <button
                    type="button"
                    onClick={() => onGuardar(p.id)}
                    aria-pressed={guardada}
                    aria-label={guardada ? `Quitar ${tituloLimpio(p)} de guardadas` : `Guardar ${tituloLimpio(p)}`}
                    className={`rounded p-0.5 transition-colors ${guardada ? 'text-ochre' : 'text-ink-3 hover:text-ink'}`}
                  >
                    <IconoEstrella activa={guardada} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
