import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Plaza, Tablero as Datos } from '../lib/tipos';
import { API, esTablero, saneaTablero } from '../lib/datos';
import {
  aplica, cuenta, cuentaVarias, ordena, hayFiltros, aQuery, deQuery, claseContrato,
  FILTROS_INICIALES, type Filtros as F, type Pestana,
} from '../lib/filtros';
import { urgencia, fechaLarga, plural, NIVEL_CORTO, ETIQUETA_AMBITO, URGENCIAS } from '../lib/formato';
import { preparaLugares, idsFiltroLugar, SIN_LUGAR } from '../lib/lugar';
import { Filtros } from './Filtros';
import { Calendario } from './Calendario';
import { Tarjeta } from './Tarjeta';
import { Tabla } from './Tabla';
import { Detalle } from './Detalle';
import { Tema } from './Tema';

const CLAVE_GUARDADAS = 'convocatorias:guardadas';
const PAGINA = 24;

const PESTANAS: { valor: Pestana; texto: string; pie: string }[] = [
  { valor: 'abiertas', texto: 'Con plazo abierto', pie: 'Puedes presentar la solicitud ahora mismo.' },
  { valor: 'pendientes', texto: 'Sin plazo aún', pie: 'Anunciadas, pero todavía no se pueden pedir. Vigílalas.' },
  { valor: 'cerradas', texto: 'Ya cerradas', pie: 'El plazo pasó. Sirven para ver qué se suele convocar.' },
  { valor: 'guardadas', texto: 'Guardadas', pie: 'Las que has marcado con la estrella. Se quedan en este navegador.' },
];

/* ------------------------------------------------------------------ cifras */

