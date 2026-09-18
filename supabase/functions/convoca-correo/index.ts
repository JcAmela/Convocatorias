import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { aplica, deQuery } from "../_shared/filtros.ts";
import { asuntoCorreo, correoHtml, correoTexto } from "../_shared/correo.ts";
import type { Tablero } from "../_shared/tipos.ts";

// ============================================================================
// convoca-correo — compone un aviso y lo manda.
//
// Hoy solo sirve para verlo en la bandeja de entrada antes de enganchar nada:
// se le dice a quién y con qué filtros, y manda uno. Cuando estén las
// suscripciones, esta misma función recorrerá las que toquen ese día y usará
// el mismo camino de aquí abajo; lo único que cambia es de dónde salen el
// destinatario y los filtros.
//
// No es un endpoint abierto: mandar correo a quien pidan es la forma más
// rápida de acabar en todas las listas negras. Exige un token que solo vive
// como secreto del proyecto.
// ============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CORREO_TOKEN = Deno.env.get("CORREO_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";

/** Mientras no haya dominio propio, Resend solo entrega al titular de la cuenta. */
const REMITENTE = "Convocatorias <onboarding@resend.dev>";
const SITIO = "https://convocatorias-ten.vercel.app";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);

  // Comparación directa: el token es largo y aleatorio, y un atacante no
  // tiene forma de ir adivinándolo carácter a carácter contra esta función.
  if (!CORREO_TOKEN || req.headers.get("x-token") !== CORREO_TOKEN) {
    return json({ error: "Token no válido" }, 401);
  }
  if (!RESEND_API_KEY) return json({ error: "Falta RESEND_API_KEY" }, 500);

  try {
    const cuerpo = await req.json().catch(() => ({})) as {
      para?: string;
      filtros?: string;
      nombre?: string;
      cuantas?: number;
    };
    const para = cuerpo.para?.trim();
    if (!para) return json({ error: "Falta «para»" }, 400);

    const filtros = cuerpo.filtros ?? "estudios=C2,AP&tipo=fija&desde=badalona";
    const nombreBusqueda = cuerpo.nombre ?? "Fijas a mi alcance";
    const cuantas = Math.min(Math.max(cuerpo.cuantas ?? 6, 1), 20);

    const res = await fetch(`${SB_URL}/functions/v1/convoca-board`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return json({ error: `El tablero respondió ${res.status}` }, 502);
    const datos = await res.json() as Tablero;

    const f = deQuery(filtros);
    const encajan = aplica(datos.sitios, datos.abiertas, f);

    const d = {
      plazas: encajan.slice(0, cuantas),
      catalogo: datos.sitios,
      desde: f.desde,
      nombreBusqueda,
      urlTablero: `${SITIO}/?${filtros}`,
      urlGestion: `${SITIO}/suscripciones?t=EJEMPLO`,
      urlBaja: `${SITIO}/baja?t=EJEMPLO`,
    };

    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
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

    const respuesta = await envio.json().catch(() => null);
    if (!envio.ok) return json({ error: "Resend rechazó el envío", respuesta }, 502);

    return json({
      enviado: true,
      para,
      asunto: asuntoCorreo(d),
      plazas: d.plazas.length,
      deLasQueEncajan: encajan.length,
      respuesta,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
