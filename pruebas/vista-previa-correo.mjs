/**
 * Escribe el correo en un fichero para poder mirarlo en el navegador.
 * No envía nada. `node --experimental-strip-types pruebas/vista-previa-correo.mjs`
 */
import { writeFileSync } from 'node:fs';
import { aplica, deQuery } from '../supabase/functions/_shared/filtros.ts';
import { asuntoCorreo, correoHtml, correoTexto } from '../supabase/functions/_shared/correo.ts';

const API = 'https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board';
const datos = await (await fetch(API)).json();

// Una suscripción de ejemplo: el perfil real que hemos estado mirando.
const filtros = 'estudios=C2,AP&tipo=fija&desde=badalona';
const f = deQuery(filtros);
const encajan = aplica(datos.sitios, datos.abiertas, f);

// «Nuevas desde ayer» se decidirá con first_seen; aquí vale una muestra real.
const plazas = encajan.slice(0, 6);

const d = {
  plazas,
  catalogo: datos.sitios,
  desde: f.desde,
  nombreBusqueda: 'Fijas a mi alcance',
  urlTablero: `https://convocatorias-ten.vercel.app/?${filtros}`,
  urlGestion: 'https://convocatorias-ten.vercel.app/suscripciones?t=EJEMPLO',
  urlBaja: 'https://convocatorias-ten.vercel.app/baja?t=EJEMPLO',
};

writeFileSync('vista-previa-correo.html', correoHtml(d), 'utf8');
console.log('asunto:', asuntoCorreo(d));
console.log('plazas:', plazas.length, 'de', encajan.length, 'que encajan');
console.log('---- texto plano ----');
console.log(correoTexto(d));
