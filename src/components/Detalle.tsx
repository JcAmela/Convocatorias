import { useEffect, useRef } from 'react';
import type { Plaza } from '../lib/tipos';
import { tituloLimpio, ETIQUETA_AMBITO } from '../lib/formato';
import { AVISO_OFICIAL, fichaDe } from '../lib/ficha';
import { FichaPlaza } from './FichaPlaza';
import { PildoraPlazo, Icono } from './piezas';

interface Props {
  plaza: Plaza | null;
  /** Municipio desde el que se miden las distancias. `null` = sin elegir. */
  desde: string | null;
  guardada: boolean;
  onGuardar: (id: string) => void;
  onCerrar: () => void;
}

/** Lo que un lector de pantalla o el tabulador pueden alcanzar dentro del panel. */
const FOCALIZABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Detalle({ plaza, desde, guardada, onGuardar, onCerrar }: Props) {
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

  const ficha = fichaDe(plaza, desde);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={tituloLimpio(plaza)}>
      <button
        type="button"
        aria-label="Cerrar el detalle"
        onClick={onCerrar}
        className="anima-velo absolute inset-0 bg-scrim"
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
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-3">
                {ETIQUETA_AMBITO[plaza.ambito] ?? plaza.ambito}
              </span>
            </div>
            {/* El sitio está en español pero los títulos llegan en catalán:
                marcarlos evita que un lector de pantalla los pronuncie con las
                reglas equivocadas. */}
            <h2 lang="ca" className="text-2xl font-semibold text-balance">
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
            className="hover:bg-surface-2 -mt-1.5 -mr-1.5 rounded-md p-3 text-ink-3 pulsa"
          >
            <Icono nombre="cerrar" className="size-5" />
          </button>
        </header>

        <div className="px-5 pb-5">
          <FichaPlaza ficha={ficha} />

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
                className="bg-pine inline-flex items-center gap-2 rounded-md border border-transparent px-4 py-2.5 text-base font-semibold text-on-pine pulsa hover:opacity-90"
              >
                Ir a apuntarte
                <Icono nombre="salir" />
              </a>
            )}
            {plaza.fichaOficial && (
              <a
                href={plaza.fichaOficial}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:border-pine hover:text-pine inline-flex items-center gap-2 rounded-md border border-line px-4 py-2.5 text-base font-semibold text-ink-2 pulsa"
              >
                Ficha oficial
                <Icono nombre="salir" />
              </a>
            )}
            <button
              type="button"
              onClick={() => onGuardar(plaza.id)}
              aria-pressed={guardada}
              className={`hover:border-ochre ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-2.5 text-base font-semibold pulsa ${
                guardada ? 'border-ochre/50 text-ochre' : 'border-line text-ink-3'
              }`}
            >
              <Icono nombre="estrella" relleno={guardada} className="size-5" />
              {guardada ? 'Guardada' : 'Guardar'}
            </button>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-ink-3">{AVISO_OFICIAL}</p>
        </div>
      </div>
    </div>
  );
}
