import { useEffect, useRef, useState } from 'react';
import type { Filtros as F, ClaseContrato, Orden, Vista } from '../lib/filtros';
import { NIVEL_CORTO, ETIQUETA_AMBITO, ORDEN_NIVEL } from '../lib/formato';

type Conteos = Record<string, number>;

interface Props {
  filtros: F;
  set: (parcial: Partial<F>) => void;
  conteos: {
    niveles: Conteos;
    contratos: Conteos;
    ambitos: Conteos;
    urgencias: Conteos;
    lejos: number;
  };
}

const CONTRATOS: { valor: ClaseContrato; texto: string }[] = [
  { valor: 'fija', texto: 'Fija, para quedarte' },
  { valor: 'temporal', texto: 'Temporal o interinaje' },
  { valor: 'bolsa', texto: 'Bolsa de trabajo' },
];

const URGENCIAS = [
  { valor: 'hoy', texto: 'Cierra hoy' },
  { valor: '3dias', texto: 'En 3 días o menos' },
  { valor: 'semana', texto: 'Esta semana' },
  { valor: 'mes', texto: 'Este mes' },
  { valor: 'lejano', texto: 'Más de un mes' },
];

const ORDENES: { valor: Orden; texto: string }[] = [
  { valor: 'fin', texto: 'La que cierra antes' },
  { valor: 'fin-lejos', texto: 'La que cierra más tarde' },
  { valor: 'plazas', texto: 'Más puestos convocados' },
  { valor: 'publicado', texto: 'Publicada hace menos' },
  { valor: 'nivel', texto: 'Estudios, de menos a más' },
];

/** Alterna un valor dentro de una lista de selección múltiple. */
function conmuta<T extends string>(lista: T[], v: T): T[] {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
}

/* -------------------------------------------------------------- desplegable */

function Menu({
  titulo, activos, children,
}: { titulo: string; activos: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [desvio, setDesvio] = useState(0);

  // Un solo menú abierto a la vez, y clic fuera para cerrar.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  /**
   * El panel cuelga del borde izquierdo del botón. En una pantalla estrecha
   * los últimos menús arrancan ya pasada la mitad, así que sus 270px se
   * salían de la ventana y media lista quedaba fuera. Al abrir se mide y se
   * empuja hacia dentro lo justo.
   */
  const coloca = () => {
    const caja = panel.current?.getBoundingClientRect();
    if (!caja) return;
    const margen = 12;
    const sobra = caja.right - desvio - (window.innerWidth - margen);
    setDesvio(sobra > 0 ? -sobra : 0);
  };

  return (
    <details
      ref={ref}
      className="relative"
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) coloca(); }}
    >
      <summary
        className={`hover:border-pine/50 flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
          activos > 0 ? 'border-pine/45 bg-pine-soft text-pine-ink' : 'border-line bg-surface text-ink-2'
        }`}
      >
        {titulo}
        {activos > 0 && (
          <span className="bg-pine rounded-full px-1.5 text-2xs font-bold text-white tabular-nums">
            {activos}
          </span>
        )}
        <svg viewBox="0 0 12 12" className="size-2.5 opacity-55" aria-hidden="true">
          <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </summary>
      <div
        ref={panel}
        style={{ transform: desvio ? `translateX(${desvio}px)` : undefined }}
        className="scroll-fino absolute top-[calc(100%+6px)] left-0 z-40 max-h-[min(60vh,380px)] w-[270px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_4px_10px_rgba(0,0,0,0.05),0_16px_40px_-12px_rgba(0,0,0,0.24)]"
      >
        {children}
      </div>
    </details>
  );
}

