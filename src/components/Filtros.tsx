import { useEffect, useMemo, useRef, useState } from 'react';
import type { Filtros as F, ClaseContrato, Orden, Vista } from '../lib/filtros';
import { NIVEL_CORTO, ETIQUETA_AMBITO, ORDEN_NIVEL, URGENCIAS, normaliza } from '../lib/formato';
import { SIN_LUGAR, TEXTO_SIN_LUGAR, type SitioContado } from '../lib/localizacion';
import { RADIO_CERCA_KM } from '../lib/cercania';

type Conteos = Record<string, number>;

interface Props {
  filtros: F;
  set: (parcial: Partial<F>) => void;
  /** Municipios y comarcas que aparecen en la lista, con su cuenta. */
  lugares: SitioContado[];
  /** Todos los municipios de Cataluña, para elegir el punto de referencia. */
  municipios: SitioContado[];
  conteos: {
    niveles: Conteos;
    contratos: Conteos;
    ambitos: Conteos;
    urgencias: Conteos;
    lugares: Conteos;
    lejos: number;
  };
}

const CONTRATOS: { valor: ClaseContrato; texto: string }[] = [
  { valor: 'fija', texto: 'Fija, para quedarte' },
  { valor: 'temporal', texto: 'Temporal o interinaje' },
  { valor: 'bolsa', texto: 'Bolsa de trabajo' },
];

const ORDENES: { valor: Orden; texto: string }[] = [
  { valor: 'fin', texto: 'La que cierra antes' },
  { valor: 'fin-lejos', texto: 'La que cierra más tarde' },
  { valor: 'plazas', texto: 'Más puestos convocados' },
  { valor: 'publicado', texto: 'Publicada hace menos' },
  { valor: 'nivel', texto: 'Estudios, de menos a más' },
  { valor: 'cercania', texto: 'Más cerca de ti' },
];

/** Alterna un valor dentro de una lista de selección múltiple. */
function conmuta<T extends string>(lista: T[], v: T): T[] {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
}

/* -------------------------------------------------------------- desplegable */

function Menu({
  titulo, corto, activos, children,
}: { titulo: string; corto?: string; activos: number; children: React.ReactNode }) {
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
    // El ancho de referencia es el del documento, no `innerWidth`: ese incluye
    // la barra de desplazamiento, así que el panel se colaba por debajo de
    // ella. Restar `desvio` deshace el empujón de la vez anterior, porque el
    // rectángulo ya lo lleva aplicado.
    const util = document.documentElement.clientWidth;
    const sobra = caja.right - desvio - (util - margen);
    setDesvio(sobra > 0 ? -sobra : 0);
  };

  return (
    <details
      ref={ref}
      className="relative"
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) coloca(); }}
    >
      <summary
        className={`hover:border-pine/50 flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-3 ${
          activos > 0 ? 'border-pine/45 bg-pine-soft text-pine-ink' : 'border-line bg-surface text-ink-2'
        }`}
      >
        {/* En móvil manda la versión corta. Con los rótulos largos, los seis
            filtros se repartían en cuatro renglones; con estos caben en dos
            y siguen todos a la vista, que es lo que importa en una barra de
            filtros: si hay que deslizar para descubrirlos, no se usan. */}
        {corto ? (
          <>
            <span className="sm:hidden">{corto}</span>
            <span className="hidden sm:inline">{titulo}</span>
          </>
        ) : (
          titulo
        )}
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
        className="scroll-fino absolute top-[calc(100%+6px)] left-0 z-40 max-h-[min(60vh,380px)] w-[270px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-alza-2"
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