function Cifra({ valor, texto, urgente }: { valor: number; texto: string; urgente?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      {/* Cifra grande: sans y cifras proporcionales, que a este tamaño las
          tabulares se ven sueltas. */}
      <p className={`text-3xl font-semibold tracking-tight ${urgente ? 'text-rust' : ''}`}>
        {valor.toLocaleString('es-ES')}
      </p>
      <p className="mt-2 text-sm leading-tight text-balance text-ink-3">{texto}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- tablero */

export function Tablero({ inicial }: { inicial: Datos }) {
  const [datos, setDatos] = useState<Datos>(inicial);
  const [revalidando, setRevalidando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [f, setF] = useState<F>(FILTROS_INICIALES);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<Plaza | null>(null);
  const [visibles, setVisibles] = useState(PAGINA);
  const montado = useRef(false);

  /* --- arranque: filtros de la URL y guardadas del navegador ------------- */

  useEffect(() => {
    setF(deQuery(window.location.search.slice(1)));
    try {
      const crudo = localStorage.getItem(CLAVE_GUARDADAS);
      if (crudo) setGuardadas(new Set(JSON.parse(crudo) as string[]));
    } catch {
      // Navegador con el almacenamiento capado: se sigue sin guardadas.
    }
  }, []);

  /* --- datos frescos: la página se sirve estática y se revalida al abrir - */

  useEffect(() => {
    let vivo = true;
    setRevalidando(true);
    fetch(API, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`el servidor respondió ${r.status}`))))
      .then((d: unknown) => {
        if (!esTablero(d)) throw new Error('el servidor devolvió algo que no es un tablero');
        if (vivo) { setDatos(saneaTablero(d)); setFallo(null); }
      })
      .catch((e: Error) => { if (vivo) setFallo(e.message); })
      .finally(() => { if (vivo) setRevalidando(false); });
    return () => { vivo = false; };
  }, []);

  /* --- la URL refleja lo que estás viendo, para compartir o guardar ------ */

  useEffect(() => {
    // La primera pasada se salta a propósito. El HTML se genera con los
    // filtros vacíos y el efecto de arranque aún no ha aplicado los de la URL,
    // así que escribir aquí borraría la query con la que acaba de entrar el
    // visitante antes de leerla.
    if (!montado.current) { montado.current = true; return; }
    const q = aQuery(f);
    window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
  }, [f]);

  const set = useCallback((parcial: Partial<F>) => {
    setF((antes) => ({ ...antes, ...parcial }));
    setVisibles(PAGINA);
  }, []);

  const alternaGuardada = useCallback((id: string) => {
    setGuardadas((antes) => {
      const nuevo = new Set(antes);
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
      try {
        localStorage.setItem(CLAVE_GUARDADAS, JSON.stringify([...nuevo]));
      } catch {
        // Sin almacenamiento la marca dura lo que dure la pestaña.
      }
      return nuevo;
    });
  }, []);

  /* --- conjuntos derivados ---------------------------------------------- */

  const todas = useMemo(
    () => [...datos.abiertas, ...datos.pendientes, ...datos.cerradas],
    [datos],
  );

  /**
   * El catálogo de lugares se monta con todas las plazas a la vez, no con las
   * que se estén viendo: solo mirando el conjunto se puede saber que
   * "Barccelona" es Barcelona. Va antes de pintar nada porque el resto de la
   * pantalla ya lo consulta.
   */
  const lugares = useMemo(() => preparaLugares(todas), [todas]);

  const base = useMemo(() => {
    if (f.pestana === 'guardadas') return todas.filter((p) => guardadas.has(p.id));
    return datos[f.pestana];
  }, [datos, f.pestana, guardadas, todas]);

  const filtradas = useMemo(() => ordena(aplica(base, f), f.orden), [base, f]);

  const conteos = useMemo(() => ({
    niveles: cuenta(base, f, 'niveles', (p) => (p.nivelCodigo && NIVEL_CORTO[p.nivelCodigo] ? p.nivelCodigo : null)),
    contratos: cuenta(base, f, 'contratos', claseContrato),
    ambitos: cuenta(base, f, 'ambitos', (p) => (ETIQUETA_AMBITO[p.ambito] ? p.ambito : null)),
    urgencias: cuenta(base, f, 'urgencias', (p) => urgencia(p.diasRestantes).cubo),
    lugares: cuentaVarias(base, f, 'lugares', idsFiltroLugar),
    lejos: aplica(base, f, 'cerca').filter((p) => p.lejos).length,
  }), [base, f]);

  const resumen = useMemo(() => ({
    convocatorias: filtradas.length,
    puestos: filtradas.reduce((s, p) => s + (p.plazas ?? 0), 0),
    // Los días negativos son plazos vencidos: contarlos como «cierran esta
    // semana» pintaba de rojo la pestaña entera de cerradas.
    urgentes: filtradas.filter((p) => p.diasRestantes !== null && p.diasRestantes >= 0 && p.diasRestantes <= 7).length,
    reciencerradas: filtradas.filter((p) => p.diasRestantes !== null && p.diasRestantes < 0 && p.diasRestantes >= -7).length,
    fijas: filtradas.filter((p) => p.fijo).length,
  }), [filtradas]);

  const pestanaActual = PESTANAS.find((p) => p.valor === f.pestana)!;
  const cuentaPestana = (v: Pestana) =>
    v === 'guardadas' ? guardadas.size : datos[v].length;

  const generado = datos.generado ? new Date(datos.generado) : null;

  /* --- filtros activos, como fichas que se pueden quitar ---------------- */

  const fichas: { texto: string; quitar: () => void }[] = [];
  if (f.q.trim()) fichas.push({ texto: `“${f.q.trim()}”`, quitar: () => set({ q: '' }) });
  for (const n of f.niveles) {
    fichas.push({ texto: NIVEL_CORTO[n] ?? n, quitar: () => set({ niveles: f.niveles.filter((x) => x !== n) }) });
  }
  for (const c of f.contratos) {
    fichas.push({ texto: c === 'fija' ? 'Fija' : c === 'bolsa' ? 'Bolsa' : 'Temporal', quitar: () => set({ contratos: f.contratos.filter((x) => x !== c) }) });
  }
  for (const a of f.ambitos) {
    fichas.push({ texto: ETIQUETA_AMBITO[a] ?? a, quitar: () => set({ ambitos: f.ambitos.filter((x) => x !== a) }) });
  }
  for (const u of f.urgencias) {
    // Sin ficha, este filtro solo se veía como un númerito en su menú; y si
    // el menú no está (pestaña de cerradas) no se veía en absoluto.
    const texto = URGENCIAS.find((x) => x.valor === u)?.texto ?? u;
    fichas.push({ texto, quitar: () => set({ urgencias: f.urgencias.filter((x) => x !== u) }) });
  }
  for (const id of f.lugares) {
    const nombre = id === SIN_LUGAR
      ? 'Sin lugar indicado'
      : lugares.find((l) => l.id === id)?.nombre ?? id;
    fichas.push({ texto: nombre, quitar: () => set({ lugares: f.lugares.filter((x) => x !== id) }) });
  }
  if (f.soloCerca) fichas.push({ texto: 'Solo cerca de casa', quitar: () => set({ soloCerca: false }) });
  if (f.dia) fichas.push({ texto: `Cierra el ${fechaLarga(f.dia)}`, quitar: () => set({ dia: null }) });

  return (
    <>
      {/* ------------------------------------------------------- cabecera */}
      <header className="border-b border-line bg-surface">
        {/* Una sola fila a cualquier ancho. Antes, en un móvil, la cabecera
            gastaba tres renglones: el subtítulo con los ocho municipios
            partido en tres líneas y el estado de los datos descolgado
            debajo. Ahora el subtítulo se recorta con puntos suspensivos y
            el estado se reduce a la hora, que es lo único que cambia. */}
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2">
            <svg viewBox="0 0 24 24" className="size-5">
              <rect x="3" y="4" width="18" height="4" rx="1.4" fill="var(--color-pine)" />
              <rect x="3" y="11" width="11" height="3" rx="1.4" fill="var(--color-ochre)" />
              <rect x="3" y="17" width="15" height="3" rx="1.4" fill="var(--color-ink-3)" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="display-lg truncate text-xl font-bold sm:text-2xl">Convocatorias</h1>
            <p className="mt-0.5 truncate text-sm text-ink-3">
              <span className="sm:hidden">Barcelona y alrededores</span>
              <span className="hidden sm:inline">
                Barcelona, Badalona, Santa Coloma, Sant Adrià, Montgat, Tiana, Alella y El Masnou
                · Generalitat · Diputación
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <p
              className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-3 sm:px-3"
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${fallo ? 'bg-rust' : revalidando ? 'bg-ochre' : 'bg-pine'}`}
              />
              {/* En móvil solo queda el punto de color y, si los datos ya
                  están, la hora. La frase sigue en el documento —oculta a la
                  vista, no al lector de pantalla— porque si no, el nombre del
                  sitio y la píldora se disputaban la misma fila. */}
              {fallo ? (
                <span className="sr-only sm:not-sr-only">Datos de la última copia</span>
              ) : revalidando ? (
                <span className="sr-only sm:not-sr-only">Buscando novedades…</span>
              ) : generado ? (
                <>
                  <span className="sr-only sm:not-sr-only sm:mr-1">Actualizado a las</span>
                  {/* Solo la hora va en monoespaciada: es lo único que cambia
                      cada rato, y así no baila el ancho de la píldora. */}
                  <span className="font-mono tabular-nums">
                    {generado.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              ) : (
                <span className="sr-only sm:not-sr-only">Sin fecha de actualización</span>
              )}
            </p>
            <Tema />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-4 sm:px-5 sm:py-5">
        {datos.errores.length > 0 && (
          <p className="bg-ochre-soft text-ochre mb-4 rounded-lg px-3 py-2 text-base">
            <strong className="font-bold">Aviso: </strong>
            {datos.errores.join('. ')}
          </p>
        )}

        {/* ------------------------------------------------- pestañas */}
        {/* Tira que se desplaza con el dedo. Envolviéndolas, las cuatro
            pestañas se partían en tres renglones en un móvil y empujaban
            los resultados fuera de la primera pantalla. */}
        <nav
          className="tira -mx-4 mb-4 flex gap-1 border-b border-line px-4 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Estado de la plaza"
        >
          {PESTANAS.map((p) => {
            const activa = f.pestana === p.valor;
            return (
              <button
                key={p.valor}
                role="tab"
                aria-selected={activa}
                onClick={() => set({ pestana: p.valor, dia: null })}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-2.5 text-base font-semibold whitespace-nowrap transition-colors ${
                  activa ? 'border-pine text-ink' : 'hover:text-ink border-transparent text-ink-3'
                }`}
              >
                {p.texto}
                <span
                  className={`rounded-full px-1.5 py-px font-mono text-2xs tabular-nums ${
                    activa ? 'bg-pine-soft text-pine-ink' : 'bg-surface-2 text-ink-3'
                  }`}
                >
                  {cuentaPestana(p.valor)}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mb-4 flex flex-col gap-4">
          <Filtros filtros={f} set={set} lugares={lugares} conteos={conteos} />

          {/* Las cifras y el gráfico describen lo que hay filtrado ahora
              mismo, no el total: si no, contarían otra película. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Cifra valor={resumen.convocatorias} texto={f.pestana === 'cerradas' ? 'convocatorias cerradas' : 'convocatorias que estás viendo'} />
            <Cifra valor={resumen.puestos} texto="puestos en juego" />
            {f.pestana === 'cerradas' ? (
              <Cifra valor={resumen.reciencerradas} texto="cerraron esta semana" />
            ) : (
              <Cifra valor={resumen.urgentes} texto="cierran esta semana" urgente={resumen.urgentes > 0} />
            )}
            <Cifra valor={resumen.fijas} texto="son plaza fija" />
          </div>

          {f.pestana !== 'cerradas' && (
            <Calendario
              plazas={filtradas}
              hoy={datos.hoy}
              diaElegido={f.dia}
              onElegirDia={(dia) => set({ dia })}
            />
          )}
        </div>

        {/* --------------------------------------------- fichas activas */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-base text-ink-3">{pestanaActual.pie}</p>
          {fichas.map((ficha, i) => (
            <button
              key={`${ficha.texto}-${i}`}
              type="button"
              onClick={ficha.quitar}
              className="bg-pine-soft text-pine-ink hover:bg-pine hover:text-white inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            >
              {ficha.texto}
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Quitar este filtro</span>
            </button>
          ))}
          {hayFiltros(f) && (
            <button
              type="button"
              onClick={() => set({ ...FILTROS_INICIALES, pestana: f.pestana, orden: f.orden, vista: f.vista })}
              className="hover:text-ink text-xs font-semibold text-ink-3 underline underline-offset-2"
            >
              Quitar todos
            </button>
          )}
        </div>

        {/* --------------------------------------------- resultados */}
        <div className={revalidando ? 'revalidando' : undefined}>
          {filtradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center">
              <p className="display mb-1.5 text-xl font-semibold">
                {f.pestana === 'guardadas' && guardadas.size === 0
                  ? 'Todavía no has guardado ninguna plaza'
                  : 'No hay ninguna plaza que cumpla lo que pides'}
              </p>
              <p className="text-base text-ink-3">
                {f.pestana === 'guardadas' && guardadas.size === 0
                  ? 'Pulsa la estrella de cualquier plaza y aparecerá aquí.'
                  : 'Prueba a quitar algún filtro.'}
              </p>
            </div>
          ) : f.vista === 'tabla' ? (
            <Tabla
              plazas={filtradas.slice(0, visibles)}
              guardadas={guardadas}
              onGuardar={alternaGuardada}
              onAbrir={setAbierta}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
              {filtradas.slice(0, visibles).map((p) => (
                <Tarjeta
                  key={p.id}
                  plaza={p}
                  guardada={guardadas.has(p.id)}
                  onGuardar={alternaGuardada}
                  onAbrir={setAbierta}
                />
              ))}
            </div>
          )}

          {visibles < filtradas.length && (
            <button
              type="button"
              onClick={() => setVisibles((v) => v + PAGINA)}
              className="hover:border-pine hover:text-pine mt-3 w-full rounded-xl border border-line bg-surface py-3.5 text-base font-semibold text-ink-2 transition-colors"
            >
              Ver más — quedan {plural(filtradas.length - visibles, 'plaza', 'plazas')}
            </button>
          )}
        </div>

        <footer className="mt-10 border-t border-line pt-5 pb-12 text-base leading-relaxed text-ink-2">
          <p className="mb-2 max-w-[76ch]">
            <strong className="text-ink">De dónde salen los datos.</strong> Del portal CIDO de la
            Diputació de Barcelona y de los portales Convoca de Badalona, El Masnou y Santa Coloma.
            Se actualiza solo varias veces al día.
          </p>
          <p className="mb-2 max-w-[76ch]">
            <strong className="text-ink">Comprueba dos cosas antes de apuntarte.</strong> El lugar de
            trabajo, porque hay organismos con sede en Barcelona que convocan plazas en otras
            comarcas; y el plazo exacto, que manda lo que diga la convocatoria oficial y no esta
            página.
          </p>
          <p className="text-sm text-ink-3">
            No se incluyen plazas de policía, guardia urbana ni mossos. Tampoco universidades,
            hospitales ni centros de investigación.
          </p>
        </footer>
      </main>

      <Detalle
        plaza={abierta}
        guardada={abierta ? guardadas.has(abierta.id) : false}
        onGuardar={alternaGuardada}
        onCerrar={() => setAbierta(null)}
      />
    </>
  );
}
