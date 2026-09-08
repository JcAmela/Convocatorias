import { memo } from 'react';
import type { Plaza } from '../lib/tipos';
import {
  fechaLarga, partesEmpleador, tituloLimpio, esActualizacion, enEspanol,
} from '../lib/formato';
import { nombreLugar, esSoloSede } from '../lib/localizacion';
import { kmDesde } from '../lib/cercania';
import { PildoraPlazo, PildoraContrato, IconoEstrella, IconoPin, IconoSalir } from './piezas';

interface Props {
  plaza: Plaza;
  /** Municipio desde el que se miden las distancias. `null` = sin elegir. */
  desde: string | null;
  guardada: boolean;
  onGuardar: (id: string) => void;
  onAbrir: (plaza: Plaza) => void;
}

function TarjetaBase({ plaza, desde, guardada, onGuardar, onAbrir }: Props) {
  const { casa, organismo } = partesEmpleador(plaza);
  const lugar = nombreLugar(plaza);
  const km = kmDesde(plaza, desde);
  // Cuando no hay fecha, el aviso del origen es todo lo que se sabe del
  // plazo: dice si está abierto de forma permanente o a la espera del DOGC.
  // Estaba solo en la ficha, así que en la pestaña «Sin plazo aún» la tarjeta
  // no contaba nada.
  const nota = !plaza.fin && plaza.notaPlazo ? enEspanol(plaza.notaPlazo) : null;

  return (
    <article
      className="group focus-within:border-pine/40 hover:border-pine/40 relative flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:shadow-alza-1"
    >
      <div className="flex items-center gap-2">
        <PildoraPlazo dias={plaza.diasRestantes} />
        <PildoraContrato plaza={plaza} />
        <button
          type="button"
          onClick={() => onGuardar(plaza.id)}
          aria-pressed={guardada}
          aria-label={guardada ? 'Quitar de guardadas' : 'Guardar esta plaza'}
          className={`toque-amplio relative z-10 -mt-1 -mr-1.5 ml-auto rounded-md p-1.5 transition-colors ${
            guardada ? 'text-ochre' : 'estrella text-ink-3 hover:text-ink'
          }`}
        >
          <IconoEstrella activa={guardada} />
        </button>
      </div>

      {esActualizacion(plaza) && (
        <p className="bg-pine-soft text-pine-ink -mb-0.5 rounded-md px-2 py-1 text-xs font-semibold">
          Ya avisada antes: su plazo por fin se ha abierto
        </p>
      )}

      {/* El título llega en catalán aunque la página esté en español; marcarlo
          evita que un lector de pantalla lo pronuncie con las reglas del
          castellano. */}
      <h3 lang="ca" className="display text-lg font-semibold text-balance">
        {/* La tarjeta entera es clicable, pero el enlace real está en el
            título para que el foco de teclado y el lector de pantalla lo
            encuentren donde se espera. */}
        <button
          type="button"
          onClick={() => onAbrir(plaza)}
          className="foco-en-capa text-left before:absolute before:inset-0 before:rounded-xl before:content-['']"
        >
          {tituloLimpio(plaza)}
        </button>
      </h3>

      <div className="text-sm leading-snug">
        <p className="text-pine font-semibold">{casa}</p>
        {organismo && <p className="text-ink-2">{organismo}</p>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm text-ink-3">
        {lugar && (
          <span className="inline-flex items-center gap-1">
            <IconoPin />
            {lugar}
            {esSoloSede(plaza) && (
              <abbr title="Es la sede del organismo; el anuncio no dice dónde se trabaja" className="cursor-help no-underline">*</abbr>
            )}
            {km !== null && ` · a ${km} km`}
          </span>
        )}
        {plaza.plazas ? <span>{plaza.plazas} {plaza.plazas === 1 ? 'puesto' : 'puestos'}</span> : null}
      </div>

      {/* La columna de etiquetas va a un ancho fijo, no `auto`. Con `auto` la
          fija el rótulo más largo de CADA tarjeta, y 48 de las 776 plazas no
          traen nivel de estudios: esas pierden la fila «Estudios», su columna
          encoge y sus datos arrancan veintidós píxeles a la izquierda que los
          de la tarjeta de al lado. En una rejilla eso se lee de un vistazo. */}
      <dl className="grid grid-cols-[4rem_1fr] items-baseline gap-x-3 gap-y-1.5 border-t border-line-soft pt-3 text-sm">
        {plaza.nivelEstudios && (
          <>
            <dt className="text-2xs font-bold tracking-[0.07em] text-ink-3 uppercase">Estudios</dt>
            <dd className="text-ink-2">{plaza.nivelEstudios}</dd>
          </>
        )}
        <dt className="text-2xs font-bold tracking-[0.07em] text-ink-3 uppercase">
          {plaza.fin ? 'Hasta' : 'Plazo'}
        </dt>
        <dd className="font-medium text-ink">
          {plaza.fin ? (
            fechaLarga(plaza.fin)
          ) : nota ? (
            <span lang={nota.traducida ? undefined : 'ca'}>{nota.texto}</span>
          ) : (
            'Todavía sin publicar'
          )}
        </dd>
      </dl>

      {plaza.enlace && (
        <a
          href={plaza.enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="text-pine hover:border-pine relative z-10 mt-1 inline-flex w-fit items-center gap-1.5 border-b-2 border-transparent pb-px text-base font-semibold transition-colors"
        >
          Ir a apuntarte
          <IconoSalir />
        </a>
      )}
    </article>
  );
}

export const Tarjeta = memo(TarjetaBase);
