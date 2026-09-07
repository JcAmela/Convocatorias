import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// convoca-board — alimenta el portal web.
//
// Diferencia clave con convoca-proxy: aquel devuelve SOLO novedades nunca
// avisadas (su trabajo es no repetir mensajes de WhatsApp). Este devuelve
// TODO lo que está abierto ahora mismo, se haya avisado o no, más el archivo
// de lo ya cerrado. Son dos preguntas distintas sobre la misma fuente.
// ============================================================================

const CONVOCA_CLIENT_ID = "a97c8701-79d9-4744-9a84-c1726085a61e";
const CONVOCA_BASE_URL = "https://apigw.convoca.online";
const CIDO_BASE_URL = "https://api.diba.cat/dadesobertes/cido/v1/oposicions";

const FETCH_TIMEOUT_MS = 20000;

// El área que cubre el portal: la unión de círculos de este radio alrededor de
// cada pueblo de TOWNS. Vale igual para las tres fuentes de CIDO.
//
// Antes no era así y ese fue el desequilibrio que vació el portal de
// ayuntamientos: la Generalitat entraba por radio y los municipios por una
// lista cerrada de ocho nombres. Como casi toda la Generalitat tiene la sede
// en Barcelona, por el radio entraba media Cataluña (de ahí las plazas de
// Lleida o Tortosa), mientras que del lado municipal se quedaban fuera
// Sabadell, Terrassa, Mataró, L'Hospitalet o El Prat, que son justo donde
// trabaja la gente de aquí. Con el mismo criterio para todos, las municipales
// pasan de veinte a doscientas sesenta.
const AREA_RADIUS_KM = 25;

// Cuánto vale la respuesta cacheada. La fuente publica una o dos veces al día,
// así que 3 horas no deja ver nada desactualizado y evita que cada visita
// dispare seis consultas a las APIs de origen.
const CACHE_TTL_MIN = 180;

// Cuántos días se conservan las cerradas en el listado (el archivo en base de
// datos no se borra, solo se recorta lo que se envía al navegador).
const CLOSED_WINDOW_DAYS = 120;

const EXCLUDE_KEYWORDS = [
  "policia", "policía", "guàrdia urbana", "guardia urbana",
  "agent de la guàrdia", "agents de la guàrdia",
  "sergent", "caporal", "sotsinspector", "intendent", "mosso",
];

// Los puntos desde los que se mide el área. No son una lista de municipios
// admitidos: son los centros de los círculos.
const TOWNS = [
  { nombre: "Barcelona", lat: 41.3874, lon: 2.1686 },
  { nombre: "Badalona", lat: 41.4500, lon: 2.2474 },
  { nombre: "Montgat", lat: 41.4680, lon: 2.2790 },
  { nombre: "Santa Coloma de Gramenet", lat: 41.4515, lon: 2.2080 },
  { nombre: "Alella", lat: 41.4939, lon: 2.2947 },
  { nombre: "Tiana", lat: 41.4817, lon: 2.2683 },
  { nombre: "Sant Adrià de Besòs", lat: 41.4304, lon: 2.2183 },
  { nombre: "El Masnou", lat: 41.4795, lon: 2.3168 },
];

type ConvocaSource = { id: string; nombre: string; source: "convoca"; baseUrl: string };
type CidoSource = { id: string; nombre: string; source: "cido"; ambit: string; ambito: string };
type Source = ConvocaSource | CidoSource;

const SOURCES: Source[] = [
  { id: "badalona", nombre: "Badalona", source: "convoca", baseUrl: "https://badalona.convoca.online" },
  { id: "elmasnou", nombre: "El Masnou", source: "convoca", baseUrl: "https://elmasnou.convoca.online" },
  { id: "santacoloma", nombre: "Santa Coloma de Gramenet", source: "convoca", baseUrl: "https://gramenet.convoca.online" },
  { id: "cido-municipal", nombre: "Ayuntamientos", source: "cido", ambit: "Municipis província de Barcelona i ens adscrits", ambito: "municipal" },
  { id: "cido-generalitat", nombre: "Generalitat de Catalunya", source: "cido", ambit: "Administració autonòmica", ambito: "generalitat" },
  { id: "cido-diputacio", nombre: "Diputació de Barcelona", source: "cido", ambit: "Diputacions i els seus ens adscrits", ambito: "diputacio" },
];

const CIDO_STATES = ["Termini obert", "Pendent de termini"];

// CIDO pagina con page[limit] y page[offset], y dice el total en
// meta.totalResourceCount. Se piden todas las páginas: con un tope fijo, el
// día que la fuente creciera se perderían filas sin que nadie se enterara.
const CIDO_PAGE_LIMIT = 500;
/** Cinturón de seguridad por si la fuente devolviera un total absurdo. */
const CIDO_MAX_ROWS = 5000;

