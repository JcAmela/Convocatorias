import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Plaza, Tablero as Datos } from '../lib/tipos';
import { API, esTablero, saneaTablero } from '../lib/datos';
import {
  aplica, cuenta, cuentaVarias, ordena, hayFiltros, aQuery, deQuery, claseContrato,
  FILTROS_INICIALES, type Filtros as F, type Pestana,
} from '../lib/filtros';
import { urgencia, fechaLarga, plural, NIVEL_CORTO, ETIQUETA_AMBITO, URGENCIAS } from '../lib/formato';
import {
  usaSitios, catalogoDe, idsFiltroLugar, sitio, todosLosSitios,
  SIN_LUGAR, TEXTO_SIN_LUGAR, TEXTO_SOLO_CERCA,
} from '../lib/localizacion';
import { estaCerca, referenciaGuardada, guardaReferencia, RADIO_CERCA_KM } from '../lib/cercania';
import { Filtros } from './Filtros';
import { Calendario } from './Calendario';
import { Tarjeta } from './Tarjeta';
import { Tabla } from './Tabla';
import { Detalle } from './Detalle';
import { Tema } from './Tema';
import { Limite } from './Limite';

const CLAVE_GUARDADAS = 'convocatorias:guardadas';
const PAGINA = 24;
/** Cuánto aguanta una copia antes de volver a pedirla al volver a la pestaña. */
const FRESCURA = 15 * 60 * 1000;

const PESTANAS: { valor: Pestana; texto: string; pie: string }[] = [
  { valor: 'abiertas', texto: 'Con plazo abierto', pie: 'Puedes presentar la solicitud ahora mismo.' },
  { valor: 'pendientes', texto: 'Sin plazo aún', pie: 'Anunciadas, pero todavía no se pueden pedir. Vigílalas.' },
  { valor: 'cerradas', texto: 'Ya cerradas', pie: 'El plazo pasó. Sirven para ver qué se suele convocar.' },
  { valor: 'guardadas', texto: 'Guardadas', pie: 'Las que has marcado con la estrella. Se quedan en este navegador.' },
];

/* ------------------------------------------------------------------ cifras */