function Opcion({
  marcada, texto, n, onClick,
}: { marcada: boolean; texto: string; n: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={n === 0 && !marcada}
      aria-pressed={marcada}
      className="hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span
        aria-hidden="true"
        className={`grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors ${
          marcada ? 'border-pine bg-pine text-white' : 'border-line-soft bg-surface-2'
        }`}
      >
        {marcada && (
          <svg viewBox="0 0 12 12" className="size-2.5"><path d="M2 6.4L4.6 9L10 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      <span className="flex-1 leading-tight">{texto}</span>
      <span className="font-mono text-2xs text-ink-3 tabular-nums">{n}</span>
    </button>
  );
}

/* -------------------------------------------------------------------- barra */

export function Filtros({ filtros: f, set, conteos }: Props) {
  const [foco, setFoco] = useState(false);
  const busca = useRef<HTMLInputElement>(null);

  // "/" enfoca el buscador, como en GitHub: el atajo que ya se conoce.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const en = e.target as HTMLElement;
      const escribiendo = en?.tagName === 'INPUT' || en?.tagName === 'TEXTAREA';
      if (e.key === '/' && !escribiendo) {
        e.preventDefault();
        busca.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const niveles = Object.keys(NIVEL_CORTO).sort((a, b) => ORDEN_NIVEL[a] - ORDEN_NIVEL[b]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`flex w-full items-center gap-2 rounded-lg border bg-surface px-3 py-2 transition-colors sm:w-auto sm:min-w-[220px] sm:flex-1 ${
            foco ? 'border-pine' : 'border-line'
          }`}
        >
          <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
            <circle cx="9" cy="9" r="6" /><path d="M13.5 13.5L17 17" strokeLinecap="round" />
          </svg>
          <input
            ref={busca}
            type="search"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            onFocus={() => setFoco(true)}
            onBlur={() => setFoco(false)}
            placeholder="administrativo, educador, informática…"
            aria-label="Buscar por puesto, organismo o requisito"
            className="w-full bg-transparent text-base outline-none placeholder:text-ink-3"
          />
          {!f.q && (
            <kbd className="hidden shrink-0 rounded border border-line-soft bg-surface-2 px-1.5 font-mono text-2xs text-ink-3 sm:block">/</kbd>
          )}
        </div>

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:flex-none">
          <span className="text-ink-3 max-sm:sr-only">Ordenar</span>
          <select
            value={f.orden}
            onChange={(e) => set({ orden: e.target.value as Orden })}
            className="min-w-0 flex-1 cursor-pointer truncate bg-transparent font-medium outline-none sm:flex-none"
          >
            {ORDENES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </label>

        <div className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Forma de ver los resultados">
          {(['tarjetas', 'tabla'] as Vista[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => set({ vista: v })}
              aria-pressed={f.vista === v}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                f.vista === v ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Menu titulo="Estudios" activos={f.niveles.length}>
          {niveles.map((n) => (
            <Opcion
              key={n}
              marcada={f.niveles.includes(n)}
              texto={NIVEL_CORTO[n]}
              n={conteos.niveles[n] ?? 0}
              onClick={() => set({ niveles: conmuta(f.niveles, n) })}
            />
          ))}
        </Menu>

        <Menu titulo="Tipo de plaza" activos={f.contratos.length}>
          {CONTRATOS.map((c) => (
            <Opcion
              key={c.valor}
              marcada={f.contratos.includes(c.valor)}
              texto={c.texto}
              n={conteos.contratos[c.valor] ?? 0}
              onClick={() => set({ contratos: conmuta(f.contratos, c.valor) })}
            />
          ))}
        </Menu>

        <Menu titulo="Quién convoca" activos={f.ambitos.length}>
          {Object.entries(ETIQUETA_AMBITO).map(([k, texto]) => (
            <Opcion
              key={k}
              marcada={f.ambitos.includes(k)}
              texto={texto}
              n={conteos.ambitos[k] ?? 0}
              onClick={() => set({ ambitos: conmuta(f.ambitos, k) })}
            />
          ))}
        </Menu>

        <Menu titulo="Tiempo que queda" activos={f.urgencias.length}>
          {URGENCIAS.map((u) => (
            <Opcion
              key={u.valor}
              marcada={f.urgencias.includes(u.valor)}
              texto={u.texto}
              n={conteos.urgencias[u.valor] ?? 0}
              onClick={() => set({ urgencias: conmuta(f.urgencias, u.valor) })}
            />
          ))}
        </Menu>

        <button
          type="button"
          onClick={() => set({ soloCerca: !f.soloCerca })}
          aria-pressed={f.soloCerca}
          className={`hover:border-pine/50 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
            f.soloCerca ? 'border-pine/45 bg-pine-soft text-pine-ink' : 'border-line bg-surface text-ink-2'
          }`}
        >
          <span className="sm:hidden">Cerca de casa</span>
          <span className="hidden sm:inline">Solo cerca de casa</span>
          {conteos.lejos > 0 && !f.soloCerca && (
            <span className="ml-1.5 text-2xs text-ink-3">esconde {conteos.lejos}</span>
          )}
        </button>
      </div>
    </div>
  );
}