// ============================ HELPERS ============================

type Item = Record<string, unknown> & { id: string };

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return Object.values(v as Record<string, string>).join(" ");
  return String(v);
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
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

function nearestTownKm(lat: unknown, lon: unknown): number {
  if (typeof lat !== "number" || typeof lon !== "number") return Infinity;
  return Math.min(...TOWNS.map((t) => {
    const dLat = (lat - t.lat) * 111.0;
    const dLon = (lon - t.lon) * 111.0 * Math.cos((t.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon);
  }));
}

// "Ajuntament de Sabadell - Promoció Econòmica, SL" → "Sabadell". Sirve para
// saber en qué pueblo se trabaja, que en una plaza municipal es el mismo
// pueblo del organismo. Devuelve null para consorcios y demás entes que no
// son un ayuntamiento.
function municipioDe(institucio: string): string | null {
  const cabeza = institucio.split(" - ")[0].trim();
  const m = /^Ajuntament\s+(.+)$/i.exec(cabeza);
  if (!m) return null;
  // El artículo forma parte del nombre del pueblo —El Prat de Llobregat, La
  // Roca del Vallès, L'Hospitalet— pero la preposición que lo enlaza con
  // "Ajuntament" no: se quita el "de" y se deja el artículo en pie.
  const nombre = m[1].trim()
    .replace(/^de\s+l'/i, "L'")
    .replace(/^de\s+la\s+/i, "La ")
    .replace(/^de\s+les\s+/i, "Les ")
    .replace(/^dels\s+/i, "Els ")
    .replace(/^del\s+/i, "El ")
    .replace(/^d'/i, "")
    .replace(/^de\s+/i, "")
    .trim();
  return nombre || null;
}

// El nombre del organismo, en español donde se puede y con el separador que
// espera la web: "casa · organismo".
function employerLabel(institucio: string): string {
  return institucio
    .replace(/^Ajuntament /, "Ayuntamiento ")
    .replace(/^Generalitat de Catalunya - /, "Generalitat de Catalunya · ")
    .replace(/ - /, " · ");
}

function parentheticals(titol: string): string[] {
  return [...titol.matchAll(/\(([^()]{2,60})\)/g)].map((m) => m[1].trim());
}

// El centro de trabajo no es un campo: CIDO lo deja entre paréntesis en el
// título. La lat/lon del registro es la SEDE del organismo, no la del puesto.
function extractWorkplace(titol: string): string | null {
  const NOT_PLACE = /grup|categoria|nivell|torn|especialitat|jornada|substituci/i;
  for (const p of parentheticals(titol).reverse()) {
    if (/\d/.test(p) || NOT_PLACE.test(p)) continue;
    if (!/^[A-ZÀ-ÿ]/.test(p)) continue;
    return p;
  }
  return null;
}

// A diferencia del aviso de WhatsApp, aquí NO se descartan las plazas lejanas:
// el portal las muestra y deja que el usuario filtre por lugar. Se marcan.
const FAR_PLACES = [
  "lleida", "girona", "tarragona", "reus", "tortosa", "amposta", "falset",
  "seu d urgell", "sort", "montferrer", "puigcerda", "solsona", "berga", "vic",
  "manresa", "igualada", "vilafranca del penedes", "vilanova i la geltru", "olot",
  "figueres", "blanes", "salt", "banyoles", "valls", "el vendrell", "cambrils",
  "salou", "tremp", "la pobla de segur", "balaguer", "mollerussa", "cervera",
  "tarrega", "sau", "siurana", "palamos", "palafrugell", "ripoll", "lloret de mar",
  "manlleu", "guissona", "mataro", "tortella",
];

function isFarTitle(titol: string): boolean {
  return parentheticals(titol).some((p) => {
    const w = normalize(p);
    return FAR_PLACES.some((f) => new RegExp(`(^| )${f}( |$)`).test(w));
  });
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

// ============================ NORMALIZACIÓN COMÚN ============================

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
  return {
    id: String(base.id),
    titulo: titol,
    empleador: base.empleador,
    ambito: base.ambito,
    municipio: base.municipio,
    lugar: base.lugar ?? null,
    lejos: base.lejos ?? false,
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
  };
}

// ============================ FUENTE A: CONVOCA ============================

async function fetchConvoca(m: ConvocaSource): Promise<Item[]> {
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
          municipio: m.nombre,
          lugar: m.nombre,
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

// ============================ FUENTE B: CIDO ============================

function cidoUrl(ambit: string, extra: Record<string, string>): string {
  return `${CIDO_BASE_URL}?${new URLSearchParams({ "filter[ambit]": ambit, ...extra }).toString()}`;
}

/** Todas las páginas de un ámbito y un estado. */
async function cidoRows(ambit: string, estat: string): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  for (let offset = 0; offset < CIDO_MAX_ROWS; offset += CIDO_PAGE_LIMIT) {
    const res = await fetchJson(cidoUrl(ambit, {
      "filter[estat]": estat,
      sort: "-id",
      "page[limit]": String(CIDO_PAGE_LIMIT),
      "page[offset]": String(offset),
    }));
    const cuerpo = res.body as
      { data?: Record<string, unknown>[]; meta?: { totalResourceCount?: number } } | null;
    const data = cuerpo?.data;
    if (!res.ok || !Array.isArray(data)) {
      throw new Error(`CIDO respondió mal (${ambit} / ${estat}, status=${res.status})`);
    }
    filas.push(...data);
    const total = Number(cuerpo?.meta?.totalResourceCount ?? filas.length);
    if (!data.length || filas.length >= total) break;
  }
  return filas;
}

async function fetchCido(s: CidoSource): Promise<Item[]> {
  const paginas = await Promise.all(CIDO_STATES.map((estat) => cidoRows(s.ambit, estat)));

  const out: Item[] = [];
  paginas.forEach((data) => {
    for (const row of data) {
      const a = row.attributes as Record<string, unknown> | undefined;
      const rid = String((row as Record<string, unknown>).id ?? a?.identificador ?? "");
      if (!a || !rid || isExcluded(a.titol)) continue;

      // Un solo criterio de área para las tres fuentes. En una plaza municipal
      // la sede del organismo es además el sitio donde se trabaja, así que
      // aquí el radio es más fiel que en la Generalitat, donde solo dice que
      // el departamento tiene la sede en Barcelona.
      if (nearestTownKm(a.latitud, a.longitud) > AREA_RADIUS_KM) continue;

      const institucio = String(a.institucioDesenvolupat ?? "");
      const municipio = s.ambito === "municipal" ? municipioDe(institucio) : null;
      const titol = String(a.titol ?? "").trim();
      const empleador = employerLabel(institucio);
      out.push(buildItem({
        id: `cido-${rid}`,
        titulo: titol,
        empleador,
        ambito: s.ambito,
        municipio: municipio ?? empleador,
        lugar: extractWorkplace(titol) ?? municipio,
        lejos: isFarTitle(titol),
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
  });
  return out;
}

// ============================ BASE DE DATOS ============================

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
    `${SB_URL}/rest/v1/convoca_board_items?select=item&apply_end=lt.${today}&apply_end=gte.${desde}&order=apply_end.desc&limit=400`,
    { headers: DB, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as { item: Item }[];
  return rows.map((r) => r.item);
}

async function readSnapshot(): Promise<{ data: unknown; updated_at: string } | null> {
  const res = await fetch(`${SB_URL}/rest/v1/convoca_snapshot?id=eq.1&select=data,updated_at`, {
    headers: DB, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function writeSnapshot(data: unknown): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/convoca_snapshot?on_conflict=id`, {
    method: "POST",
    headers: { ...DB, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ id: 1, data, updated_at: new Date().toISOString() }]),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

// ============================ CONSTRUCCIÓN ============================

async function build(today: string) {
  const results = await Promise.allSettled(
    SOURCES.map((s) => (s.source === "convoca" ? fetchConvoca(s) : fetchCido(s))),
  );
  const errores: { fuente: string; mensaje: string }[] = [];
  const vistos = new Map<string, Item>();
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      for (const it of r.value) if (!vistos.has(it.id)) vistos.set(it.id, it);
    } else {
      errores.push({ fuente: SOURCES[i].nombre, mensaje: String((r.reason as Error)?.message ?? r.reason) });
    }
  });
  const todos = [...vistos.values()];

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

  const cerradas = (await loadClosed(today))
    .filter((x) => !vistos.has(x.id))
    .map((x) => ({ ...x, diasRestantes: x.fin ? daysBetween(today, String(x.fin)) : null }));

  const plazas = abiertas.reduce((s, x) => s + (Number(x.plazas) || 0), 0);
  return {
    generado: new Date().toISOString(),
    hoy: today,
    abiertas,
    pendientes,
    cerradas,
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

// ============================ SERVIDOR ============================

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
      const snap = await readSnapshot();
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

    const data = await build(today);
    await writeSnapshot(data);
    return new Response(JSON.stringify({ ...data, cache: refresh ? "refresh" : "miss" }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
