import { useEffect, useRef } from 'react';
import type { Plaza } from '../lib/tipos';
import {
  fechaLarga, lugarDe, partesEmpleador, tituloLimpio, esFinDeSemana, ETIQUETA_AMBITO,
} from '../lib/formato';
import { PildoraPlazo, IconoEstrella, IconoSalir } from './piezas';

interface Props {
  plaza: Plaza | null;
  guardada: boolean;
  onGuardar: (id: string) => void;
  onCerrar: () => void;
}

function Fila({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line-soft py-2.5">
      <dt className="mb-0.5 text-[10.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">{termino}</dt>
      <dd className="text-[14px] leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

export function Detalle({ plaza, guardada, onGuardar, onCerrar }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const abierto = plaza !== null;

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', esc);
    // El fondo no debe poder desplazarse mientras el panel tapa la página.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
    };
  }, [abierto, onCerrar]);

  if (!plaza) return null;

  const { casa, organismo } = partesEmpleador(plaza);
  const lugar = lugarDe(plaza);
  const finDeSemana = esFinDeSemana(plaza.fin);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={tituloLimpio(plaza)}>
      <button
        type="button"
        aria-label="Cerrar el detalle"
        onClick={onCerrar}
        className="anima-velo absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        tabIndex={-1}
        className="anima-panel scroll-fino relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-surface shadow-2xl outline-none"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PildoraPlazo dias={plaza.diasRestantes} />
              <span className="rounded-full border border-line px-2 py-[1px] text-[11px] font-semibold text-ink-3">
                {ETIQUETA_AMBITO[plaza.ambito] ?? plaza.ambito}
              </span>
            </div>
            <h2 className="display text-[21px] leading-tight font-semibold text-balance">
              {tituloLimpio(plaza)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="hover:bg-surface-2 -mt-1 rounded-lg p-1.5 text-ink-3 transition-colors"
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="px-5 pb-5">
          <div className="py-3">
            <p className="text-pine text-[15px] font-semibold">{casa}</p>
            {organismo && <p className="text-[14px] text-ink-2">{organismo}</p>}
          </div>

          {plaza.notaPlazo && (
            <p className="bg-ochre-soft text-ochre mb-3 rounded-lg px-3 py-2 text-[13.5px] leading-relaxed">
              <strong className="font-bold">Ojo con el plazo: </strong>
              {plaza.notaPlazo}. Confirma la fecha exacta en el enlace oficial.
            </p>
          )}

          {finDeSemana && (
            <p className="bg-surface-2 mb-3 rounded-lg px-3 py-2 text-[13.5px] leading-relaxed text-ink-2">
              El plazo termina en fin de semana, así que es probable que se corra al lunes siguiente.
              Aun así, no lo dejes para el final.
            </p>
          )}

          <dl className="mb-4">
            <Fila termino="Cuándo puedes apuntarte">
              {plaza.fin ? (
                <>
                  {plaza.inicio
                    ? <>Del <strong className="font-semibold text-ink">{fechaLarga(plaza.inicio)}</strong> al <strong className="font-semibold text-ink">{fechaLarga(plaza.fin)}</strong></>
                    : <>Hasta el <strong className="font-semibold text-ink">{fechaLarga(plaza.fin)}</strong></>}
                </>
              ) : (
                'Todavía no han publicado el plazo. La convocatoria ya está anunciada, pero aún no se pueden presentar solicitudes.'
              )}
            </Fila>

            <Fila termino="Qué tipo de plaza es">
              {plaza.tipoEtiqueta}
              {plaza.tipo === 'bolsa' && (
                <span className="mt-1 block text-[13px] text-ink-3">
                  Una bolsa es una lista de espera: te apuntas una vez y te llaman cuando hace falta
                  cubrir contratos temporales o sustituciones.
                </span>
              )}
            </Fila>

            {plaza.plazas ? (
              <Fila termino="Cuántos puestos">
                {plaza.plazas} {plaza.plazas === 1 ? 'puesto convocado' : 'puestos convocados'}
              </Fila>
            ) : null}

            {lugar && (
              <Fila termino="Dónde se trabaja">
                {lugar}
                {plaza.lejos && (
                  <span className="text-ochre mt-1 block text-[13px] font-semibold">
                    Queda fuera de tu zona: comprueba el desplazamiento antes de presentarte.
                  </span>
                )}
              </Fila>
            )}

            {plaza.nivelEstudios && <Fila termino="Estudios que piden">{plaza.nivelEstudios}</Fila>}

            {plaza.titulacion && plaza.titulacion !== 'Vegeu les bases' && (
              <Fila termino="Titulación concreta">{plaza.titulacion}</Fila>
            )}

            {plaza.otrosRequisitos && <Fila termino="Además necesitas">{plaza.otrosRequisitos}</Fila>}

            {plaza.seleccion && <Fila termino="Cómo se entra">{plaza.seleccion}</Fila>}

            {plaza.publicado && <Fila termino="Se publicó el">{fechaLarga(plaza.publicado)}</Fila>}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {plaza.enlace && (
              <a
                href={plaza.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-pine inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Ir a apuntarte
                <IconoSalir />
              </a>
            )}
            {plaza.fichaOficial && (
              <a
                href={plaza.fichaOficial}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:border-pine hover:text-pine inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-[14px] font-semibold text-ink-2 transition-colors"
              >
                Ficha oficial
                <IconoSalir />
              </a>
            )}
            <button
              type="button"
              onClick={() => onGuardar(plaza.id)}
              aria-pressed={guardada}
              className={`hover:border-ochre ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                guardada ? 'border-ochre/50 text-ochre' : 'border-line text-ink-3'
              }`}
            >
              <IconoEstrella activa={guardada} />
              {guardada ? 'Guardada' : 'Guardar'}
            </button>
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
            Manda siempre lo que diga la convocatoria oficial. Esta ficha resume lo que publican
            CIDO y los portales Convoca, y puede quedarse corta o desactualizada.
          </p>
        </div>
      </div>
    </div>
  );
}
