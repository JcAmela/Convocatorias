import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Plaza, Tablero as Datos } from '../lib/tipos';
import { API } from '../lib/datos';
import {
  aplica, cuenta, ordena, hayFiltros, aQuery, deQuery, claseContrato,
  FILTROS_INICIALES, type Filtros as F, type Pestana,
} from '../lib/filtros';
import { urgencia, fechaLarga, plural, NIVEL_CORTO, ETIQUETA_AMBITO } from '../lib/formato';
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
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      {/* Cifra grande: sans y cifras proporcionales, que a este tamaño las
          tabulares se ven sueltas. */}
      <p className={`text-[30px] leading-none font-semibold tracking-tight ${urgente ? 'text-rust' : ''}`}>
        {valor.toLocaleString('es-ES')}
      </p>
      <p className="mt-1.5 text-[13px] leading-tight text-ink-3">{texto}</p>
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
    montado.current = true;
  }, []);

  /* --- datos frescos: la página se sirve estática y se revalida al abrir - */

  useEffect(() => {
    let vivo = true;
    setRevalidando(true);
    fetch(API, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`el servidor respondió ${r.status}`))))
      .then((d: Datos) => { if (vivo) { setDatos(d); setFallo(null); } })
      .catch((e: Error) => { if (vivo) setFallo(e.message); })
      .finally(() => { if (vivo) setRevalidando(false); });
    return () => { vivo = false; };
  }, []);

  /* --- la URL refleja lo que estás viendo, para compartir o guardar ------ */

  useEffect(() => {
    if (!montado.current) return;
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
    lejos: aplica(base, f, 'cerca').filter((p) => p.lejos).length,
  }), [base, f]);

  const resumen = useMemo(() => ({
    convocatorias: filtradas.length,
    puestos: filtradas.reduce((s, p) => s + (p.plazas ?? 0), 0),
    urgentes: filtradas.filter((p) => p.diasRestantes !== null && p.diasRestantes <= 7).length,
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
  if (f.soloCerca) fichas.push({ texto: 'Solo cerca de casa', quitar: () => set({ soloCerca: false }) });
  if (f.dia) fichas.push({ texto: `Cierra el ${fechaLarga(f.dia)}`, quitar: () => set({ dia: null }) });

  return (
    <>
      {/* ------------------------------------------------------- cabecera */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2">
              <svg viewBox="0 0 24 24" className="size-5">
                <rect x="3" y="4" width="18" height="4" rx="1.4" fill="var(--color-pine)" />
                <rect x="3" y="11" width="11" height="3" rx="1.4" fill="var(--color-ochre)" />
                <rect x="3" y="17" width="15" height="3" rx="1.4" fill="var(--color-ink-3)" />
              </svg>
            </span>
            <div>
              <h1 className="display text-[22px] leading-none font-bold">Convocatorias</h1>
              <p className="mt-1 text-[12.5px] text-ink-3">
                Barcelona, Badalona, Santa Coloma, Sant Adrià, Montgat, Tiana, Alella y El Masnou
                · Generalitat · Diputación
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
          <p
            className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[12px] text-ink-3"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${fallo ? 'bg-rust' : revalidando ? 'bg-ochre' : 'bg-pine'}`}
            />
            {fallo
              ? 'Datos de la última copia'
              : revalidando
                ? 'Buscando novedades…'
                : generado
                  ? `Actualizado a las ${generado.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Sin fecha de actualización'}
          </p>
          <Tema />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-5">
        {datos.errores.length > 0 && (
          <p className="bg-ochre-soft text-ochre mb-4 rounded-lg px-3 py-2 text-[13.5px]">
            <strong className="font-bold">Aviso: </strong>
            {datos.errores.join('. ')}
          </p>
        )}

        {/* ------------------------------------------------- pestañas */}
        <nav className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Estado de la plaza">
          {PESTANAS.map((p) => {
            const activa = f.pestana === p.valor;
            return (
              <button
                key={p.valor}
                role="tab"
                aria-selected={activa}
                onClick={() => set({ pestana: p.valor, dia: null })}
                className={`-mb-px flex items-center gap-2 border-b-[3px] px-3 py-2 text-[14px] font-semibold transition-colors ${
                  activa ? 'border-pine text-ink' : 'hover:text-ink border-transparent text-ink-3'
                }`}
              >
                {p.texto}
                <span
                  className={`rounded-full px-1.5 font-mono text-[11.5px] tabular-nums ${
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
          <Filtros filtros={f} set={set} conteos={conteos} />

          {/* Las cifras y el gráfico describen lo que hay filtrado ahora
              mismo, no el total: si no, contarían otra película. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Cifra valor={resumen.convocatorias} texto={f.pestana === 'cerradas' ? 'convocatorias cerradas' : 'convocatorias que estás viendo'} />
            <Cifra valor={resumen.puestos} texto="puestos en juego" />
            <Cifra valor={resumen.urgentes} texto="cierran esta semana" urgente={resumen.urgentes > 0} />
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
          <p className="text-[13.5px] text-ink-3">{pestanaActual.pie}</p>
          {fichas.map((ficha, i) => (
            <button
              key={`${ficha.texto}-${i}`}
              type="button"
              onClick={ficha.quitar}
              className="bg-pine-soft text-pine-ink hover:bg-pine hover:text-white inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold transition-colors"
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
              className="hover:text-ink text-[12.5px] font-semibold text-ink-3 underline underline-offset-2"
            >
              Quitar todos
            </button>
          )}
        </div>

        {/* --------------------------------------------- resultados */}
        <div className={revalidando ? 'revalidando' : undefined}>
          {filtradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center">
              <p className="display mb-1 text-[18px] font-semibold">
                {f.pestana === 'guardadas' && guardadas.size === 0
                  ? 'Todavía no has guardado ninguna plaza'
                  : 'No hay ninguna plaza que cumpla lo que pides'}
              </p>
              <p className="text-[14px] text-ink-3">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
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
              className="hover:border-pine hover:text-pine mt-3 w-full rounded-xl border border-line bg-surface py-3 text-[14.5px] font-semibold text-ink-2 transition-colors"
            >
              Ver más — quedan {plural(filtradas.length - visibles, 'plaza', 'plazas')}
            </button>
          )}
        </div>

        <footer className="mt-8 border-t border-line pt-5 pb-12 text-[13.5px] leading-relaxed text-ink-2">
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
          <p className="text-[12.5px] text-ink-3">
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