export function Filtros({ filtros: f, set, lugares, municipios, conteos }: Props) {
  const [foco, setFoco] = useState(false);
  const [buscaLugar, setBuscaLugar] = useState('');
  const [buscaDesde, setBuscaDesde] = useState('');
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

  /**
   * Hay del orden de ochenta sitios, así que arriba van los que más plazas
   * tienen ahora mismo y lo demás se encuentra escribiendo. Un lugar ya
   * marcado no se esconde nunca, aunque el resto de filtros lo dejen a cero:
   * si no, no habría forma de desmarcarlo.
   */
  /**
   * El menú va agrupado por comarca, y la comarca es una opción más: marcarla
   * trae todos sus pueblos de golpe. Con casi mil municipios posibles en
   * Cataluña, una lista plana no habría quien la recorriera.
   *
   * Un sitio ya marcado no se esconde nunca, aunque el resto de filtros lo
   * dejen a cero: si no, no habría forma de desmarcarlo.
   */
  const comarcasVisibles = useMemo(() => {
    const texto = normaliza(buscaLugar.trim());
    const casa = (nombre: string) => !texto || normaliza(nombre).includes(texto);

    const municipiosPorComarca = new Map<string, SitioContado[]>();
    const comarcas = new Map<string, SitioContado>();
    for (const l of lugares) {
      if (l.tipo === 'comarca') { comarcas.set(l.id, l); continue; }
      const clave = l.comarcaId ?? 'sin-comarca';
      if (!municipiosPorComarca.has(clave)) municipiosPorComarca.set(clave, []);
      municipiosPorComarca.get(clave)!.push(l);
    }

    const grupos = [...municipiosPorComarca.entries()].map(([comarcaId, pueblos]) => {
      const comarca = comarcas.get(comarcaId) ?? null;
      // Si el texto casa con la comarca, valen todos sus pueblos; si no, solo
      // los que casen ellos.
      const comarcaCasa = comarca ? casa(comarca.nombre) : false;
      const visibles = pueblos
        .filter((m) => comarcaCasa || casa(m.nombre) || f.lugares.includes(m.id))
        .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
      return { comarca, comarcaId, pueblos: visibles };
    })
      .filter((g) => g.pueblos.length)
      .sort((a, b) => {
        const na = a.pueblos.reduce((t, m) => t + m.n, 0);
        const nb = b.pueblos.reduce((t, m) => t + m.n, 0);
        return nb - na || (a.comarca?.nombre ?? '').localeCompare(b.comarca?.nombre ?? '', 'es');
      });
    return grupos;
  }, [lugares, buscaLugar, f.lugares]);

  /** El municipio de referencia elegido, si lo hay. */
  const desde = useMemo(
    () => municipios.find((m) => m.id === f.desde) ?? null,
    [municipios, f.desde],
  );

  /** Los municipios entre los que se elige el punto de referencia. */
  const desdeVisibles = useMemo(() => {
    const texto = normaliza(buscaDesde.trim());
    if (!texto) return municipios.filter((m) => m.tipo === 'municipio').slice(0, 40);
    return municipios
      .filter((m) => m.tipo === 'municipio' && normaliza(m.nombre).includes(texto))
      .slice(0, 40);
  }, [municipios, buscaDesde]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Etiqueta, no `div`: el recuadro mide 40px de alto pero el `input`
            de dentro solo 22, así que pulsar en el margen —la lupa, el hueco
            de arriba y abajo— no hacía nada. Siendo `label`, todo el
            recuadro lleva el foco al campo. */}
        <label
          className={`flex w-full cursor-text items-center gap-2 rounded-lg border bg-surface px-3 py-2 transition-colors sm:w-auto sm:min-w-[220px] sm:flex-1 ${
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
        </label>

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm sm:flex-none">
          <span className="text-ink-3 max-sm:sr-only">Ordenar</span>
          <select
            value={f.orden}
            onChange={(e) => set({ orden: e.target.value as Orden })}
            className="min-w-0 flex-1 cursor-pointer truncate bg-transparent font-medium outline-none sm:flex-none"
          >
            {ORDENES
              .filter((o) => o.valor !== 'cercania' || f.desde)
              .map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
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

        <Menu titulo="Tipo de plaza" corto="Tipo" activos={f.contratos.length}>
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

        <Menu titulo="Quién convoca" corto="Convoca" activos={f.ambitos.length}>
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

        <Menu titulo="Dónde" activos={f.lugares.length}>
          <div className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-1 border-b border-line-soft bg-surface px-1.5 pt-1.5 pb-1.5">
            <input
              type="search"
              value={buscaLugar}
              onChange={(e) => setBuscaLugar(e.target.value)}
              placeholder="Buscar un municipio…"
              aria-label="Buscar un municipio dentro de la lista"
              className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-base outline-none placeholder:text-ink-3 focus:border-pine"
            />
          </div>
          {comarcasVisibles.map((g) => (
            <div key={g.comarcaId} className="mb-1">
              {g.comarca ? (
                <Opcion
                  marcada={f.lugares.includes(g.comarca.id)}
                  texto={g.comarca.nombre}
                  n={conteos.lugares[g.comarca.id] ?? 0}
                  onClick={() => set({ lugares: conmuta(f.lugares, g.comarca!.id) })}
                />
              ) : (
                <p className="px-2 pt-1 text-2xs font-bold tracking-[0.07em] text-ink-3 uppercase">
                  Sin comarca
                </p>
              )}
              <div className="ml-3 border-l border-line-soft pl-1">
                {g.pueblos.map((l) => (
                  <Opcion
                    key={l.id}
                    marcada={f.lugares.includes(l.id)}
                    texto={l.nombre}
                    n={conteos.lugares[l.id] ?? 0}
                    onClick={() => set({ lugares: conmuta(f.lugares, l.id) })}
                  />
                ))}
              </div>
            </div>
          ))}
          {comarcasVisibles.length === 0 && (
            <p className="px-2 py-3 text-sm text-ink-3">Ningún municipio se llama así.</p>
          )}
          {/* Ya casi no hay convocatorias sin ningún sitio, pero mientras
              queden en el archivo tienen que poder pedirse. */}
          {(conteos.lugares[SIN_LUGAR] > 0 || f.lugares.includes(SIN_LUGAR)) && (
            <div className="mt-1 border-t border-line-soft pt-1">
              <Opcion
                marcada={f.lugares.includes(SIN_LUGAR)}
                texto={TEXTO_SIN_LUGAR}
                n={conteos.lugares[SIN_LUGAR] ?? 0}
                onClick={() => set({ lugares: conmuta(f.lugares, SIN_LUGAR) })}
              />
            </div>
          )}
        </Menu>

        {/* En las ya cerradas no queda tiempo que valga: el menú entero
            marcaba cero y parecía roto. */}
        {f.pestana !== 'cerradas' && (
          <Menu titulo="Tiempo que queda" corto="Plazo" activos={f.urgencias.length}>
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
        )}

        {/* La cercanía necesita saber desde dónde. Sin municipio elegido el
            botón no filtra nada: abre el desplegable para elegirlo. */}
        <Menu titulo={desde ? `A ${RADIO_CERCA_KM} km de ${desde.nombre}` : 'Cerca de dónde vives'} activos={f.soloCerca ? 1 : 0}>
          <div className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-1 border-b border-line-soft bg-surface px-1.5 pt-1.5 pb-1.5">
            <input
              type="search"
              value={buscaDesde}
              onChange={(e) => setBuscaDesde(e.target.value)}
              placeholder="Tu municipio…"
              aria-label="Buscar tu municipio"
              className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-base outline-none placeholder:text-ink-3 focus:border-pine"
            />
          </div>

          {desde ? (
            <>
              <button
                type="button"
                onClick={() => set({ soloCerca: !f.soloCerca })}
                aria-pressed={f.soloCerca}
                className="hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base transition-colors"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-4 shrink-0 place-items-center rounded-[4px] border ${
                    f.soloCerca ? 'border-pine bg-pine text-white' : 'border-line-soft bg-surface-2'
                  }`}
                >
                  {f.soloCerca && (
                    <svg viewBox="0 0 12 12" className="size-2.5"><path d="M2 6.4L4.6 9L10 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </span>
                <span className="flex-1 leading-tight">
                  Esconder lo que esté a más de {RADIO_CERCA_KM} km
                </span>
                {conteos.lejos > 0 && <span className="font-mono text-2xs text-ink-3">{conteos.lejos}</span>}
              </button>
              <p className="border-t border-line-soft px-2 pt-2 pb-1 text-2xs text-ink-3">
                Midiendo desde {desde.nombre}. Cambia de municipio en la lista.
              </p>
            </>
          ) : (
            <p className="px-2 pt-1 pb-2 text-sm leading-snug text-ink-3">
              Elige tu municipio y las convocatorias te dirán a cuántos kilómetros quedan.
            </p>
          )}

          {desdeVisibles.map((m) => (
            <Opcion
              key={m.id}
              marcada={f.desde === m.id}
              texto={m.nombre}
              n={m.n}
              onClick={() => set({ desde: f.desde === m.id ? null : m.id, soloCerca: f.desde === m.id ? false : f.soloCerca })}
            />
          ))}
          {desdeVisibles.length === 0 && (
            <p className="px-2 py-3 text-sm text-ink-3">Ningún municipio se llama así.</p>
          )}
        </Menu>
      </div>
    </div>
  );
}
