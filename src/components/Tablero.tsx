import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Grupo, Plaza, Tablero as Datos } from '../lib/tipos';
import { saneaPlazas, saneaSitios } from '../lib/datos';
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
import { rutaFicha, tieneFicha } from '../lib/rutas';
import { Filtros } from './Filtros';
import { Calendario } from './Calendario';
import { Tarjeta } from './Tarjeta';
import { Tabla } from './Tabla';
import { Detalle } from './Detalle';
import { Tema } from './Tema';
import { Limite } from './Limite';
import { Avisame } from './Avisame';

const CLAVE_GUARDADAS = 'convocatorias:guardadas';
/** Tiene que coincidir con `PRIMERA_PAGINA` en `lib/publicos.ts`, que elige las que trae el HTML. */
const PAGINA = 24;
/** Cada cuánto, al volver a la pestaña, se mira si hay datos nuevos publicados. */
const FRESCURA = 15 * 60 * 1000;

/** Lo que se pide a `/datos/`. Las listas necesitan además los sitios para pintar el lugar. */
type Carga = Grupo | 'sitios';

/** Un fichero de `/datos/` leído: de qué publicación es y cómo meterlo en los datos. */
interface Lectura {
  generado: string | undefined;
  aplicar: (d: Datos) => Datos;
}

/**
 * Lo que trae la portada cuando no trae todas las abiertas: el HTML solo
 * lleva las primeras 24 y, para el calendario, la fecha y los puestos de las
 * que cierran en los próximos días.
 */
export interface Parcial {
  calendario: Pick<Plaza, 'fin' | 'plazas'>[];
}

/**
 * ¿Lo que se está viendo depende de tener todas las abiertas? Sin filtros, por
 * fecha de cierre y en la primera página, las 24 del HTML son exactamente las
 * que tocan. Cualquier otra cosa necesita la lista entera.
 */
function necesitaTodas(f: F): boolean {
  return f.pestana !== 'abiertas' || hayFiltros(f) || f.orden !== FILTROS_INICIALES.orden;
}

const PESTANAS: { valor: Pestana; texto: string; pie: string }[] = [
  { valor: 'abiertas', texto: 'Con plazo abierto', pie: 'Puedes presentar la solicitud ahora mismo.' },
  { valor: 'pendientes', texto: 'Sin plazo aún', pie: 'Anunciadas, pero todavía no se pueden pedir. Vigílalas.' },
  { valor: 'cerradas', texto: 'Ya cerradas', pie: 'El plazo pasó. Sirven para ver qué se suele convocar.' },
  { valor: 'guardadas', texto: 'Guardadas', pie: 'Las que has marcado con la estrella. Se quedan en este navegador.' },
];

/* ------------------------------------------------------------------ cifras */

function Cifra({ valor, texto, urgente }: { valor: number | null; texto: string; urgente?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3 sm:px-4 sm:py-3.5">
      {/* Cifra grande: sans y cifras proporcionales, que a este tamaño las
          tabulares se ven sueltas. Sin valor, los datos vienen de camino: un
          número inventado sería peor que esperar. */}
      <p className={`text-2xl font-semibold sm:text-3xl ${urgente ? 'text-rust' : ''}`}>
        {valor === null
          ? <><span aria-hidden="true" className="text-ink-3">…</span><span className="sr-only">cargando</span></>
          : valor.toLocaleString('es-ES')}
      </p>
      <p className="mt-1.5 text-sm leading-tight text-balance text-ink-3 sm:mt-2">{texto}</p>
    </div>
  );
}

/** «9 de octubre de 2026», en hora de Madrid: el build y el navegador escriben lo mismo. */
function fechaDatos(generado: string): string {
  const d = new Date(generado);
  return Number.isNaN(d.getTime())
    ? 'fecha desconocida'
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
}

/* ----------------------------------------------------------------- tablero */

