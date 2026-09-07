import { useEffect, useRef } from 'react';
import type { Plaza } from '../lib/tipos';
import {
  fechaLarga, partesEmpleador, tituloLimpio, esFinDeSemana, enEspanol, ETIQUETA_AMBITO,
} from '../lib/formato';
import { lugaresTexto } from '../lib/lugar';
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
      <dt className="mb-1 text-2xs font-bold tracking-[0.08em] text-ink-3 uppercase">{termino}</dt>
      <dd className="text-base leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

/** Lo que un lector de pantalla o el tabulador pueden alcanzar dentro del panel. */
const FOCALIZABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Detalle({ plaza, guardada, onGuardar, onCerrar }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const abierto = plaza !== null;

  useEffect(() => {
    if (!abierto) return;

    // Con quién estabas antes de abrir, para devolverle el foco al cerrar: si
    // no, el teclado vuelve al principio del documento y hay que recorrer la
    // página entera para seguir donde estabas.
    const veniaDe = document.activeElement as HTMLElement | null;

    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCerrar(); return; }
      // El panel dice `aria-modal`, así que el tabulador no puede escaparse a
      // la lista de detrás: se cierra el ciclo a mano.
      if (e.key !== 'Tab' || !panel.current) return;
      const dentro = [...panel.current.querySelectorAll<HTMLElement>(FOCALIZABLE)]
        .filter((el) => el.offsetParent !== null);
      if (dentro.length === 0) return;
      const primero = dentro[0];
      const ultimo = dentro[dentro.length - 1];
      const foco = document.activeElement;
      if (e.shiftKey && (foco === primero || foco === panel.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && foco === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener('keydown', teclas);
    // El fondo no debe poder desplazarse mientras el panel tapa la página.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', teclas);
      document.body.style.overflow = overflow;
      veniaDe?.focus?.();
    };
  }, [abierto, onCerrar]);

  if (!plaza) return null;

  const { casa, organismo } = partesEmpleador(plaza);
  const lugar = lugaresTexto(plaza);
  const finDeSemana = esFinDeSemana(plaza.fin);
  const nota = plaza.notaPlazo ? enEspanol(plaza.notaPlazo) : null;
  const seleccion = plaza.seleccion ? enEspanol(plaza.seleccion) : null;

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
        className="anima-panel scroll-fino relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-surface shadow-alza-3 outline-none"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PildoraPlazo dias={plaza.diasRestantes} />
              <span className="rounded-full border border-line px-2 py-0.5 text-2xs font-semibold text-ink-3">
                {ETIQUETA_AMBITO[plaza.ambito] ?? plaza.ambito}
              </span>
            </div>
            {/* El sitio está en español pero los títulos llegan en catalán:
                marcarlos evita que un lector de pantalla los pronuncie con las
                reglas equivocadas. */}
            <h2 lang="ca" className="display-lg text-2xl font-semibold text-balance">
              {tituloLimpio(plaza)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            /* Área de toque de 40px, no de 28. Es la salida de un panel que en
               un móvil ocupa la pantalla entera, y vive en la esquina, que es
               donde peor se apunta con el pulgar. El icono no crece: solo el
               sitio donde vale pulsar. */
            className="hover:bg-surface-2 -mt-1.5 -mr-1.5 rounded-lg p-3 text-ink-3 transition-colors"
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="px-5 pb-5">
          <div className="py-3">
            <p className="text-pine text-md font-semibold">{casa}</p>
            {organismo && <p className="text-base text-ink-2">{organismo}</p>}
          </div>

          {nota && (
            <p className="bg-ochre-soft text-ochre mb-3 rounded-lg px-3 py-2.5 text-base leading-relaxed">
              <strong className="font-bold">Ojo con el plazo: </strong>
              <span lang={nota.traducida ? undefined : 'ca'}>{nota.texto}</span>. Confirma la
              fecha exacta en el enlace oficial.
            </p>
          )}

          {finDeSemana && (
            <p className="bg-surface-2 mb-3 rounded-lg px-3 py-2.5 text-base leading-relaxed text-ink-2">
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
                <span className="mt-1 block text-sm text-ink-3">
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
                  <span className="text-ochre mt-1 block text-sm font-semibold">
                    Queda fuera de tu zona: comprueba el desplazamiento antes de presentarte.
                  </span>
                )}
              </Fila>
            )}

            {plaza.nivelEstudios && <Fila termino="Estudios que piden">{plaza.nivelEstudios}</Fila>}

            {plaza.titulacion && plaza.titulacion !== 'Vegeu les bases' && (
              <Fila termino="Titulación concreta"><span lang="ca">{plaza.titulacion}</span></Fila>
            )}

            {plaza.otrosRequisitos && (
              <Fila termino="Además necesitas"><span lang="ca">{plaza.otrosRequisitos}</span></Fila>
            )}

            {/* La forma de selección sí la traduce el origen salvo alguna
                suelta, así que aquí no se marca idioma: lo que no esté en la
                tabla ya viene en español. */}
            {seleccion && <Fila termino="Cómo se entra">{seleccion.texto}</Fila>}

            {plaza.publicado && <Fila termino="Se publicó el">{fechaLarga(plaza.publicado)}</Fila>}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {plaza.enlace && (
              <a
                href={plaza.enlace}
                target="_blank"
                rel="noopener noreferrer"
                /* Borde transparente para que mida lo mismo que los de al
                   lado: sin él, este botón se quedaba en 42px mientras sus
                   dos vecinos con borde median 44, y los tres se apoyaban en
                   líneas distintas. */
                className="bg-pine inline-flex items-center gap-2 rounded-lg border border-transparent px-4 py-2.5 text-base font-semibold text-white transition-opacity hover:opacity-90"
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
                className="hover:border-pine hover:text-pine inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-base font-semibold text-ink-2 transition-colors"
              >
                Ficha oficial
                <IconoSalir />
              </a>
            )}
            <button
              type="button"
              onClick={() => onGuardar(plaza.id)}
              aria-pressed={guardada}
              className={`hover:border-ochre ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-base font-semibold transition-colors ${
                guardada ? 'border-ochre/50 text-ochre' : 'border-line text-ink-3'
              }`}
            >
              <IconoEstrella activa={guardada} />
              {guardada ? 'Guardada' : 'Guardar'}
            </button>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-ink-3">
            Manda siempre lo que diga la convocatoria oficial. Esta ficha resume lo que publican
            CIDO y los portales Convoca, y puede quedarse corta o desactualizada.
          </p>
        </div>
      </div>
    </div>
  );
}
