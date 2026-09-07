import type { Plaza } from '../lib/tipos';
import { fechaCorta, partesEmpleador, tituloLimpio } from '../lib/formato';
import { lugarPrincipal } from '../lib/lugar';
import { PildoraPlazo, PildoraContrato, IconoEstrella } from './piezas';

interface Props {
  plazas: Plaza[];
  guardadas: Set<string>;
  onGuardar: (id: string) => void;
  onAbrir: (plaza: Plaza) => void;
}

/**
 * La vista compacta. Cuando hay trescientas plazas, poder barrer una lista
 * densa con la vista es más rápido que pasar tarjetas, y además es el
 * equivalente accesible del mismo conjunto de datos.
 */
export function Tabla({ plazas, guardadas, onGuardar, onAbrir }: Props) {
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
            const lugar = lugarPrincipal(p);
            const guardada = guardadas.has(p.id);
            return (
              <tr key={p.id} className="hover:bg-surface-2 border-b border-line-soft transition-colors last:border-0">
                <td className="px-3 py-2.5 align-middle">
                  <PildoraPlazo dias={p.diasRestantes} />
                </td>
                <td className="max-w-[340px] px-3 py-2.5 align-middle">
                  <button
                    type="button"
                    lang="ca"
                    onClick={() => onAbrir(p)}
                    className="hover:text-pine text-left font-medium transition-colors"
                  >
                    {tituloLimpio(p)}
                  </button>
                  <span className="ml-2 inline-block align-middle">
                    <PildoraContrato plaza={p} />
                  </span>
                </td>
                <td className="text-pine max-w-[190px] px-3 py-2.5 align-middle text-sm">{casa}</td>
                <td className={`px-3 py-2.5 align-middle text-sm ${p.lejos ? 'text-ochre font-semibold' : 'text-ink-3'}`}>
                  {lugar ?? '—'}
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