function Cifra({ valor, texto, urgente }: { valor: number; texto: string; urgente?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3 sm:px-4 sm:py-3.5">
      {/* Cifra grande: sans y cifras proporcionales, que a este tamaño las
          tabulares se ven sueltas. */}
      <p className={`text-2xl font-semibold tracking-tight sm:text-3xl ${urgente ? 'text-rust' : ''}`}>
        {valor.toLocaleString('es-ES')}
      </p>
      <p className="mt-1.5 text-sm leading-tight text-balance text-ink-3 sm:mt-2">{texto}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- tablero */

export function Tablero({ inicial }: { inicial: Datos }) {
  const [datos, setDatos] = useState<Datos>(inicial);
  const [revalidando, setRevalidando] = useState(false);
  /**
   * Atenuar la lista y estar releyendo no son lo mismo. La primera lectura
   * ocurre sobre contenido que ya es real —viene servido con la página—, así
   * que bajarlo al 55% durante el viaje de ida y vuelta a la API solo lo hace
   * parecer roto: unos 280ms en una conexión buena, bastante más en un móvil.
   * La píldora de la cabecera ya avisa de que se está buscando, y esa señal
   * no estropea lo que se está leyendo.
   */
  const [atenua, setAtenua] = useState(false);
  const primeraLectura = useRef(true);
  const [fallo, setFallo] = useState<string | null>(null);
  const [f, setF] = useState<F>(FILTROS_INICIALES);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<Plaza | null>(null);
  const [visibles, setVisibles] = useState(PAGINA);
  const montado = useRef(false);
  const pidiendo = useRef(false);
  const ultimaLectura = useRef(0);

  /* --- arranque: filtros de la URL y guardadas del navegador ------------- */

  useEffect(() => {
    const inicial = deQuery(window.location.search.slice(1));
    // El municipio de referencia se recuerda entre visitas; si el enlace trae
    // uno, manda el del enlace.
    setF({ ...inicial, desde: inicial.desde ?? referenciaGuardada() });
    try {
      const crudo = localStorage.getItem(CLAVE_GUARDADAS);
      if (crudo) setGuardadas(new Set(JSON.parse(crudo) as string[]));
    } catch {
      // Navegador con el almacenamiento capado: se sigue sin guardadas.
    }
  }, []);

  /* --- datos frescos: la página se sirve estática y se revalida al abrir - */

  const refresca = useCallback(() => {
    if (pidiendo.current) return;
    pidiendo.current = true;
    setRevalidando(true);
    if (!primeraLectura.current) setAtenua(true);
    fetch(API, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`el servidor respondió ${r.status}`))))
      .then((d: unknown) => {
        if (!esTablero(d)) throw new Error('el servidor devolvió algo que no es un tablero');
        setDatos(saneaTablero(d));
        setFallo(null);
        ultimaLectura.current = Date.now();
      })
      .catch((e: Error) => setFallo(e.message))
      .finally(() => {
        pidiendo.current = false;
        primeraLectura.current = false;
        setRevalidando(false);
        setAtenua(false);
      });
  }, []);

  useEffect(() => { refresca(); }, [refresca]);

  /**
   * Los días que quedan los calcula el servidor con la fecha de su respuesta,
   * así que una pestaña abierta desde ayer miente: dice «Cierra mañana» de algo
   * que cerró anoche. Al volver a la pestaña se piden datos otra vez si la
   * copia ya tiene un rato.
   */
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaLectura.current > FRESCURA) refresca();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [refresca]);

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

  /**
   * Flechas para moverse entre pestañas, como manda el patrón de `tablist`:
   * decíamos `role="tab"` pero se navegaba de una en una con el tabulador, que
   * es justo lo que ese papel promete que no hay que hacer.
   */
  const teclasPestanas = (e: React.KeyboardEvent<HTMLElement>) => {
    const saltos: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    const salto = saltos[e.key];
    const extremo = e.key === 'Home' ? 0 : e.key === 'End' ? PESTANAS.length - 1 : null;
    if (salto === undefined && extremo === null) return;
    e.preventDefault();
    const actual = PESTANAS.findIndex((p) => p.valor === f.pestana);
    const destino = extremo !== null
      ? extremo
      : (actual + salto + PESTANAS.length) % PESTANAS.length;
    setF((antes) => ({ ...antes, pestana: PESTANAS[destino].valor, dia: null }));
    setVisibles(PAGINA);
    document.getElementById(`pestana-${PESTANAS[destino].valor}`)?.focus();
  };

  const set = useCallback((parcial: Partial<F>) => {
    setF((antes) => {
      // El pueblo desde el que se miden las distancias se queda en este
      // navegador: es un ajuste de quien mira, no un filtro de la búsqueda.
      if ('desde' in parcial) guardaReferencia(parcial.desde ?? null);
      return { ...antes, ...parcial };
    });
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
   * El catálogo de sitios lo resuelve el servidor y viene con la respuesta. Se
   * fija antes de derivar nada, porque todo lo que sigue traduce
   * identificadores contra él.
   */
  useMemo(() => usaSitios(datos.sitios), [datos.sitios]);

  /** Los municipios y comarcas que aparecen de verdad, con su cuenta. */
  const lugares = useMemo(() => catalogoDe(todas), [todas]);

  /**
   * Todos los municipios de Cataluña, con cuántas convocatorias tiene cada uno,
   * para elegir desde dónde se miden las distancias. Sale el pueblo aunque hoy
   * no tenga nada: quien vive en él sigue queriendo medir desde allí.
   */
  const municipios = useMemo(() => {
    const conCuenta = new Map(lugares.map((l) => [l.id, l.n]));
    return todosLosSitios()
      .filter((s) => s.tipo === 'municipio')
      .map((s) => ({ ...s, n: conCuenta.get(s.id) ?? 0 }))
      .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
  }, [lugares, datos.sitios]);

  /**
   * Escribir en el buscador dispara seis pasadas completas sobre el conjunto
   * —la lista, el gráfico y los recuentos de cada faceta— más el repintado de
   * veinticuatro tarjetas. Medido de tecla a lista: entre 42 y 56ms en un
   * escritorio rápido, y un móvil de gama media tarda tres o cuatro veces
   * más. Como la caja es controlada, ese retraso es el que tardan las letras
   * en aparecer.
   *
   * Con el valor diferido, React pinta primero lo urgente —la letra escrita y
   * su ficha— y recalcula el resto en un pase aparte que puede interrumpir si
   * llega otra tecla. Lo que se escribe va al día; los resultados llegan un
   * instante después, que es el orden correcto.
   */
  const qDiferido = useDeferredValue(f.q);
  const fCalculo = useMemo(
    () => (qDiferido === f.q ? f : { ...f, q: qDiferido }),
    [f, qDiferido],
  );

  const base = useMemo(() => {
    if (f.pestana === 'guardadas') return todas.filter((p) => guardadas.has(p.id));
    return datos[f.pestana];
  }, [datos, f.pestana, guardadas, todas]);

  const filtradas = useMemo(
    () => ordena(aplica(base, fCalculo), fCalculo.orden, fCalculo.desde),
    [base, fCalculo],
  );

  /**
   * El gráfico se dibuja con todo menos el filtro de día. Alimentándolo con la
   * lista ya filtrada, al elegir un día las demás barras se iban a cero y el
   * gráfico se quedaba ciego: seguía pudiéndose pulsar otra columna, pero sin
   * ver dónde había algo era adivinar. Es el mismo criterio que usan los
   * recuentos de cada faceta.
   */
  const paraGrafico = useMemo(() => aplica(base, fCalculo, 'dia'), [base, fCalculo]);

  const conteos = useMemo(() => ({
    niveles: cuenta(base, fCalculo, 'niveles', (p) => (p.nivelCodigo && NIVEL_CORTO[p.nivelCodigo] ? p.nivelCodigo : null)),
    contratos: cuenta(base, fCalculo, 'contratos', claseContrato),
    ambitos: cuenta(base, fCalculo, 'ambitos', (p) => (ETIQUETA_AMBITO[p.ambito] ? p.ambito : null)),
    urgencias: cuenta(base, fCalculo, 'urgencias', (p) => urgencia(p.diasRestantes).cubo),
    lugares: cuentaVarias(base, fCalculo, 'lugares', idsFiltroLugar),
    // Sin municipio de referencia no hay nada «lejos» que contar.
    lejos: fCalculo.desde
      ? aplica(base, fCalculo, 'cerca').filter((p) => !estaCerca(p, fCalculo.desde)).length
      : 0,
  }), [base, fCalculo]);

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

  /**
   * Las guardadas se cuentan sobre las que siguen existiendo, no sobre lo que
   * hay en el almacenamiento: una convocatoria guardada hace meses desaparece
   * de la API cuando el origen la retira, y la pestaña prometía cinco para
   * luego enseñar tres.
   */
  const guardadasVivas = useMemo(
    () => todas.filter((p) => guardadas.has(p.id)).length,
    [todas, guardadas],
  );
  // El HTML del build solo trae las abiertas, así que hasta que llegan los
  // datos frescos las otras dos pestañas se cuentan con el resumen.
  const cuentaPestana = (v: Pestana) =>
    v === 'guardadas' ? guardadasVivas : (datos[v].length || datos.resumen[v] || 0);

  /** La pestaña dice que tiene convocatorias pero no han llegado. */
  const faltanDatos = f.pestana !== 'guardadas' &&
    datos[f.pestana].length === 0 && (datos.resumen[f.pestana] ?? 0) > 0;

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
    const nombre = id === SIN_LUGAR ? TEXTO_SIN_LUGAR : sitio(id)?.nombre ?? id;
    fichas.push({ texto: nombre, quitar: () => set({ lugares: f.lugares.filter((x) => x !== id) }) });
  }
  if (f.soloCerca) {
    const cerca = sitio(f.desde);
    fichas.push({
      texto: cerca ? `A menos de ${RADIO_CERCA_KM} km de ${cerca.nombre}` : TEXTO_SOLO_CERCA,
      quitar: () => set({ soloCerca: false }),
    });
  }
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
            {/* En móvil la frase se acorta, pero las tres procedencias se
                quedan: son lo que delimita qué hay aquí dentro. Dos líneas
                como mucho —tres era lo que ahogaba la primera pantalla. */}
            <p className="mt-0.5 text-sm text-ink-3 max-sm:line-clamp-2 sm:truncate">
              <span className="sm:hidden">Empleo público en toda Cataluña</span>
              <span className="hidden sm:inline">
                Ayuntamientos, consejos comarcales, Generalitat y diputaciones · Toda Cataluña
              </span>
            </p>
          </div>

          <div className="no-imprimir flex shrink-0 items-center gap-2">
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
                  {/* Por debajo de 360px ni la hora cabe: a 320 el nombre del
                      sitio se recortaba a "Convocatoria…", que es lo último
                      que debería cortarse de esta página. Ahí queda solo el
                      punto de color, y la hora sigue anunciándose para quien
                      use lector de pantalla. */}
                  <span className="font-mono tabular-nums max-[359px]:sr-only">
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
          className="tira no-imprimir -mx-4 mb-4 flex gap-1 border-b border-line px-4 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Estado de la plaza"
          onKeyDown={teclasPestanas}
        >
          {PESTANAS.map((p) => {
            const activa = f.pestana === p.valor;
            return (
              <button
                key={p.valor}
                id={`pestana-${p.valor}`}
                role="tab"
                aria-selected={activa}
                aria-controls="panel-plazas"
                // Una sola parada de tabulador para las cuatro: dentro se
                // circula con las flechas.
                tabIndex={activa ? 0 : -1}
                onClick={() => set({ pestana: p.valor, dia: null })}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-2.5 text-base font-semibold whitespace-nowrap transition-colors ${
                  activa ? 'border-pine text-ink' : 'hover:text-ink border-transparent text-ink-3'
                }`}
              >
                {p.texto}
                <span
                  /* Peso explícito: el botón es `font-semibold` y el contador
                     heredaba un 600 que la JetBrains Mono no tiene cargado, así
                     que el navegador lo fingía engordando el 500. En
                     monoespaciada a 11px ese falso negrita se ve emborronado. */
                  className={`rounded-full px-1.5 py-px font-mono text-2xs font-medium tabular-nums ${
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
          <div className="no-imprimir">
            <Filtros filtros={f} set={set} lugares={lugares} municipios={municipios} conteos={conteos} />
          </div>

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
            <div className="no-imprimir">
              <Calendario
                plazas={paraGrafico}
                hoy={datos.hoy}
                diaElegido={f.dia}
                onElegirDia={(dia) => set({ dia })}
              />
            </div>
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
        {/* Cuántas quedan, dicho en voz alta para quien no ve la cifra grande:
            sin esto, cambiar un filtro no anunciaba absolutamente nada. */}
        <p aria-live="polite" className="sr-only">
          {plural(filtradas.length, 'convocatoria encontrada', 'convocatorias encontradas')}
        </p>

        <div
          id="panel-plazas"
          role="tabpanel"
          aria-labelledby={`pestana-${f.pestana}`}
          className={atenua ? 'revalidando' : undefined}
        >
          <Limite>
            {filtradas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line py-16 text-center">
                {/* Sin datos ningún filtro sobra: decir "prueba a quitar algún
                    filtro" cuando lo que ha pasado es que la API no contesta
                    manda a buscar en el sitio equivocado. */}
                <p className="display mb-1.5 text-xl font-semibold">
                  {todas.length === 0 || faltanDatos
                    ? 'No se han podido cargar las convocatorias'
                    : f.pestana === 'guardadas' && guardadasVivas === 0
                      ? 'Todavía no has guardado ninguna plaza'
                      : 'No hay ninguna plaza que cumpla lo que pides'}
                </p>
                <p className="mx-auto max-w-[52ch] text-base text-ink-3">
                  {todas.length === 0 || faltanDatos
                    ? (fallo
                        ? `El servidor de datos no ha contestado (${fallo}). Vuelve a intentarlo en un rato.`
                        : 'El servidor de datos no ha contestado. Vuelve a intentarlo en un rato.')
                    : f.pestana === 'guardadas' && guardadasVivas === 0
                      ? 'Pulsa la estrella de cualquier plaza y aparecerá aquí.'
                      : 'Prueba a quitar algún filtro.'}
                </p>
                {todas.length === 0 || faltanDatos && (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="hover:border-pine hover:text-pine mt-4 rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-2 transition-colors"
                  >
                    Reintentar
                  </button>
                )}
                {/* «Prueba a quitar algún filtro» sin nada que pulsar manda a
                    buscar el remedio a otra parte de la página, justo cuando
                    quien lee está mirando aquí. La salida va donde está el
                    problema. */}
                {todas.length > 0 && hayFiltros(f) && (
                  <button
                    type="button"
                    onClick={() => set({ ...FILTROS_INICIALES, pestana: f.pestana, orden: f.orden, vista: f.vista })}
                    className="hover:border-pine hover:text-pine mt-4 rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-2 transition-colors"
                  >
                    Quitar todos los filtros
                  </button>
                )}
              </div>
            ) : f.vista === 'tabla' ? (
              <Tabla
                plazas={filtradas.slice(0, visibles)}
                desde={f.desde}
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
                    desde={f.desde}
                    guardada={guardadas.has(p.id)}
                    onGuardar={alternaGuardada}
                    onAbrir={setAbierta}
                  />
                ))}
              </div>
            )}
          </Limite>

          {visibles < filtradas.length && (
            <button
              type="button"
              onClick={() => setVisibles((v) => v + PAGINA)}
              className="no-imprimir hover:border-pine hover:text-pine mt-3 w-full rounded-xl border border-line bg-surface py-3.5 text-base font-semibold text-ink-2 transition-colors"
            >
              Ver más — quedan {plural(filtradas.length - visibles, 'plaza', 'plazas')}
            </button>
          )}
        </div>

        <footer className="mt-10 border-t border-line pt-5 pb-12 text-base leading-relaxed text-ink-2">
          <p className="mb-2 max-w-[76ch]">
            <strong className="text-ink">De dónde salen los datos.</strong> Del portal CIDO de la
            Diputació de Barcelona y de los portales Convoca de Badalona, El Masnou y Santa Coloma.
            Entran los ayuntamientos de las cuatro provincias, los consejos comarcales, la
            Generalitat y las diputaciones: unas mil convocatorias vivas repartidas por toda
            Cataluña. Se actualiza solo varias veces al día.
          </p>
          <p className="mb-2 max-w-[76ch]">
            <strong className="text-ink">Comprueba dos cosas antes de apuntarte.</strong> El lugar de
            trabajo: cuando el anuncio no lo dice, aquí verás el municipio del organismo con un
            asterisco, y eso no es lo mismo —muchas bolsas cubren varios centros a la vez—; y el
            plazo exacto, que manda lo que diga la convocatoria oficial y no esta página.
          </p>
          <p className="text-sm text-ink-3">
            No se incluyen plazas de policía, guardia urbana ni mossos. Tampoco universidades,
            hospitales ni centros de investigación.
          </p>
        </footer>
      </main>

      <Detalle
        plaza={abierta}
        desde={f.desde}
        guardada={abierta ? guardadas.has(abierta.id) : false}
        onGuardar={alternaGuardada}
        onCerrar={() => setAbierta(null)}
      />
    </>
  );
}
