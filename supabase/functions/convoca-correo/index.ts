import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { aplica, deQuery } from "../_shared/filtros.ts";
import { asuntoCorreo, correoHtml, correoTexto, type DatosCorreo } from "../_shared/correo.ts";
import type { Plaza, Tablero } from "../_shared/tipos.ts";

// ============================================================================
// convoca-correo — compone los avisos y los manda.
//
// Dos modos por la misma puerta:
//
//   {"tanda": true}           la rutina diaria: recorre las suscripciones que
//                             tocan hoy y manda a cada una lo suyo.
//   {"para": "…@…", …}        un envío suelto, para verlo en una bandeja de
//                             verdad antes de tocar nada.
//
// No es un endpoint abierto: mandar correo a quien lo pida es la forma más
// rápida de acabar en todas las listas negras, y de que el dominio no valga
// ya para nada. Exige un token que solo vive como secreto del proyecto.
// ============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CORREO_TOKEN = Deno.env.get("CORREO_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

/** Mientras no haya dominio propio, Resend solo entrega al titular de la cuenta. */
const REMITENTE = "Convocatorias <onboarding@resend.dev>";
const SITIO = "https://convocatorias-ten.vercel.app";

/** Cuántas tarjetas caben antes de que el correo deje de leerse. */
const TOPE_TARJETAS = 8;

/**
 * Cuánto tiene que pasar desde el último envío. Se mide en tiempo y no en día
 * de la semana para que una sola rutina diaria sirva para las tres cadencias,
 * y porque quien se suscribe un jueves no espera que su «semanal» le llegue
 * los lunes.
 *
 * Los márgenes van algo por debajo del nombre —20 horas, no 24— porque la
 * rutina no arranca clavada a la misma hora y si no se saltaría un día.
 */
