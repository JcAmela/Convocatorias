import type { GetStaticPaths } from 'astro';
import { datosPublicos } from '../lib/publicos';
import { aplica, deQuery } from '../../supabase/functions/_shared/filtros.ts';
import { correoHtml } from '../../supabase/functions/_shared/correo.ts';
import { SITIO } from '../../supabase/functions/_shared/sitio.ts';

/**
 * El aviso por correo, servido como página para poder mirarlo en el móvil:
 * `/vista-previa-correo.html` con `npm run dev`.
 *
 * Es un andamio, no una pantalla del producto, así que solo existe en
 * desarrollo. Es una ruta dinámica para eso: en el build de producción
 * `getStaticPaths` no devuelve nada y no se genera ningún fichero, mientras
 * que en `astro dev` sirve la única página que declara.
 */
export const getStaticPaths = (() =>
  import.meta.env.DEV ? [{ params: { vistaPrevia: 'vista-previa-correo' } }] : []) satisfies GetStaticPaths;

const FILTROS = 'estudios=C2,AP&tipo=fija&desde=badalona';

export async function GET() {
  const { tablero: datos } = await datosPublicos();
  const f = deQuery(FILTROS);
  const encajan = aplica(datos.sitios, datos.abiertas, f);

  const html = correoHtml({
    // «Nuevas desde ayer» lo decidirá `first_seen`; aquí vale una muestra real.
    plazas: encajan.slice(0, 6),
    catalogo: datos.sitios,
    desde: f.desde,
    nombreBusqueda: 'Fijas a mi alcance',
    urlTablero: `${SITIO}/?${FILTROS}`,
    urlGestion: `${SITIO}/suscripciones?t=EJEMPLO`,
    urlBaja: `${SITIO}/baja?t=EJEMPLO`,
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