export function Tablero({ inicial, parcial }: { inicial: Datos; parcial?: Parcial }) {
  const [datos, setDatos] = useState<Datos>(inicial);
  const [revalidando, setRevalidando] = useState(false);
  /**
   * Atenuar la lista y estar releyendo no son lo mismo. Solo se atenúa al
   * cambiar unos datos que ya estaban en pantalla por otros publicados
   * después; cargar lo que aún no había no estropea lo que se está leyendo.
   */
  const [atenua, setAtenua] = useState(false);
  /**
   * Lo que falló, fichero a fichero. Con un solo «fallo» para todo, que
   * llegaran bien los sitios borraba el error de las cerradas y la pestaña se
   * quedaba en «Cargando…» para siempre, sin aviso y sin forma de reintentar.
   * `meta` es la comprobación de datos nuevos al volver a la pestaña.
   */
  const [fallos, setFallos] = useState<Partial<Record<Carga | 'meta', string>>>({});
  const [f, setF] = useState<F>(FILTROS_INICIALES);
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<Plaza | null>(null);
  const [visibles, setVisibles] = useState(PAGINA);
  const montado = useRef(false);
  const pidiendo = useRef(false);
  const ultimaLectura = useRef(0);
  const datosRef = useRef(datos);
  const guardadasRef = useRef(guardadas);
  useEffect(() => { datosRef.current = datos; }, [datos]);
  useEffect(() => { guardadasRef.current = guardadas; }, [guardadas]);

  /**
   * Qué hay ya en memoria. Con `parcial`, el HTML solo trae las primeras
   * abiertas y los sitios que necesitan; pendientes y cerradas no vienen
   * nunca en el HTML.
   */
  const [cargadas, setCargadas] = useState<Record<Carga, boolean>>({
    sitios: !parcial, abiertas: !parcial, pendientes: false, cerradas: false,
  });
  const cargadasRef = useRef(cargadas);
  const enCurso = useRef(new Set<Carga>());

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

  /* --- datos: ficheros estáticos de /datos/, pedidos cuando hacen falta - */

  /** Un fichero de `/datos/`: de qué publicación es y cómo meterlo en `datos`. */
  const pide = useCallback(async (c: Carga, cache?: RequestCache): Promise<Lectura> => {
    const r = await fetch(`/datos/${c}.json`, cache ? { cache } : undefined);
    if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
    const d = await r.json() as { generado?: string; sitios?: unknown; plazas?: unknown };
    return {
      generado: d.generado,
      aplicar: (antes) => c === 'sitios'
        ? { ...antes, sitios: saneaSitios(d.sitios as Datos['sitios']) }
        : { ...antes, [c]: saneaPlazas(d.plazas) },
    };
  }, []);

  const marca = useCallback((cs: Carga[]) => {
    cargadasRef.current = { ...cargadasRef.current, ...Object.fromEntries(cs.map((c) => [c, true])) };
    setCargadas(cargadasRef.current);
  }, []);
  const quitaFallos = useCallback((cs: (Carga | 'meta')[]) => setFallos((antes) => {
    if (!cs.some((c) => c in antes)) return antes;
    const nuevo = { ...antes };
    for (const c of cs) delete nuevo[c];
    return nuevo;
  }), []);

  /**
   * El callejero se pide una sola vez aunque lo necesiten varias listas a la
   * vez. Si falla, se olvida la promesa para que el siguiente intento vuelva a
   * pedirlo.
   */
  const sitiosEnCamino = useRef<Promise<Lectura> | null>(null);
  const traeSitios = useCallback(() => {
    sitiosEnCamino.current ??= pide('sitios').catch((e) => { sitiosEnCamino.current = null; throw e; });
    return sitiosEnCamino.current;
  }, [pide]);

  // `asegura` y `refresca` se llaman la una a la otra.
  const refrescaRef = useRef<(extra?: Grupo[]) => Promise<void>>(async () => {});
  const aseguraRef = useRef<(grupos: Grupo[]) => void>(() => {});

  /**
   * Trae lo que falte de estas listas. Una lista no entra nunca sin el
   * callejero entero: filtrada con el de las 24 primeras daba «0 plazas» en
   * un enlace a una comarca, y como las plazas ya no cambiaban, nada volvía a
   * calcularse al llegar el callejero. Lo que ya está o ya se está pidiendo no
   * se vuelve a pedir.
   */
  const asegura = useCallback((grupos: Grupo[]) => {
    for (const g of grupos) {
      if (cargadasRef.current[g] || enCurso.current.has(g)) continue;
      enCurso.current.add(g);
      quitaFallos([g]);
      const conSitios = !cargadasRef.current.sitios;
      Promise.all([conSitios ? traeSitios() : null, pide(g)])
        .then(([s, l]) => {
          // Un fichero de otra publicación —la de esta mañana ha salido con la
          // pestaña abierta— no se mezcla con lo que hay: se recarga todo junto.
          const actual = datosRef.current.generado;
          if ((s && s.generado !== actual) || l.generado !== actual) {
            void refrescaRef.current([g]);
            return;
          }
          setDatos((d) => l.aplicar(s ? s.aplicar(d) : d));
          marca(s ? ['sitios', g] : [g]);
        })
        .catch((e: Error) => setFallos((antes) => ({ ...antes, [g]: e.message })))
        .finally(() => enCurso.current.delete(g));
    }
  }, [pide, traeSitios, marca, quitaFallos]);

  /**
   * Sin nada que lo pida antes, las abiertas se traen cuando el navegador
   * queda libre: la primera pintada no espera por ellas. Quien tiene
   * guardadas necesita además las otras dos listas para contarlas.
   */
  useEffect(() => {
    ultimaLectura.current = Date.now();
    const trae = () => asegura(guardadasRef.current.size
      ? ['abiertas', 'pendientes', 'cerradas'] : ['abiertas']);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(trae, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    // Safari no tiene `requestIdleCallback`.
    const id = setTimeout(trae, 1200);
    return () => clearTimeout(id);
  }, [asegura]);

  /**
   * Lo que se está viendo decide qué hace falta ya: un filtro o un orden
   * necesitan todas las abiertas; cada pestaña, su lista; las guardadas, las
   * tres; un municipio de referencia, el callejero, que llega con las abiertas.
   */
  const necesita = necesitaTodas(f) || visibles > PAGINA || Boolean(f.desde);
  useEffect(() => {
    const grupos: Grupo[] = [];
    if (necesita) grupos.push('abiertas');
    if (f.pestana === 'pendientes' || f.pestana === 'cerradas') grupos.push(f.pestana);
    if (f.pestana === 'guardadas') grupos.push('abiertas', 'pendientes', 'cerradas');
    if (grupos.length) asegura(grupos);
  }, [necesita, f.pestana, asegura]);

  /**
   * ¿Hay datos más nuevos publicados? Se mira `meta.json`, que son unos
   * cientos de bytes, y solo si cambió se vuelve a pedir lo que ya estaba
   * cargado, todo de una vez para no mezclar publicaciones. `extra` son las
   * listas que alguien pidió y llegaron de otra publicación: se traen con las
   * demás aunque `meta.json` diga que no hay nada nuevo.
   */
  const extraPendiente = useRef(new Set<Grupo>());
  const refresca = useCallback(async (extra: Grupo[] = []) => {
    for (const g of extra) extraPendiente.current.add(g);
    if (pidiendo.current) return;
    pidiendo.current = true;
    const forzar = extraPendiente.current.size > 0;
    try {
      const r = await fetch('/datos/meta.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
      const meta = await r.json() as Pick<Datos, 'generado' | 'hoy' | 'resumen' | 'errores'>;
      ultimaLectura.current = Date.now();
      quitaFallos(['meta']);
      if (!forzar && meta.generado === datosRef.current.generado) return;

      setRevalidando(true);
      setAtenua(true);
      // Las primeras 24 del HTML también caducan: se traen las abiertas
      // enteras aunque todavía no se hubieran pedido.
      const cargas = (['sitios', 'abiertas', 'pendientes', 'cerradas'] as Carga[]).filter((c) =>
        c === 'sitios' || c === 'abiertas' || cargadasRef.current[c] || extraPendiente.current.has(c as Grupo));
      const lecturas = await Promise.all(cargas.map((c) => pide(c, 'no-cache')));
      if (lecturas.some((l) => l.generado !== meta.generado)) {
        throw new Error('se están publicando datos nuevos; vuelve a intentarlo en un minuto');
      }
      setDatos((antes) => lecturas.reduce((d, l) => l.aplicar(d), {
        ...antes, generado: meta.generado, hoy: meta.hoy, resumen: meta.resumen, errores: meta.errores ?? [],
      }));
      sitiosEnCamino.current = null;
      marca(cargas);
      quitaFallos(cargas);
      extraPendiente.current.clear();
    } catch (e) {
      const mensaje = (e as Error).message;
      const afectadas = [...extraPendiente.current];
      setFallos((antes) => {
        const nuevo = { ...antes, meta: mensaje };
        for (const g of afectadas) nuevo[g] = mensaje;
        return nuevo;
      });
      extraPendiente.current.clear();
    } finally {
      pidiendo.current = false;
      setRevalidando(false);
      setAtenua(false);
      // Lo que se pidió mientras esta pasada ya estaba en marcha.
      const quedan = [...extraPendiente.current].filter((g) => !cargadasRef.current[g]);
      extraPendiente.current.clear();
      if (quedan.length) aseguraRef.current(quedan);
    }
  }, [pide, marca, quitaFallos]);
  useEffect(() => { refrescaRef.current = refresca; aseguraRef.current = asegura; }, [refresca, asegura]);

  /**
   * Los días que quedan se calculan con la fecha de los datos, así que una
   * pestaña abierta desde ayer miente: dice «Cierra mañana» de algo que cerró
   * anoche. Al volver a la pestaña, si la copia ya tiene un rato, se mira si
   * se ha publicado otra.
   */
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaLectura.current > FRESCURA) void refresca();
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

  // La página propia de cada convocatoria, si este build la generó: las
  // cerradas de hace más de un mes ya no la tienen (`rutas.ts`).
  const enlaceFicha = useCallback(
    (p: Plaza) => (tieneFicha(p, datos.hoy) ? rutaFicha(p) : undefined),
    [datos.hoy],
  );

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
   * El panel de detalle guarda la plaza, no su identificador, así que se
   * quedaba clavado en la copia con la que se abrió. Una pestaña que pasa la
   * noche abierta revalida al volver a ella, y el panel seguía diciendo
   * «Cierra mañana» de algo que ya había cerrado: justo el dato por el que se
   * abre esta ficha. Se vuelve a buscar por id sobre los datos nuevos.
   *
   * Si ya no está en ninguna lista no se cierra solo —quitarle el panel de
   * delante a quien estaba leyéndolo es peor—: se queda la última copia
   * conocida, que es lo que había antes para todas.
   */
  useEffect(() => {
    setAbierta((antes) => {
      if (!antes) return antes;
      const fresca = todas.find((p) => p.id === antes.id);
      return fresca && fresca !== antes ? fresca : antes;
    });
  }, [todas]);

  /**
   * El catálogo de sitios lo resuelve el servidor y viene con la respuesta. Se
   * fija antes de derivar nada, porque todo lo que sigue traduce
   * identificadores contra él.
   */
  useMemo(() => usaSitios(datos.sitios), [datos.sitios]);

  /** Los municipios y comarcas que aparecen de verdad, con su cuenta. */
  const lugares = useMemo(() => catalogoDe(todas), [todas, datos.sitios]);

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
  // Nota: la dependencia es `f` entero a propósito —cualquier filtro cambia el
  // cálculo—, pero eso hace que el render urgente de cada tecla recalcule con
  // la consulta anterior. Ese pase es desechable y se descarta abajo.

  const base = useMemo(() => {
    if (f.pestana === 'guardadas') return todas.filter((p) => guardadas.has(p.id));
    return datos[f.pestana];
  }, [datos, f.pestana, guardadas, todas]);

  const filtradas = useMemo(
    () => ordena(aplica(base, fCalculo), fCalculo.orden, fCalculo.desde),
    [base, fCalculo, datos.sitios],
  );

  /**
   * El gráfico se dibuja con todo menos el filtro de día. Alimentándolo con la
   * lista ya filtrada, al elegir un día las demás barras se iban a cero y el
   * gráfico se quedaba ciego: seguía pudiéndose pulsar otra columna, pero sin
   * ver dónde había algo era adivinar. Es el mismo criterio que usan los
   * recuentos de cada faceta.
   */
  const paraGrafico = useMemo(() => aplica(base, fCalculo, 'dia'), [base, fCalculo, datos.sitios]);

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
  }), [base, fCalculo, datos.sitios]);

  /** Solo están las primeras abiertas del HTML; el resto viene de camino. */
  const enParcial = !cargadas.abiertas;
  /**
   * Las listas sin las que lo que se está viendo sería mentira. Sin filtros,
   * por fecha de cierre, las 24 del HTML bastan; «Ver más» tampoco cuenta,
   * porque esas 24 siguen siendo verdad mientras llegan las demás.
   */
  const necesarias: Grupo[] = f.pestana === 'guardadas'
    ? ['abiertas', 'pendientes', 'cerradas']
    : f.pestana === 'abiertas'
      ? (necesitaTodas(f) ? ['abiertas'] : [])
      : [f.pestana];
  /** Filtrar 24 de mil daría una lista y unas cifras falsas: mientras, se dice que se carga. */
  const esperando = necesarias.some((g) => !cargadas[g]);
  /** Por qué no ha llegado lo que hace falta, si es que falló. */
  const falloVista = necesarias.map((g) => (cargadas[g] ? undefined : fallos[g])).find(Boolean) ?? null;
  /** Para la píldora de la cabecera: cualquier cosa que haya fallado. */
  const fallo = falloVista ?? fallos.meta ?? Object.values(fallos).find(Boolean) ?? null;
  const reintenta = () => asegura(necesarias.length ? necesarias : ['abiertas']);

  const resumen = useMemo(() => {
    // Sin filtros, las cuentas de todas las abiertas vienen hechas del build.
    if (enParcial && f.pestana === 'abiertas' && !necesitaTodas(f)) {
      const r = datos.resumen;
      return { convocatorias: r.abiertas, puestos: r.plazas, urgentes: r.cierranEn7Dias, reciencerradas: 0, fijas: r.fijas };
    }
    return {
      convocatorias: filtradas.length,
      puestos: filtradas.reduce((s, p) => s + (p.plazas ?? 0), 0),
      // Los días negativos son plazos vencidos: contarlos como «cierran esta
      // semana» pintaba de rojo la pestaña entera de cerradas.
      urgentes: filtradas.filter((p) => p.diasRestantes !== null && p.diasRestantes >= 0 && p.diasRestantes <= 7).length,
      reciencerradas: filtradas.filter((p) => p.diasRestantes !== null && p.diasRestantes < 0 && p.diasRestantes >= -7).length,
      fijas: filtradas.filter((p) => p.fijo).length,
    };
  }, [filtradas, enParcial, f, datos.resumen]);

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
  const todasCargadas = cargadas.abiertas && cargadas.pendientes && cargadas.cerradas;
  // Hasta que llega una lista, su pestaña se cuenta con el resumen del build.
  // Las guardadas se cuentan sobre las que existen solo cuando están las tres
  // listas; antes, con lo que hay en el navegador.
  // Lo guardado en el navegador puede incluir convocatorias retiradas: hasta
  // tener las tres listas no se sabe cuántas siguen vivas, y se dice «…».
  const cuentaPestana = (v: Pestana): number | string =>
    v === 'guardadas'
      ? (todasCargadas ? guardadasVivas : guardadas.size ? '…' : 0)
      : (cargadas[v] ? datos[v].length : datos.resumen[v] ?? 0);

  /** La lista que se pide no ha llegado y la última petición falló. */
  const faltanDatos = esperando && falloVista !== null;

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
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
            <svg viewBox="0 0 24 24" className="size-5">
              <rect x="3" y="4" width="18" height="4" rx="1.4" fill="var(--color-pine)" />
              <rect x="3" y="11" width="11" height="3" rx="1.4" fill="var(--color-ochre)" />
              <rect x="3" y="17" width="15" height="3" rx="1.4" fill="var(--color-ink-3)" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold sm:text-2xl">Convocatorias</h1>
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
                  {/* La zona va fija a Madrid. Sin ella, esta hora la
                      formateaba el servidor de Vercel en UTC al construir y
                      el navegador en horario local al hidratar: 08:30 en el
                      HTML contra 10:30 en pantalla, y React tiraba un error
                      de hidratación en cada carga de producción. En local no
                      se veía porque la máquina ya iba en esta zona. */}
                  {/* Solo la hora va en monoespaciada: es lo único que cambia
                      cada rato, y así no baila el ancho de la píldora. */}
                  {/* Por debajo de 360px ni la hora cabe: a 320 el nombre del
                      sitio se recortaba a "Convocatoria…", que es lo último
                      que debería cortarse de esta página. Ahí queda solo el
                      punto de color, y la hora sigue anunciándose para quien
                      use lector de pantalla. */}
                  <span className="tabular-nums max-[359px]:sr-only">
                    {generado.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}
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
          <p className="bg-ochre-soft text-ochre mb-4 rounded-md px-3 py-2 text-base">
            <strong className="font-semibold">Aviso: </strong>
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
                aria-controls="contenido"
                // Una sola parada de tabulador para las cuatro: dentro se
                // circula con las flechas.
                tabIndex={activa ? 0 : -1}
                onClick={() => set({ pestana: p.valor, dia: null })}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-2.5 text-base font-semibold whitespace-nowrap pulsa ${
                  activa ? 'border-pine text-ink' : 'hover:text-ink border-transparent text-ink-3'
                }`}
              >
                {p.texto}
                <span
                  /* Peso explícito: el contador es secundario y no hereda el
                     600 de la pestaña. */
                  className={`rounded-full px-1.5 py-px text-xs font-medium tabular-nums ${
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
          {/* Tocar los filtros es la señal de que van a hacer falta todas
              las abiertas: los recuentos de cada menú salen de ellas. */}
          <div
            className="no-imprimir"
            onPointerDownCapture={() => asegura(['abiertas'])}
            onFocusCapture={() => asegura(['abiertas'])}
          >
            <Filtros
              filtros={f} set={set} lugares={lugares} municipios={municipios} conteos={conteos}
              cargando={esperando || (f.pestana === 'abiertas' && enParcial) || !cargadas.sitios}
            />
          </div>

          {/* Las cifras y el gráfico describen lo que hay filtrado ahora
              mismo, no el total: si no, contarían otra película. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Cifra valor={esperando ? null : resumen.convocatorias} texto={f.pestana === 'cerradas' ? 'convocatorias cerradas' : 'convocatorias que estás viendo'} />
            <Cifra valor={esperando ? null : resumen.puestos} texto="puestos en juego" />
            {f.pestana === 'cerradas' ? (
              <Cifra valor={esperando ? null : resumen.reciencerradas} texto="cerraron esta semana" />
            ) : (
              <Cifra valor={esperando ? null : resumen.urgentes} texto="cierran esta semana" urgente={!esperando && resumen.urgentes > 0} />
            )}
            <Cifra valor={esperando ? null : resumen.fijas} texto="son plaza fija" />
          </div>

          {f.pestana !== 'cerradas' && (
            <div className="no-imprimir">
              <Calendario
                cargando={esperando}
                // Hasta que llegan todas las abiertas, el calendario se dibuja
                // con lo mínimo que trae el HTML para eso.
                plazas={enParcial && parcial && f.pestana === 'abiertas' ? parcial.calendario : paraGrafico}
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
          {/* Va aqui, entre el pie y las fichas, porque es el momento en que
              alguien ya ha afinado la búsqueda y ve cuántas quedan: pedir que
              te avisen de esto tiene sentido justo ahora, no en la cabecera
              antes de haber filtrado nada. */}
          <span className="no-imprimir ml-auto">
            <Avisame filtros={aQuery(f)} resumen={fichas.map((x) => x.texto).join(' · ')} />
          </span>
          {fichas.map((ficha, i) => (
            <button
              key={`${ficha.texto}-${i}`}
              type="button"
              onClick={ficha.quitar}
              className="bg-pine-soft text-pine-ink hover:bg-pine hover:text-on-pine inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold pulsa"
            >
              {ficha.texto}
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Quitar este filtro</span>
            </button>
          ))}
          {hayFiltros(f) && (
            <button
              type="button"
              onClick={() => set({ ...FILTROS_INICIALES, pestana: f.pestana, orden: f.orden, vista: f.vista, desde: f.desde })}
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
          {esperando && !falloVista
            ? 'Cargando convocatorias…'
            : plural(resumen.convocatorias, 'convocatoria encontrada', 'convocatorias encontradas')}
        </p>

        <div
          id="contenido"
          role="tabpanel"
          aria-labelledby={`pestana-${f.pestana}`}
          tabIndex={-1}
          className={atenua ? 'revalidando' : undefined}
        >
          <Limite>
            {esperando && !falloVista ? (
              <div className="rounded-lg border border-dashed border-line py-16 text-center">
                <p className="text-base text-ink-3">Cargando convocatorias…</p>
              </div>
            ) : filtradas.length === 0 || faltanDatos ? (
              <div className="rounded-lg border border-dashed border-line py-16 text-center">
                {/* Sin datos ningún filtro sobra: decir "prueba a quitar algún
                    filtro" cuando lo que ha pasado es que la API no contesta
                    manda a buscar en el sitio equivocado. */}
                <p className="mb-1.5 text-xl font-semibold">
                  {todas.length === 0 || faltanDatos
                    ? 'No se han podido cargar las convocatorias'
                    : f.pestana === 'guardadas' && guardadasVivas === 0
                      ? 'Todavía no has guardado ninguna plaza'
                      : 'No hay ninguna plaza que cumpla lo que pides'}
                </p>
                <p className="mx-auto max-w-[52ch] text-base text-ink-3">
                  {todas.length === 0 || faltanDatos
                    ? (falloVista
                        ? `El servidor de datos no ha contestado (${falloVista}). Vuelve a intentarlo en un rato.`
                        : 'El servidor de datos no ha contestado. Vuelve a intentarlo en un rato.')
                    : f.pestana === 'guardadas' && guardadasVivas === 0
                      ? 'Pulsa la estrella de cualquier plaza y aparecerá aquí.'
                      : 'Prueba a quitar algún filtro.'}
                </p>
                {(todas.length === 0 || faltanDatos) && (
                  <button
                    type="button"
                    onClick={reintenta}
                    className="hover:border-pine hover:text-pine mt-4 rounded-md border border-line px-4 py-2 text-base font-semibold text-ink-2 pulsa"
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
                    onClick={() => set({ ...FILTROS_INICIALES, pestana: f.pestana, orden: f.orden, vista: f.vista, desde: f.desde })}
                    className="hover:border-pine hover:text-pine mt-4 rounded-md border border-line px-4 py-2 text-base font-semibold text-ink-2 pulsa"
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
                enlace={enlaceFicha}
              />
            ) : (
              // `minmax(300px,1fr)` no puede encoger por debajo de su mínimo, así
              // que en un móvil de 320 la rejilla medía 300 dentro de 288 y se
              // salía doce píxeles.
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
                {filtradas.slice(0, visibles).map((p) => (
                  <Tarjeta
                    key={p.id}
                    plaza={p}
                    desde={f.desde}
                    href={enlaceFicha(p)}
                    guardada={guardadas.has(p.id)}
                    onGuardar={alternaGuardada}
                    onAbrir={setAbierta}
                  />
                ))}
              </div>
            )}
          </Limite>

          {!esperando && visibles < resumen.convocatorias && (
            <button
              type="button"
              onClick={() => (visibles > filtradas.length ? asegura(['abiertas']) : setVisibles((v) => v + PAGINA))}
              disabled={visibles > filtradas.length && !fallos.abiertas}
              className="no-imprimir hover:border-pine hover:text-pine mt-3 w-full rounded-lg border border-line bg-surface py-3.5 text-base font-semibold text-ink-2 pulsa disabled:cursor-wait disabled:opacity-60"
            >
              {/* En la portada recién abierta solo están las 24 primeras: al
                  pedir más se traen las demás, y mientras tanto se dice. */}
              {visibles > filtradas.length
                ? (fallos.abiertas ? 'No se han podido cargar. Reintentar' : 'Cargando…')
                : <>Ver más — quedan {plural(resumen.convocatorias - visibles, 'plaza', 'plazas')}</>}
            </button>
          )}
        </div>

        <footer className="mt-10 border-t border-line pt-5 pb-12 text-base leading-relaxed text-ink-2">
          <p className="mb-2 max-w-[76ch]">
            <strong className="text-ink">De dónde salen los datos.</strong> Del portal CIDO de la
            Diputació de Barcelona. Entran los ayuntamientos de las cuatro provincias, los consejos
            comarcales, la Generalitat y las diputaciones: unas mil convocatorias vivas repartidas
            por toda Cataluña. Se actualiza cada mañana.
          </p>
          <p className="mb-2 max-w-[76ch]">
            <strong className="text-ink">Comprueba dos cosas antes de apuntarte.</strong> El lugar de
            trabajo: cuando el anuncio no lo dice, aquí verás el municipio del organismo con un
            asterisco, y eso no es lo mismo —muchas bolsas cubren varios centros a la vez—; y el
            plazo exacto, que manda lo que diga la convocatoria oficial y no esta página.
          </p>
          <p className="mb-2 text-sm text-ink-3">
            No se incluyen plazas de policía, guardia urbana ni mossos. Tampoco universidades,
            hospitales ni centros de investigación.
          </p>
          {/* Lo que pide la licencia: quién, con qué licencia, de cuándo y que
              hay cambios. Es una web independiente: que no parezca oficial. */}
          <p className="text-sm text-ink-3">
            Fuente: CIDO – Diputació de Barcelona,{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://creativecommons.org/licenses/by/4.0/deed.es" rel="license noopener">CC BY 4.0</a>,
            datos del {fechaDatos(datos.generado)}. Seleccionados, clasificados y con etiquetas en
            castellano por Convocatorias, una web independiente y no oficial.
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