const ESPERA_HORAS: Record<string, number> = { diaria: 20, semanal: 156, mensual: 660 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-token",
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Suscripcion {
  id: string;
  usuario_id: string;
  nombre: string;
  filtros: string;
  cadencia: string;
  ultimo_envio_en: string | null;
  creada_en: string;
}

async function pideJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${new URL(url).pathname} respondió ${res.status}`);
  return res.json();
}

/** El tablero de hoy, una sola vez para todos los suscriptores. */
async function leeTablero(): Promise<Tablero> {
  return await pideJson(`${SB_URL}/functions/v1/convoca-board`) as Tablero;
}

/** El correo de la cuenta. Vive en auth.users y no se copia a ningún sitio. */
async function correoDe(usuarioId: string): Promise<string | null> {
  try {
    const u = await pideJson(`${SB_URL}/auth/v1/admin/users/${usuarioId}`, { headers: DB }) as
      { email?: string };
    return u?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Cuándo se vio por primera vez cada convocatoria. Es lo que convierte «las
 * que encajan» en «las nuevas», y sale del archivo: la respuesta del tablero
 * no lo trae.
 */
async function primeraVez(desde: string): Promise<Map<string, string>> {
  const filas = await pideJson(
    `${SB_URL}/rest/v1/convoca_board_items?select=item_id,first_seen` +
      // Codificada: la marca de tiempo trae un «+» de zona horaria que en
      // una query string significa espacio y deja la consulta en un 400.
      `&first_seen=gte.${encodeURIComponent(desde)}&limit=5000`,
    { headers: DB },
  ) as { item_id: string; first_seen: string }[];
  return new Map(filas.map((f) => [f.item_id, f.first_seen]));
}

export function toca(s: Suscripcion, ahora: number): boolean {
  if (!s.ultimo_envio_en) return true;
  const horas = (ahora - Date.parse(s.ultimo_envio_en)) / 3_600_000;
  return horas >= (ESPERA_HORAS[s.cadencia] ?? ESPERA_HORAS.mensual);
}

/**
 * Desde cuándo se considera «nuevo» para esta suscripción. En el primer envío
 * manda la fecha de alta: quien se suscribe hoy no quiere de golpe las mil
 * convocatorias vivas, quiere lo que salga a partir de ahora.
 */
export function corteDe(s: Suscripcion): string {
  return s.ultimo_envio_en ?? s.creada_en;
}

function datosCorreo(s: Suscripcion, nuevas: Plaza[], tablero: Tablero): DatosCorreo {
  const f = deQuery(s.filtros);
  return {
    plazas: nuevas.slice(0, TOPE_TARJETAS),
    totalQueEncajan: nuevas.length,
    catalogo: tablero.sitios,
    desde: f.desde,
    nombreBusqueda: s.nombre,
    urlTablero: `${SITIO}/?${s.filtros}`,
    urlGestion: `${SITIO}/suscripciones`,
    urlBaja: `${SITIO}/suscripciones`,
  };
}

async function manda(para: string, d: DatosCorreo): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: REMITENTE,
      to: [para],
      subject: asuntoCorreo(d),
      html: correoHtml(d),
      // Las dos versiones en el mismo envío: quien lee sin estilos ve el
      // texto, y un correo solo-HTML puntúa peor en los filtros de spam.
      text: correoTexto(d),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
}

/* --------------------------------------------------------- la rutina diaria */

async function tandaDiaria() {
  const ahora = Date.now();
  const suscripciones = await pideJson(
    `${SB_URL}/rest/v1/convoca_suscripciones` +
      `?select=id,usuario_id,nombre,filtros,cadencia,ultimo_envio_en,creada_en` +
      `&activa=is.true&confirmada_en=not.is.null`,
    { headers: DB },
  ) as Suscripcion[];

  const pendientes = suscripciones.filter((s) => toca(s, ahora));
  if (pendientes.length === 0) return { revisadas: suscripciones.length, enviados: 0, detalle: [] };

  const tablero = await leeTablero();
  // Un solo viaje al archivo, desde el corte más antiguo de todas.
  const corteMasViejo = pendientes.map(corteDe).sort()[0];
  const vistoPorPrimeraVez = await primeraVez(corteMasViejo);

  const detalle: Record<string, unknown>[] = [];
  let enviados = 0;

  for (const s of pendientes) {
    try {
      const f = deQuery(s.filtros);
      const corte = corteDe(s);
      const nuevas = aplica(tablero.sitios, tablero.abiertas, f).filter((p) => {
        const visto = vistoPorPrimeraVez.get(p.id);
        return visto !== undefined && visto >= corte;
      });

      // Un correo que dice «no hay nada» todos los días enseña a ignorarlo.
      // Sin novedades no se manda y el corte no avanza, así que lo que salga
      // mañana se compara con la misma fecha y no se pierde nada.
      if (nuevas.length === 0) {
        detalle.push({ id: s.id, nombre: s.nombre, nuevas: 0, enviado: false });
        continue;
      }

      const para = await correoDe(s.usuario_id);
      if (!para) {
        detalle.push({ id: s.id, error: "la cuenta ya no tiene correo" });
        continue;
      }

      await manda(para, datosCorreo(s, nuevas, tablero));
      await fetch(`${SB_URL}/rest/v1/convoca_suscripciones?id=eq.${s.id}`, {
        method: "PATCH",
        headers: DB,
        body: JSON.stringify({ ultimo_envio_en: new Date(ahora).toISOString() }),
        signal: AbortSignal.timeout(15_000),
      });

      enviados++;
      detalle.push({ id: s.id, nombre: s.nombre, nuevas: nuevas.length, enviado: true });
    } catch (e) {
      // Que falle una suscripción no puede dejar sin correo a las demás.
      detalle.push({ id: s.id, error: String((e as Error)?.message ?? e) });
    }
  }

  return { revisadas: suscripciones.length, pendientes: pendientes.length, enviados, detalle };
}

/* ------------------------------------------------------------- un solo envío */

async function envioSuelto(cuerpo: {
  para?: string; filtros?: string; nombre?: string; cuantas?: number;
}) {
  const para = cuerpo.para?.trim();
  if (!para) return json({ error: "Falta «para»" }, 400);

  const filtros = cuerpo.filtros ?? "estudios=C2,AP&tipo=fija&desde=badalona";
  const cuantas = Math.min(Math.max(cuerpo.cuantas ?? TOPE_TARJETAS, 1), 20);
  const tablero = await leeTablero();
  const f = deQuery(filtros);
  const encajan = aplica(tablero.sitios, tablero.abiertas, f);

  const d: DatosCorreo = {
    plazas: encajan.slice(0, cuantas),
    totalQueEncajan: encajan.length,
    catalogo: tablero.sitios,
    desde: f.desde,
    nombreBusqueda: cuerpo.nombre ?? "Fijas a mi alcance",
    urlTablero: `${SITIO}/?${filtros}`,
    urlGestion: `${SITIO}/suscripciones`,
    urlBaja: `${SITIO}/suscripciones`,
  };

  await manda(para, d);
  return json({ enviado: true, para, asunto: asuntoCorreo(d), plazas: d.plazas.length, encajan: encajan.length });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);

  // Comparación directa: el token es largo y aleatorio, y nadie puede ir
  // adivinándolo carácter a carácter contra esta función.
  if (!CORREO_TOKEN || req.headers.get("x-token") !== CORREO_TOKEN) {
    return json({ error: "Token no válido" }, 401);
  }
  if (!RESEND_API_KEY) return json({ error: "Falta RESEND_API_KEY" }, 500);

  try {
    const cuerpo = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (cuerpo.tanda) return json(await tandaDiaria());
    return await envioSuelto(cuerpo as { para?: string });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
