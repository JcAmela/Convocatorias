import { leeTablero } from '../lib/datos';
import { aplica, deQuery } from '../../supabase/functions/_shared/filtros.ts';
import { correoHtml } from '../../supabase/functions/_shared/correo.ts';

/**
 * El aviso por correo, servido como página para poder mirarlo en el móvil.
 *
 * Es un andamio, no una pantalla del producto: se cae en cuanto el alta y el
 * envío estén montados. Mientras tanto evita la única forma de revisar una
 * plantilla de correo que es peor que esta, que es enviársela a alguien.
 *
 * Sale del build como fichero suelto, así que enseña las convocatorias que
 * había al desplegar. No se indexa: está en robots.txt.
 */

const FILTROS = 'estudios=C2,AP&tipo=fija&desde=badalona';
const SITIO = 'https://convocatorias-ten.vercel.app';

export async function GET() {
  const datos = await leeTablero();
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
