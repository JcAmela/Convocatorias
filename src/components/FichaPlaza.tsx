import type { Ficha } from '../lib/ficha';
import type { Sitio } from '../lib/tipos';

interface Props {
  ficha: Ficha;
  /**
   * La página de un sitio, si existe. Solo en las páginas estáticas: la ficha
   * del tablero no enlaza fuera de sí misma.
   */
  rutaLugar?: (s: Sitio) => string | null;
}

/**
 * El cuerpo de la ficha de una convocatoria: quién convoca, los avisos y los
 * datos. Sin estado ni eventos, para que sirva igual dentro de la isla del
 * tablero que en una página estática sin JavaScript.
 */
export function FichaPlaza({ ficha, rutaLugar }: Props) {
  return (
    <>
      <div className="py-3">
        <p className="text-pine text-base font-semibold">{ficha.casa}</p>
        {ficha.organismo && <p className="text-base text-ink-2">{ficha.organismo}</p>}
      </div>

      {ficha.avisos.map((a) => (
        <p
          key={a.tipo}
          className={`mb-3 rounded-md px-3 py-2.5 text-base leading-relaxed ${
            a.tipo === 'plazo' ? 'bg-ochre-soft text-ochre' : 'bg-surface-2 text-ink-2'
          }`}
        >
          {a.titulo && <strong className="font-semibold">{a.titulo} </strong>}
          <span lang={a.catalan ? 'ca' : undefined}>{a.texto}</span>
          {a.cola}
        </p>
      ))}

      <dl className="mb-4">
        {ficha.filas.map((f) => {
          const ruta = f.lugar && rutaLugar ? rutaLugar(f.lugar) : null;
          return (
            <div key={f.termino} className="border-t border-line-soft py-2.5">
              <dt className="mb-1 text-sm font-medium text-ink-3">{f.termino}</dt>
              <dd className="text-base leading-relaxed text-ink-2">
                {ruta ? (
                  <a href={ruta} className="text-pine underline-offset-2 hover:underline">{f.texto}</a>
                ) : (
                  <span lang={f.catalan ? 'ca' : undefined}>{f.texto}</span>
                )}
                {f.detalle && <span className="mt-1 block text-sm text-ink-3">{f.detalle}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}
