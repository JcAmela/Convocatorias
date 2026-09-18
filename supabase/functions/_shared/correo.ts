import type { Plaza } from './tipos.ts';
import { type Catalogo, esSoloSede, sitioMostrado } from './catalogo.ts';
import { kmDesde } from './geo.ts';
import { urgencia } from './plazos.ts';

/**
 * El aviso por correo.
 *
 * Un correo no es una página web. Aquí no hay hojas de estilo externas, ni
 * flex, ni grid: Gmail y Outlook tiran la mitad de eso. Se maqueta con tablas
 * y estilos en línea, que es lo único que sobrevive en todas partes, y con un
 * ancho pensado para leerse con el pulgar.
 *
 * Los colores son los del tablero, para que quien recibe el correo reconozca
 * de dónde viene antes de leer el remitente.
 */

const PINO = '#0F5C4E';
const OCRE = '#8A5A02';
const OXIDO = '#9B3B1E';
const TINTA = '#1B211D';
const TINTA_3 = '#6E766F';
const LINEA = '#E3E5DF';
const FONDO = '#F4F5F1';

/** El texto de la fuente es ajeno: nunca se mete crudo en el HTML. */
function escapa(t: string): string {
  return t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface DatosCorreo {
  /** Lo nuevo desde el último aviso, ya filtrado con los criterios del suscriptor. */
  plazas: Plaza[];
  catalogo: Catalogo;
  /** Municipio de referencia para los kilómetros. `null` = no lo ha elegido. */
  desde: string | null;
  /** Cómo llamó el suscriptor a esta búsqueda. */
  nombreBusqueda: string;
  /** Abre el tablero con los filtros de esta suscripción ya puestos. */
  urlTablero: string;
  /** Cambiar los filtros o la frecuencia. */
  urlGestion: string;
  /** Baja inmediata, sin iniciar sesión. Obligatorio en todos los envíos. */
  urlBaja: string;
}

export function asuntoCorreo(d: DatosCorreo): string {
  const n = d.plazas.length;
  if (n === 0) return `Sin novedades en «${d.nombreBusqueda}»`;
  // Lo que más mueve a abrir un correo es saber si corre prisa.
  const urgentes = d.plazas.filter(
    (p) => p.diasRestantes !== null && p.diasRestantes >= 0 && p.diasRestantes <= 3,
  ).length;
  const cabeza = n === 1 ? '1 convocatoria nueva' : `${n} convocatorias nuevas`;
  return urgentes > 0 ? `${cabeza}, ${urgentes} cierran ya` : cabeza;
}

/** El color del plazo: rojo lo que cierra ya, ocre esta semana, gris el resto. */
function colorPlazo(dias: number | null): string {
  if (dias === null) return TINTA_3;
  if (dias <= 3) return OXIDO;
  if (dias <= 7) return OCRE;
  return TINTA_3;
}

function tarjeta(p: Plaza, d: DatosCorreo): string {
  const u = urgencia(p.diasRestantes);
  const color = colorPlazo(p.diasRestantes);
  const s = sitioMostrado(d.catalogo, p);
  const km = kmDesde(d.catalogo, p, d.desde);
  const enlace = p.fichaOficial ?? p.enlace;

  const lugar = s
    ? escapa(s.nombre) + (esSoloSede(d.catalogo, p) ? ' *' : '') +
      (km !== null ? ` · a ${km} km` : '')
    : 'Sin lugar indicado';

  const tipo = p.tipo === 'bolsa' ? 'Bolsa' : p.fijo ? 'Fija' : 'Temporal';
  const datos = [
    p.plazas ? `${p.plazas} ${p.plazas === 1 ? 'plaza' : 'plazas'}` : null,
    p.nivelEstudios ? escapa(p.nivelEstudios) : null,
  ].filter(Boolean).join(' · ');

  return `
  <tr><td style="padding:0 0 12px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#ffffff;border:1px solid ${LINEA};border-radius:12px">
      <tr><td style="padding:16px 18px">
        <p style="margin:0 0 8px 0;font:600 13px/1.2 -apple-system,Segoe UI,Roboto,Arial,sans-serif">
          <span style="color:${color}">${escapa(u.etiqueta)}</span>
          <span style="color:${TINTA_3}"> · ${tipo}</span>
        </p>
        <p lang="ca" style="margin:0 0 6px 0;font:700 17px/1.32 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA}">
          ${escapa(p.titulo)}
        </p>
        <p style="margin:0 0 2px 0;font:400 14px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
          ${escapa(p.empleador)}
        </p>
        <p style="margin:0 0 12px 0;font:400 14px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
          ${lugar}${datos ? ` — ${datos}` : ''}
        </p>
        ${enlace
          ? `<a href="${escapa(enlace)}" style="display:inline-block;background:${PINO};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font:600 14px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif">Ver la convocatoria</a>`
          : `<p style="margin:0;font:400 13px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">El anuncio no trae enlace de solicitud.</p>`}
      </td></tr>
    </table>
  </td></tr>`;
}

export function correoHtml(d: DatosCorreo): string {
  const n = d.plazas.length;
  const hayAsterisco = d.plazas.some((p) => esSoloSede(d.catalogo, p));

  // La línea que Gmail enseña junto al asunto. Oculta en el cuerpo.
  const adelanto = n === 0
    ? 'Hoy no hay nada nuevo que encaje con tu búsqueda.'
    : `Lo nuevo en «${d.nombreBusqueda}».`;

  const cuerpo = n === 0
    ? `<tr><td style="padding:4px 0 20px 0;font:400 15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
         Hoy no ha salido nada que encaje con lo que buscas. No hace falta que hagas nada:
         el próximo aviso llegará cuando lo haya.
       </td></tr>`
    : d.plazas.map((p) => tarjeta(p, d)).join('');

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapa(asuntoCorreo(d))}</title>
</head>
<body style="margin:0;padding:0;background:${FONDO}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapa(adelanto)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FONDO}">
<tr><td align="center" style="padding:20px 12px 32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">

    <tr><td style="padding:0 0 4px 0;font:700 20px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA}">
      ${n === 0 ? 'Sin novedades' : n === 1 ? '1 convocatoria nueva' : `${n} convocatorias nuevas`}
    </td></tr>
    <tr><td style="padding:0 0 18px 0;font:400 14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
      De tu búsqueda «${escapa(d.nombreBusqueda)}».
    </td></tr>

    ${cuerpo}

    ${hayAsterisco ? `
    <tr><td style="padding:4px 2px 0 2px;font:400 12px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
      * Es la sede del organismo; el anuncio no dice dónde se trabaja. Muchas bolsas
      cubren varios centros a la vez, así que compruébalo antes de contar los kilómetros.
    </td></tr>` : ''}

    <tr><td style="padding:22px 2px 0 2px;border-top:1px solid ${LINEA};font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
      Manda lo que diga la convocatoria oficial, no este correo: comprueba siempre el
      plazo y el lugar de trabajo en el enlace.
    </td></tr>
    <tr><td style="padding:12px 2px 0 2px;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${TINTA_3}">
      <a href="${escapa(d.urlTablero)}" style="color:${PINO}">Ver esta búsqueda en el tablero</a> ·
      <a href="${escapa(d.urlGestion)}" style="color:${PINO}">Cambiar filtros o frecuencia</a> ·
      <a href="${escapa(d.urlBaja)}" style="color:${TINTA_3}">Darme de baja</a>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;
}

