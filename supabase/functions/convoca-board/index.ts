import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// convoca-board — alimenta el portal web.
//
// Diferencia clave con convoca-proxy: aquel devuelve SOLO novedades nunca
// avisadas (su trabajo es no repetir mensajes de WhatsApp). Este devuelve
// TODO lo que está abierto ahora mismo, se haya avisado o no, más el archivo
// de lo ya cerrado. Son dos preguntas distintas sobre la misma fuente.
//
// LAS LOCALIZACIONES SE RESUELVEN AQUÍ. Antes se sacaban del último paréntesis
// del título, y por ahí se colaban códigos de departamento —(TEI), (SIAD),
// (CMP)— como si fueran pueblos, y erratas de quien tecleó el anuncio. CIDO
// tiene el dato bien: cada oposición apunta a una institución con `municipi`,
// `comarca` y coordenadas, y se puede traer en la misma petición con
// `?include=institucio`. De ahí sale el 100 % de las sedes.
//
// Se distinguen dos cosas que antes iban revueltas:
//   - la SEDE del organismo, que se sabe siempre;
//   - el LUGAR DE TRABAJO, que solo se sabe cuando el anuncio lo dice.
// En una plaza municipal son lo mismo. En la Generalitat no: 119 de 463
// trabajan fuera de su sede y 158 no dicen dónde, porque son bolsas que
// cubren muchos centros a la vez. `donde.origen` dice cuál de los dos casos
// es, para que la web nunca presente una sede como si fuera un destino.
// ============================================================================

const CONVOCA_CLIENT_ID = "a97c8701-79d9-4744-9a84-c1726085a61e";
const CONVOCA_BASE_URL = "https://apigw.convoca.online";
const CIDO_BASE_URL = "https://api.diba.cat/dadesobertes/cido/v1/oposicions";
const CIDO_INSTITUCIONS_URL = "https://api.diba.cat/dadesobertes/cido/v1/institucions";

const FETCH_TIMEOUT_MS = 20000;

// Cuánto vale la respuesta cacheada. La fuente publica una o dos veces al día,
// así que 3 horas no deja ver nada desactualizado y evita que cada visita
// dispare diez consultas a las APIs de origen.
const CACHE_TTL_MIN = 180;

// Cuántos días se conservan las cerradas en el listado (el archivo en base de
// datos no se borra, solo se recorta lo que se envía al navegador).
const CLOSED_WINDOW_DAYS = 120;
// Tope de cerradas que se sirven. Con el tablero cubriendo toda Cataluña hay
// del orden de mil convocatorias vivas, y las que van cerrando se acumulan.
const CLOSED_LIMIT = 800;

// El callejero cambia cuando se crea o se disuelve un ente: mirarlo una vez a
// la semana sobra.
const CALLEJERO_TTL_DIAS = 7;

const EXCLUDE_KEYWORDS = [
  "policia", "policía", "guàrdia urbana", "guardia urbana",
  "agent de la guàrdia", "agents de la guàrdia",
  "sergent", "caporal", "sotsinspector", "intendent", "mosso",
];

/* ============================ LUGARES ============================ */

/** Un municipio o una comarca del callejero, con identificador estable. */
export interface Sitio {
  /** Apto para la URL: `hospitalet-llobregat`, `comarca-baix-llobregat`. */
  id: string;
  /** Nombre del callejero: "L'Hospitalet de Llobregat". */
  nombre: string;
  tipo: "municipio" | "comarca";
  comarca: string | null;
  comarcaId: string | null;
  lat: number | null;
  lon: number | null;
}

/** Cuánto hay que fiarse de `trabajoId`. */
export type OrigenLugar =
  | "sede"          // el organismo es de ese pueblo: se trabaja donde está
  | "portal"        // portal Convoca: el municipio se sabe por construcción
  | "titulo"        // topónimo del anuncio, comprobado contra el callejero
  | "desconocido";  // el anuncio no lo dice en ningún campo

export interface Localizacion {
  /** Municipio del organismo. Referencia a `sitios`. */
  sedeId: string | null;
  /** Dónde se trabaja. `null` cuando el anuncio no lo dice. */
  trabajoId: string | null;
  origen: OrigenLugar;
}

/**
 * Artículos y preposiciones que sobran para comparar dos nombres de sitio.
 * COPIA LITERAL de `PARTICULAS` en src/lib/lugar.ts.
 */
