import { memo } from 'react';
import type { Plaza } from '../lib/tipos';
import {
  fechaCorta, partesEmpleador, tituloLimpio, esActualizacion, enEspanol, urgencia, NIVEL_CORTO,
  type TonoUrgencia,
} from '../lib/formato';
import { nombreLugar, esSoloSede, AVISO_SEDE } from '../lib/localizacion';
import { kmDesde } from '../lib/cercania';
import { Icono } from './piezas';

interface Props {
  plaza: Plaza;
  /** Municipio desde el que se miden las distancias. `null` = sin elegir. */
  desde: string | null;
  guardada: boolean;
  onGuardar: (id: string) => void;
  onAbrir: (plaza: Plaza) => void;
}

/** El color del plazo, que es lo único de la tarjeta que puede gritar. */
const COLOR_PLAZO: Record<TonoUrgencia, string> = {
  critica: 'text-rust',
  seria: 'text-ochre',
  aviso: 'text-ink',
  calma: 'text-ink-2',
  sinfecha: 'text-ink-2',
};

/** La franja de la izquierda, solo cuando quedan 7 días o menos. */
const FRANJA: Partial<Record<TonoUrgencia, string>> = {
  critica: 'bg-rust',
  seria: 'bg-ochre',
};

/**
 * Una convocatoria en la lista. De arriba abajo, lo que decide si merece la
 * pena abrirla: cuánto queda, qué puesto es, quién lo convoca y dónde. Lo
 * demás —los estudios con detalle, la fecha exacta, el enlace para
 * apuntarse— está en la ficha, a un toque.
 *
 * El orden visual no es el del DOM: el plazo se ve primero, pero el título va
 * antes en el código, para que un lector de pantalla que salta de título en
 * título oiga primero el puesto, y la estrella va después del título.
 */
function TarjetaBase({ plaza, desde, guardada, onGuardar, onAbrir }: Props) {
  const { casa, organismo } = partesEmpleador(plaza);
  const lugar = nombreLugar(plaza);
  const km = kmDesde(plaza, desde);
  const u = urgencia(plaza.diasRestantes);
  // Sin fecha, el aviso del origen es todo lo que se sabe del plazo: si está
  // abierto de forma permanente o a la espera del DOGC.
  const nota = !plaza.fin && plaza.notaPlazo ? enEspanol(plaza.notaPlazo) : null;
  const estudios = plaza.nivelCodigo ? NIVEL_CORTO[plaza.nivelCodigo] : null;
  const franja = FRANJA[u.tono];

  return (
    <article className="tarjeta group focus-within:border-pine/40 hover:border-pine/40 relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface px-4 py-3 hover:shadow-alza-1">
      {franja && <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${franja}`} />}

      {/* El título llega en catalán aunque la página esté en español; marcarlo
          evita que un lector de pantalla lo pronuncie con las reglas del
          castellano. La tarjeta entera es pulsable, pero el botón real está en
          el título para que el foco y el lector lo encuentren donde se espera.
          Sigue siendo un botón hasta que existan las fichas estáticas (F3). */}
      <h3 lang="ca" className="order-2 mt-1 text-lg font-semibold text-balance">
        <button
          type="button"
          onClick={() => onAbrir(plaza)}
          className="foco-en-capa text-left before:absolute before:inset-0 before:rounded-lg before:content-['']"
        >
          {/* El recorte va en un `span`: dentro de un botón, un `line-clamp`
              puesto en el título no corta nada. */}
          <span className="line-clamp-3">{tituloLimpio(plaza)}</span>
        </button>
      </h3>

      <button
        type="button"
        onClick={() => onGuardar(plaza.id)}
        aria-pressed={guardada}
        aria-label={guardada ? 'Quitar de guardadas' : 'Guardar esta plaza'}
        className={`toque-amplio pulsa absolute top-2 right-2 z-10 rounded-sm p-1.5 ${
          guardada ? 'text-ochre' : 'estrella text-ink-3 hover:text-ink'
        }`}
      >
        <Icono nombre="estrella" relleno={guardada} className="size-5" />
      </button>

      {/* Una sola línea. La nota del origen, cuando no hay fecha, puede ser una
          frase entera («El termini s'obrirà l'endemà de la publicació…»):
          aquí se ve el principio y en la ficha, entera. */}
      <p className={`order-1 truncate pr-9 text-base font-semibold tabular-nums ${COLOR_PLAZO[u.tono]}`}>
        {u.etiqueta}
        {plaza.fin ? (
          <span className="font-normal text-ink-3"> · {fechaCorta(plaza.fin)}</span>
        ) : nota ? (
          <span className="font-normal text-ink-3" lang={nota.traducida ? undefined : 'ca'}> · {nota.texto}</span>
        ) : null}
      </p>

      {esActualizacion(plaza) && (
        <p className="order-3 mt-1 text-sm font-medium text-pine-ink">
          Ya avisada antes: su plazo por fin se ha abierto
        </p>
      )}

      <p className="order-3 mt-1 truncate text-sm text-ink-2">
        {casa}
        {organismo && <> · {organismo}</>}
      </p>

      <p className="order-4 mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-3">
        {plaza.fijo && (
          <span className="rounded-full bg-pine-soft px-2 py-0.5 text-xs font-semibold text-pine-ink">Fija</span>
        )}
        {lugar && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Icono nombre="pin" className="size-3.5" />
            <span lang="ca" className="truncate">{lugar}</span>
            {/* El asterisco solo lo ve quien ve; la frase va detrás, oculta a
                la vista pero no al lector de pantalla. */}
            {esSoloSede(plaza) && (
              <>
                <span aria-hidden="true">*</span>
                <span className="sr-only">{AVISO_SEDE}</span>
              </>
            )}
            {km !== null && <span className="shrink-0 tabular-nums">· a {km} km</span>}
          </span>
        )}
        {plaza.plazas ? (
          <span className="tabular-nums">{plaza.plazas} {plaza.plazas === 1 ? 'puesto' : 'puestos'}</span>
        ) : null}
        {estudios && <span>{estudios}</span>}
      </p>
    </article>
  );
}

export const Tarjeta = memo(TarjetaBase);