/**
 * La versión en texto plano. No es un adorno: un correo que solo lleva HTML
 * tiene bastantes más papeletas de acabar en spam, y hay quien lee el correo
 * sin imágenes ni estilos.
 */
export function correoTexto(d: DatosCorreo): string {
  const pie = [
    `Ver en el tablero: ${d.urlTablero}`,
    `Cambiar filtros o frecuencia: ${d.urlGestion}`,
    `Darse de baja: ${d.urlBaja}`,
  ];

  if (d.plazas.length === 0) {
    return [
      `Sin novedades en «${d.nombreBusqueda}».`,
      '',
      'Hoy no ha salido nada que encaje con lo que buscas.',
      '',
      ...pie,
    ].join('\n');
  }

  const fichas = d.plazas.map((p) => {
    const s = sitioMostrado(d.catalogo, p);
    const km = kmDesde(d.catalogo, p, d.desde);
    const lugar = s
      ? s.nombre + (esSoloSede(d.catalogo, p) ? ' *' : '') + (km !== null ? ` (a ${km} km)` : '')
      : 'sin lugar indicado';
    const tipo = p.tipo === 'bolsa' ? 'Bolsa' : p.fijo ? 'Fija' : 'Temporal';
    return [
      `* ${p.titulo}`,
      `  ${p.empleador} — ${lugar}`,
      `  ${urgencia(p.diasRestantes).etiqueta} · ${tipo}`,
      `  ${p.fichaOficial ?? p.enlace ?? '(el anuncio no trae enlace)'}`,
    ].join('\n');
  });

  const n = d.plazas.length;
  const cabeza = n === 1 ? '1 convocatoria nueva' : `${n} convocatorias nuevas`;
  return [
    `${cabeza} en «${d.nombreBusqueda}».`,
    '',
    fichas.join('\n\n'),
    '',
    'Comprueba el plazo y el lugar en la convocatoria oficial, no aquí.',
    '',
    ...pie,
  ].join('\n');
}