const PARTICULAS = new Set([
  "el", "la", "els", "les", "lo", "los", "de", "del", "dels", "da", "d", "l", "i", "a", "al", "als",
]);

/** COPIA LITERAL de `normaliza()` en src/lib/formato.ts. */
function normalizaTexto(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * COPIA LITERAL de `claveLugar()` en src/lib/lugar.ts, y tiene que seguir
 * siéndolo: de aquí sale el identificador que viaja en `?donde=` y que la
 * gente tiene guardado en marcadores y mandado por WhatsApp. Si las dos
 * versiones divergen, esos enlaces dejan de filtrar sin dar ningún error.
 */
function claveSitio(nombre: string): string {
  return normalizaTexto(nombre)
    .replace(/[’´`]/g, "'")
    .replace(/'/g, "' ")
    .split(/[\s.,]+/)
    .map((palabra) => palabra.replace(/'$/, ""))
    .filter((palabra) => palabra && !PARTICULAS.has(palabra))
    .join(" ");
}

/** COPIA LITERAL de `idDe()` en src/lib/lugar.ts. */
function idSitio(clave: string): string {
  return clave.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Las comarcas llevan prefijo para no chocar nunca con un municipio homónimo. */
function idComarca(nombre: string): string {
  return `comarca-${idSitio(claveSitio(nombre))}`;
}

const PROVINCIAS_CATALANAS = new Set(["Barcelona", "Girona", "Lleida", "Tarragona"]);

type Callejero = Record<string, Sitio>;

/**
 * Baja el callejero entero de CIDO: unos 7.700 entes públicos de los que salen
 * los 989 municipios catalanes con coordenadas y sus 43 comarcas.
 *
 * Se prefieren las coordenadas del ayuntamiento: son las del pueblo, no las de
 * un consorcio que casualmente tenga allí la sede.
 */
async function descargaCallejero(): Promise<Callejero> {
  const sitios: Callejero = {};
  const esAyuntamiento: Record<string, boolean> = {};
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < 12000) {
    const res = await fetchJson(
      `${CIDO_INSTITUCIONS_URL}?${new URLSearchParams({
        "page[limit]": "500",
        "page[offset]": String(offset),
      })}`,
    );
    const cuerpo = res.body as
      { data?: { attributes: Record<string, unknown> }[]; meta?: { totalResourceCount?: number } } | null;
    const filas = cuerpo?.data;
    if (!res.ok || !Array.isArray(filas)) throw new Error(`El callejero de CIDO respondió ${res.status}`);
    total = Number(cuerpo?.meta?.totalResourceCount ?? filas.length);

    for (const fila of filas) {
      const a = fila.attributes;
      const municipi = typeof a.municipi === "string" ? a.municipi.trim() : "";
      const provincia = typeof a.provincia === "string" ? a.provincia : "";
      if (!municipi || !PROVINCIAS_CATALANAS.has(provincia)) continue;

      const comarca = typeof a.comarca === "string" ? a.comarca.trim() : "";
      const clave = claveSitio(municipi);
      if (!clave) continue;

      const ayto = /^Ajuntament /i.test(String(a.institucioDesenvolupat ?? ""));
      if (!sitios[clave] || (ayto && !esAyuntamiento[clave])) {
        sitios[clave] = {
          id: idSitio(clave),
          nombre: municipi,
          tipo: "municipio",
          comarca: comarca || null,
          comarcaId: comarca ? idComarca(comarca) : null,
          lat: typeof a.latitud === "number" ? a.latitud : null,
          lon: typeof a.longitud === "number" ? a.longitud : null,
        };
        esAyuntamiento[clave] = ayto;
      }

      // La comarca es un sitio más: hay anuncios que solo dicen la comarca
      // ("als Serveis Territorials al Vallès Occidental") y el menú «Dónde» se
      // agrupa por ella.
      const claveCom = comarca ? claveSitio(comarca) : "";
      if (claveCom && !sitios[`c:${claveCom}`]) {
        sitios[`c:${claveCom}`] = {
          id: idComarca(comarca),
          nombre: comarca,
          tipo: "comarca",
          comarca,
          comarcaId: idComarca(comarca),
          lat: null,
          lon: null,
        };
      }
    }
    if (!filas.length) break;
    offset += 500;
  }
  return sitios;
}

/** El callejero guardado en la base, y cuándo toca volver a bajarlo. */
async function cargaCallejero(puedeRefrescar: boolean): Promise<Callejero> {
  const guardado = await readSnapshot(2);
  const datos = guardado?.data as { sitios?: Callejero } | null;
  const util = datos?.sitios && Object.keys(datos.sitios).length ? datos.sitios : null;
  const caducado = !guardado ||
    (Date.now() - Date.parse(guardado.updated_at)) / 86400000 > CALLEJERO_TTL_DIAS;

  // Lo normal: hay callejero guardado y no toca renovarlo.
  if (util && !(caducado && puedeRefrescar)) return util;

  // Se baja entero si no hay ninguno —sin él no habría lugares de trabajo— o
  // si alguien ha pedido un refresco y ya ha caducado. Nunca en una visita
  // corriente con el callejero al día: dieciséis peticiones seguidas dentro de
  // una Edge Function son la vía más corta a un tiempo de espera agotado.
  try {
    const fresco = await descargaCallejero();
    if (Object.keys(fresco).length) {
      await writeSnapshot(2, { sitios: fresco, generado: new Date().toISOString() });
      return fresco;
    }
  } catch {
    // Un callejero rancio resuelve igual de bien los municipios de siempre.
  }
  return util ?? {};
}

function sitioDeInstitucion(a: Record<string, unknown> | undefined, callejero: Callejero): Sitio | null {
  const municipi = typeof a?.municipi === "string" ? a.municipi.trim() : "";
  if (!municipi) return null;
  const clave = claveSitio(municipi);
  if (!clave) return null;
  const conocido = callejero[clave];
  if (conocido) return conocido;

  // Un ente de fuera de Cataluña (la delegación del Govern en Madrid) o un
  // municipio que el callejero no traiga: se construye al vuelo para que la
  // convocatoria no se quede sin sede.
  const comarca = typeof a?.comarca === "string" ? a.comarca.trim() : "";
  return {
    id: idSitio(clave),
    nombre: municipi,
    tipo: "municipio",
    comarca: comarca || null,
    comarcaId: comarca ? idComarca(comarca) : null,
    lat: typeof a?.latitud === "number" ? a.latitud : null,
    lon: typeof a?.longitud === "number" ? a.longitud : null,
  };
}

function parentheticals(titol: string): string[] {
  return [...titol.matchAll(/\(([^()]{2,60})\)/g)].map((m) => m[1].trim());
}

const ORGANO_TERRITORIAL =
  "Serveis Territorials|Servei Territorial|Oficina Territorial|Delegació Territorial|" +
  "Demarcació Territorial|Direcció Territorial|Gerència Territorial";

const COLA_TERRITORIAL = new RegExp(
  "(?:" + ORGANO_TERRITORIAL + ")" +
    "(?:\\s+(?:als|a la|a l'|al|a|dels|de la|de l'|del|de|d'))?" +
    "\\s+([^,;()]{3,40})\\s*$",
  "i",
);

/**
 * El lugar de trabajo que declara el anuncio, comprobado contra el callejero.
 *
 * Solo vale un acierto exacto de clave, y por eso no hace falta ninguna lista
 * negra: "TEI", "SIAD" o "Recursos Humans" no son municipios y mueren aquí
 * solos. Se mira el paréntesis final y también la cola del título —"als
 * Serveis Territorials a Girona"—, que es donde estaban escondidas 36
 * convocatorias que hasta ahora se daban por perdidas.
 *
 * En las municipales y comarcales no se mira: ahí el organismo ya dice el
 * pueblo, y de los 361 títulos municipales solo 7 tienen paréntesis, todos con
 * códigos internos del ayuntamiento.
 */
function lugarDelTitulo(titol: string, ambito: string, callejero: Callejero): Sitio | null {
  if (ambito === "municipal" || ambito === "comarcal") return null;

  const candidatos = parentheticals(titol);
  const cola = COLA_TERRITORIAL.exec(titol.replace(/\s*\([^()]*\)\s*$/, "").trim());
  if (cola) candidatos.push(cola[1].trim());

  // Del final hacia el principio: la cola del título y el último paréntesis
  // son los que hablan del destino; los de en medio suelen ser la categoría.
  for (const candidato of candidatos.reverse()) {
    const clave = claveSitio(candidato);
    if (!clave) continue;
    const sitio = callejero[clave] ?? callejero[`c:${clave}`];
    if (sitio) return sitio;
  }
  return null;
}

/* ============================ FUENTES ============================ */

type ConvocaSource = { id: string; nombre: string; source: "convoca"; baseUrl: string };
type CidoSource = { id: string; nombre: string; source: "cido"; ambit: string; ambito: string };
type Source = ConvocaSource | CidoSource;

/**
 * Todo el empleo público de Cataluña que publica CIDO, menos dos ámbitos que
 * se quedan fuera a propósito: «Altres entitats públiques» (hospitales,
 * universidades y centros de investigación) y «Cossos de l'Administració de
 * l'Estat» (ministerios, casi todos en Madrid).
 */
const SOURCES: Source[] = [
  { id: "badalona", nombre: "Badalona", source: "convoca", baseUrl: "https://badalona.convoca.online" },
  { id: "elmasnou", nombre: "El Masnou", source: "convoca", baseUrl: "https://elmasnou.convoca.online" },
  { id: "santacoloma", nombre: "Santa Coloma de Gramenet", source: "convoca", baseUrl: "https://gramenet.convoca.online" },
  { id: "cido-bcn", nombre: "Ayuntamientos de Barcelona", source: "cido", ambit: "Municipis província de Barcelona i ens adscrits", ambito: "municipal" },
  { id: "cido-gir", nombre: "Ayuntamientos de Girona", source: "cido", ambit: "Municipis província de Girona i ens adscrits", ambito: "municipal" },
  { id: "cido-lle", nombre: "Ayuntamientos de Lleida", source: "cido", ambit: "Municipis província de Lleida i ens adscrits", ambito: "municipal" },
  { id: "cido-tar", nombre: "Ayuntamientos de Tarragona", source: "cido", ambit: "Municipis província de Tarragona i ens adscrits", ambito: "municipal" },
  { id: "cido-comarcal", nombre: "Consejos comarcales", source: "cido", ambit: "Consells comarcals i els seus ens adscrits", ambito: "comarcal" },
  { id: "cido-generalitat", nombre: "Generalitat de Catalunya", source: "cido", ambit: "Administració autonòmica", ambito: "generalitat" },
  { id: "cido-diputacio", nombre: "Diputaciones", source: "cido", ambit: "Diputacions i els seus ens adscrits", ambito: "diputacio" },
];

const CIDO_STATES = ["Termini obert", "Pendent de termini"];

const CIDO_PAGE_LIMIT = 500;
/** Cinturón de seguridad por si la fuente devolviera un total absurdo. */
const CIDO_MAX_ROWS = 5000;

/* ============================ HELPERS ============================ */

type Item = Record<string, unknown> & { id: string };

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return Object.values(v as Record<string, string>).join(" ");
  return String(v);
}

function isExcluded(...vals: unknown[]): boolean {
  const hay = vals.map(asText).join(" ").toLowerCase();
  return EXCLUDE_KEYWORDS.some((k) => hay.includes(k));
}

function todayMadrid(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

function ymdOf(s: unknown): string | null {
  if (!s || typeof s !== "string") return null;
  const t = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

async function fetchJson(url: string, init: RequestInit = {}, attempts = 2) {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Sin respuesta de ${new URL(url).host}: ${String((lastErr as Error)?.message ?? lastErr)}`);
}

/* ====================== NORMALIZACIÓN COMÚN ====================== */

// Traducciones a español llano. Se hacen en el servidor para que la web no
// tenga que conocer la jerga catalana de la fuente.
const NIVEL_ESTUDIOS: Record<string, string> = {
  "A1": "Universitario (licenciatura o grado)",
  "A2": "Universitario (diplomatura o grado)",
  "A": "Universitario (grado)",
  "B": "Formación Profesional de grado superior",
  "C1": "Bachillerato o Formación Profesional de grado superior",
  "C2": "ESO o Formación Profesional de grado medio",
  "AP": "Sin titulación mínima",
};

function grupoCodigo(grup: string | null): string | null {
  if (!grup) return null;
  if (/agrupacions/i.test(grup)) return "AP";
  const m = grup.match(/^([A-E][12]?)\s*-/);
  return m ? m[1] : null;
}

const CONVOCA_GROUPS: Record<number, string> = { 0: "A1", 1: "A2", 2: "B", 3: "C1", 4: "C2", 5: "AP", 16: "AP" };

const TIPO_CONTRATO: Record<string, { etiqueta: string; fijo: boolean }> = {
  "Funcionari": { etiqueta: "Fija, funcionario", fijo: true },
  "Laboral": { etiqueta: "Fija, contrato laboral indefinido", fijo: true },
  "Estatutari fix": { etiqueta: "Fija, sanidad pública", fijo: true },
  "Funcionari interí": { etiqueta: "Temporal, funcionario interino", fijo: false },
  "Laboral temporal": { etiqueta: "Temporal, contrato temporal", fijo: false },
  "Interí o temporal": { etiqueta: "Temporal o interinaje", fijo: false },
  "Alta direcció": { etiqueta: "Alta dirección", fijo: true },
};

const SELECCION: Record<string, string> = {
  "Concurs o valoració de mèrits": "Concurso: se valoran los méritos, sin examen",
  "Concurs oposició o valoració de mèrits i prova": "Concurso-oposición: méritos y examen",
  "Oposició o prova": "Oposición: examen",
  "Concurs oposició": "Concurso-oposición: méritos y examen",
};

function buildItem(base: Record<string, unknown>): Item {
  const titol = String(base.titulo ?? "");
  const grupo = base.grupo as string | null;
  const contract = base.contractType as string | null;
  const tipo = contract ? TIPO_CONTRATO[contract] : undefined;
  const esBolsa = base.kind === "bag";
  const donde = base.donde as Localizacion;
  const sede = base.sede as Sitio | null;
  const trabajo = base.trabajo as Sitio | null;

  return {
    id: String(base.id),
    titulo: titol,
    empleador: base.empleador,
    ambito: base.ambito,
    donde,
    // Los tres campos de siempre se derivan de `donde` y se siguen enviando:
    // el archivo de cerradas está lleno de filas guardadas con este formato, y
    // un despliegue anterior de la web puede seguir cacheado en un navegador.
    // Están marcados como obsoletos en src/lib/tipos.ts.
    municipio: base.municipioLegado ?? null,
    lugar: trabajo?.nombre ?? null,
    // Ya no significa nada en el servidor: la distancia depende de dónde viva
    // quien mira, y eso solo lo sabe el navegador.
    lejos: false,
    tipo: esBolsa ? "bolsa" : "convocatoria",
    tipoEtiqueta: esBolsa
      ? "Bolsa de trabajo: lista de espera para contratos temporales y sustituciones"
      : (tipo?.etiqueta ?? "Convocatoria de plaza"),
    fijo: esBolsa ? false : (tipo?.fijo ?? null),
    contratoOriginal: contract ?? null,
    plazas: base.plazas ?? null,
    inicio: base.inicio ?? null,
    fin: base.fin ?? null,
    notaPlazo: base.notaPlazo ?? null,
    publicado: base.publicado ?? null,
    nivelCodigo: grupo,
    nivelEstudios: grupo ? (NIVEL_ESTUDIOS[grupo] ?? grupo) : null,
    titulacion: base.titulacion ?? null,
    otrosRequisitos: base.otrosRequisitos ?? null,
    seleccion: base.seleccion
      ? (SELECCION[String(base.seleccion)] ?? String(base.seleccion))
      : null,
    enlace: base.enlace ?? null,
    fichaOficial: base.fichaOficial ?? null,
    fuente: base.fuente,
    _sitios: [sede, trabajo].filter(Boolean) as Sitio[],
  };
}

/* ====================== FUENTE A: CONVOCA ====================== */

async function fetchConvoca(m: ConvocaSource, callejero: Callejero): Promise<Item[]> {
  const headers = {
    "client-id": CONVOCA_CLIENT_ID,
    "Origin": m.baseUrl,
    "Referer": `${m.baseUrl}/`,
  };
  const [callsRes, bagsRes] = await Promise.all([
    fetchJson(`${CONVOCA_BASE_URL}/calls`, { headers }),
    fetchJson(`${CONVOCA_BASE_URL}/bags`, { headers }),
  ]);
  if (!Array.isArray(callsRes.body) || !Array.isArray(bagsRes.body)) {
    throw new Error(`Convoca respondió mal (calls=${callsRes.status}, bags=${bagsRes.status})`);
  }

  // Cada portal es un ayuntamiento, así que el pueblo se sabe por construcción.
  const sede = callejero[claveSitio(m.nombre)] ?? null;
  const donde: Localizacion = {
    sedeId: sede?.id ?? null,
    trabajoId: sede?.id ?? null,
    origen: "portal",
  };

  const build = (arr: unknown[], kind: "call" | "bag"): Item[] =>
    (arr as Record<string, unknown>[])
      .filter((i) => !isExcluded(i.title))
      .map((i) => {
        const titleCa = asText((i.title as Record<string, string>)?.["ca-ES"] ?? i.title);
        // startDate→endDate es el plazo de SOLICITUD. claimsStartDate/
        // claimsEndDate son las RECLAMACIONES posteriores: no sirven aquí.
        const desc = asText((i.description as Record<string, string>)?.["ca-ES"] ?? i.description)
          .replace(/\s+/g, " ").trim();
        return buildItem({
          id: String(i.id),
          titulo: titleCa,
          empleador: `Ayuntamiento de ${m.nombre}`,
          ambito: "municipal",
          donde,
          sede,
          trabajo: sede,
          municipioLegado: m.nombre,
          kind,
          plazas: (i.vacancies as Record<string, number> | null)?.total ?? null,
          inicio: ymdOf(i.startDate),
          fin: ymdOf(i.endDate),
          publicado: ymdOf(i.bopDate),
          grupo: typeof i.group === "number" ? CONVOCA_GROUPS[i.group] ?? null : null,
          titulacion: desc ? desc.slice(0, 600) : null,
          enlace: `${m.baseUrl}/processDetail.html?id=${String(i.id)}&type=${kind === "bag" ? 1 : 0}`,
          fichaOficial: `${m.baseUrl}/processDetail.html?id=${String(i.id)}&type=${kind === "bag" ? 1 : 0}`,
          fuente: "convoca",
        });
      });

  return [...build(callsRes.body, "call"), ...build(bagsRes.body, "bag")];
}

/* ======================== FUENTE B: CIDO ======================== */

function cidoUrl(ambit: string, extra: Record<string, string>): string {
  return `${CIDO_BASE_URL}?${new URLSearchParams({ "filter[ambit]": ambit, ...extra }).toString()}`;
}

type Instituciones = Map<string, Record<string, unknown>>;

/**
 * Todas las páginas de un ámbito y un estado, con sus instituciones. Las
 * instituciones se acumulan en el mismo mapa para TODAS las llamadas: cada
 * página trae solo las suyas, y una fila cuya institución se quedara fuera del
 * mapa se quedaría sin sede.
 */
async function cidoRows(
  ambit: string, estat: string, instituciones: Instituciones,
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let offset = 0; offset < CIDO_MAX_ROWS; offset += CIDO_PAGE_LIMIT) {
    const res = await fetchJson(cidoUrl(ambit, {
      "filter[estat]": estat,
      sort: "-id",
      "page[limit]": String(CIDO_PAGE_LIMIT),
      "page[offset]": String(offset),
      include: "institucio",
    }));
    const cuerpo = res.body as {
      data?: Record<string, unknown>[];
      included?: { id: string; attributes: Record<string, unknown> }[];
      meta?: { totalResourceCount?: number };
    } | null;
    const data = cuerpo?.data;
    if (!res.ok || !Array.isArray(data)) {
      throw new Error(`CIDO respondió mal (${ambit} / ${estat}, status=${res.status})`);
    }
    for (const inc of cuerpo?.included ?? []) instituciones.set(inc.id, inc.attributes);
    filas.push(...data);
    const total = Number(cuerpo?.meta?.totalResourceCount ?? filas.length);
    if (!data.length || filas.length >= total) break;
  }
  return filas;
}

async function fetchCido(s: CidoSource, callejero: Callejero): Promise<Item[]> {
  const instituciones: Instituciones = new Map();
  const paginas = await Promise.all(
    CIDO_STATES.map((estat) => cidoRows(s.ambit, estat, instituciones)),
  );

  const out: Item[] = [];
  for (const data of paginas) {
    for (const row of data) {
      const a = row.attributes as Record<string, unknown> | undefined;
      const rid = String((row as Record<string, unknown>).id ?? a?.identificador ?? "");
      if (!a || !rid || isExcluded(a.titol)) continue;

      const rel = (row.relationships as Record<string, { data?: { id: string } }> | undefined)
        ?.institucio?.data;
      const inst = rel ? instituciones.get(rel.id) : undefined;
      const sede = sitioDeInstitucion(inst, callejero);

      const titol = String(a.titol ?? "").trim();
      const delTitulo = lugarDelTitulo(titol, s.ambito, callejero);

      // En un ayuntamiento o un consejo comarcal, la sede es el destino. En la
      // Generalitat solo lo es si el anuncio lo dice; si calla, no se inventa.
      const trabajo = delTitulo ?? (s.ambito === "municipal" || s.ambito === "comarcal" ? sede : null);
      const origen: OrigenLugar = delTitulo
        ? "titulo"
        : trabajo
          ? "sede"
          : "desconocido";

      const institucio = String(a.institucioDesenvolupat ?? "");
      const empleador = employerLabel(institucio);

      out.push(buildItem({
        id: `cido-${rid}`,
        titulo: titol,
        empleador,
        ambito: s.ambito,
        donde: { sedeId: sede?.id ?? null, trabajoId: trabajo?.id ?? null, origen },
        sede,
        trabajo,
        // El campo viejo `municipio` se comporta como siempre: el pueblo en las
        // municipales, y el nombre del organismo en el resto, que es lo que la
        // web anterior espera para saber que no aporta nada.
        municipioLegado: s.ambito === "municipal" || s.ambito === "comarcal"
          ? (sede?.nombre ?? empleador)
          : empleador,
        kind: a.borsaTreball ? "bag" : "call",
        plazas: (a.numPlaces as number) || null,
        inicio: ymdOf(a.dataInici),
        fin: ymdOf(a.dataFinalitzacio),
        notaPlazo: a.observacionsTermini ?? null,
        publicado: ymdOf(a.maxDataPublicacioDocument),
        grupo: grupoCodigo(a.grupTitulacio as string | null),
        titulacion: a.titulacioRequerida ?? null,
        otrosRequisitos: a.altresRequisits ?? null,
        contractType: a.tipusPersonal ?? null,
        seleccion: a.sistemaSeleccio ?? null,
        enlace: a.accesTramit ?? a.urlWeb ?? a.urlCido ?? null,
        fichaOficial: a.urlCido ?? null,
        fuente: "cido",
      }));
    }
  }
  return out;
}

/** El nombre del organismo, en español donde se puede y con el separador que
 * espera la web: "casa · organismo". */
function employerLabel(institucio: string): string {
  return institucio
    .replace(/^Ajuntament /, "Ayuntamiento ")
    .replace(/^Consell Comarcal /, "Consejo Comarcal ")
    .replace(/^Generalitat de Catalunya - /, "Generalitat de Catalunya · ")
    .replace(/ - /, " · ");
}

/* ========================= BASE DE DATOS ========================= */

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

async function saveSeen(items: Item[]): Promise<void> {
  if (!items.length) return;
  const now = new Date().toISOString();
  const rows = items.map((x) => ({
    item_id: x.id,
    item: x,
    apply_end: x.fin ?? null,
    employer: x.empleador,
    kind: x.tipo,
    last_seen: now,
  }));
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await fetch(`${SB_URL}/rest/v1/convoca_board_items?on_conflict=item_id`, {
      method: "POST",
      headers: { ...DB, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Fallo guardando el archivo (${res.status}): ${await res.text()}`);
  }
}

// Cerradas: las del archivo con fecha límite pasada. Se leen de la base y no de
// las fuentes porque las fuentes ya no las publican.
async function loadClosed(today: string): Promise<Item[]> {
  const desde = new Date(Date.parse(today) - CLOSED_WINDOW_DAYS * 86400000)
    .toISOString().slice(0, 10);
  const res = await fetch(
    `${SB_URL}/rest/v1/convoca_board_items?select=item&apply_end=lt.${today}&apply_end=gte.${desde}&order=apply_end.desc&limit=${CLOSED_LIMIT}`,
    { headers: DB, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as { item: Item }[];
  return rows.map((r) => r.item);
}

async function readSnapshot(id: number): Promise<{ data: unknown; updated_at: string } | null> {
  const res = await fetch(`${SB_URL}/rest/v1/convoca_snapshot?id=eq.${id}&select=data,updated_at`, {
    headers: DB, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function writeSnapshot(id: number, data: unknown): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/convoca_snapshot?on_conflict=id`, {
    method: "POST",
    headers: { ...DB, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ id, data, updated_at: new Date().toISOString() }]),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

/* ========================= CONSTRUCCIÓN ========================= */

async function build(today: string, puedeRefrescar: boolean) {
  const errores: { fuente: string; mensaje: string }[] = [];

  let callejero: Callejero = {};
  try {
    callejero = await cargaCallejero(puedeRefrescar);
  } catch (e) {
    errores.push({ fuente: "(callejero)", mensaje: String((e as Error)?.message ?? e) });
  }

  const results = await Promise.allSettled(
    SOURCES.map((s) => (s.source === "convoca" ? fetchConvoca(s, callejero) : fetchCido(s, callejero))),
  );
  const vistos = new Map<string, Item>();
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      for (const it of r.value) if (!vistos.has(it.id)) vistos.set(it.id, it);
    } else {
      errores.push({ fuente: SOURCES[i].nombre, mensaje: String((r.reason as Error)?.message ?? r.reason) });
    }
  });
  const todos = [...vistos.values()];

  // El catálogo que se manda: el callejero entero —para que el navegador pueda
  // ofrecer cualquier municipio de Cataluña como punto de referencia y para que
  // los identificadores del archivo viejo sigan resolviendo— más los sitios de
  // fuera del callejero que hayan aparecido.
  const sitios: Record<string, Sitio> = {};
  for (const s of Object.values(callejero)) sitios[s.id] = s;
  for (const it of todos) {
    for (const s of (it._sitios as Sitio[] | undefined) ?? []) sitios[s.id] = s;
    delete (it as Record<string, unknown>)._sitios;
  }

  try { await saveSeen(todos); } catch (e) {
    errores.push({ fuente: "(archivo)", mensaje: String((e as Error)?.message ?? e) });
  }

  const abiertas: Item[] = [];
  const pendientes: Item[] = [];
  for (const it of todos) {
    const fin = it.fin as string | null;
    if (fin && fin < today) continue;
    const dias = fin ? daysBetween(today, fin) : null;
    (it as Record<string, unknown>).diasRestantes = dias;
    if (fin) abiertas.push(it); else pendientes.push(it);
  }
  abiertas.sort((a, b) => String(a.fin).localeCompare(String(b.fin)));
  pendientes.sort((a, b) => String(b.publicado ?? "").localeCompare(String(a.publicado ?? "")));

  // Las cerradas salen del archivo y sus identificadores de sitio resuelven
  // contra el callejero, que va entero en la respuesta. Las guardadas antes de
  // este cambio no traen `donde`: de esas se ocupa el modo de compatibilidad
  // de la web.
  const cerradas = (await loadClosed(today)).filter((x) => !vistos.has(x.id)).map((x) => {
    delete (x as Record<string, unknown>)._sitios;
    return { ...x, diasRestantes: x.fin ? daysBetween(today, String(x.fin)) : null };
  });

  const plazas = abiertas.reduce((s, x) => s + (Number(x.plazas) || 0), 0);
  return {
    generado: new Date().toISOString(),
    hoy: today,
    abiertas,
    pendientes,
    cerradas,
    sitios,
    resumen: {
      abiertas: abiertas.length,
      pendientes: pendientes.length,
      cerradas: cerradas.length,
      plazas,
      fijas: abiertas.filter((x) => x.fijo === true).length,
      temporales: abiertas.filter((x) => x.fijo === false).length,
      cierranEn7Dias: abiertas.filter((x) => typeof x.diasRestantes === "number" && (x.diasRestantes as number) <= 7).length,
    },
    errores,
  };
}

/* =========================== SERVIDOR =========================== */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const today = todayMadrid();

    if (!refresh) {
      const snap = await readSnapshot(1);
      if (snap) {
        const edadMin = (Date.now() - Date.parse(snap.updated_at)) / 60000;
        const mismoDia = (snap.data as { hoy?: string })?.hoy === today;
        if (edadMin < CACHE_TTL_MIN && mismoDia) {
          return new Response(JSON.stringify({ ...(snap.data as object), cache: "hit" }), {
            headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
          });
        }
      }
    }

    const data = await build(today, refresh);
    await writeSnapshot(1, data);
    return new Response(JSON.stringify({ ...data, cache: refresh ? "refresh" : "miss" }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
