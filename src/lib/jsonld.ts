import type { NivelCodigo, Plaza } from './tipos';
import { AVISO_OFICIAL, fichaDe, textoAviso } from './ficha';
import { claseContrato } from './filtros';
import { normaliza } from './formato';
import { sitioTrabajo } from './localizacion';
import { rutaFicha } from './rutas';
import { absoluta } from './seo';

/**
 * El JobPosting de una ficha, para Google Empleos.
 *
 * Solo lo llevan las convocatorias abiertas de las que se sabe con certeza lo
 * que Google pide. Marcar de más sale caro: una ubicación inventada cuenta
 * como «Misrepresentation», una oferta caducada que sigue marcada puede traer
 * una acción manual sobre todo el sitio, y Google no avisa antes.
 *
 * Las reglas, de `motivoSinJobPosting()`:
 *   - abierta y con fecha de cierre que no ha pasado;
 *   - fecha firme: sin «data orientativa» ni «segons el web de l'ens»;
 *   - fecha de publicación (`datePosted` es obligatoria);
 *   - se sabe en qué municipio se trabaja: nunca con origen `desconocido`,
 *     que es cuando solo se sabe dónde tiene la sede el organismo;
 *   - descripción suficiente: requisitos, forma de selección y número de
 *     puestos.
 */

/** Avisos de plazo que dicen que la fecha no es de fiar. */
const FECHA_NO_FIRME = /orientativ|segons el web|segun la web|aproximad|provisional/;

export type Grupo = 'abiertas' | 'pendientes' | 'cerradas';

/** Por qué una convocatoria no lleva JobPosting, o `null` si lo lleva. */
export function motivoSinJobPosting(p: Plaza, grupo: Grupo, hoy: string): string | null {
  if (grupo !== 'abiertas') return 'no está abierta';
  if (!p.fin) return 'no tiene fecha de cierre';
  if (p.fin.slice(0, 10) < hoy) return 'el plazo ya ha cerrado';
  if (p.notaPlazo && FECHA_NO_FIRME.test(normaliza(p.notaPlazo))) return 'la fecha de cierre no es firme';
  if (!p.publicado) return 'no tiene fecha de publicación';
  if (!p.donde || p.donde.origen === 'desconocido') return 'no se sabe dónde se trabaja';
  const lugar = sitioTrabajo(p);
  if (!lugar || lugar.tipo !== 'municipio') return 'no se sabe en qué municipio se trabaja';
  const requisitos = p.nivelEstudios || (p.titulacion && p.titulacion !== 'Vegeu les bases');
  if (!requisitos) return 'no dice qué estudios piden';
  if (!p.seleccion) return 'no dice cómo se selecciona';
  if (!p.plazas) return 'no dice cuántos puestos hay';
  return null;
}

/**
 * El desfase de Europe/Madrid ese día: `+02:00` en verano, `+01:00` en
 * invierno. Se mira a mediodía, que en los dos días de cambio de hora ya tiene
 * el desfase que tendrá a las 23:59.
 */
export function desfaseMadrid(fecha: string): string {
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${fecha}T12:00:00Z`))
    .find((x) => x.type === 'timeZoneName')?.value;
  const m = /GMT([+-]\d{2}:\d{2})/.exec(parte ?? '');
  return m ? m[1] : '+01:00';
}

/** El último segundo del día de cierre, en hora de Madrid. */
export const validoHasta = (fin: string) => `${fin.slice(0, 10)}T23:59:59${desfaseMadrid(fin.slice(0, 10))}`;

/** Aproximado: la función pública no casa uno a uno con las categorías de Google. */
function estudios(nivel: NivelCodigo | null): unknown {
  switch (nivel) {
    case 'AP': return 'no requirements';
    case 'C2':
    case 'C1': return { '@type': 'EducationalOccupationalCredential', credentialCategory: 'high school' };
    case 'A2':
    case 'A':
    case 'A1': return { '@type': 'EducationalOccupationalCredential', credentialCategory: 'bachelor degree' };
    default: return undefined;
  }
}

const escapa = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** La descripción en HTML: lo mismo que se ve en la página, ni más ni menos. */
export function descripcionHtml(p: Plaza): string {
  const f = fichaDe(p);
  const partes = [
    `<p><strong>${escapa(f.casa)}</strong>${f.organismo ? ` – ${escapa(f.organismo)}` : ''}</p>`,
    ...f.avisos.map((a) => `<p>${escapa(textoAviso(a))}</p>`),
    '<ul>',
    ...f.filas.map((x) => `<li><strong>${escapa(x.termino)}:</strong> ${escapa(x.texto)}${x.detalle ? ` ${escapa(x.detalle)}` : ''}</li>`),
    '</ul>',
    `<p>${escapa(AVISO_OFICIAL)}</p>`,
  ];
  return partes.join('');
}

/** El JobPosting, o `null` si esta convocatoria no debe llevarlo. */
export function jobPosting(p: Plaza, grupo: Grupo, hoy: string): Record<string, unknown> | null {
  if (motivoSinJobPosting(p, grupo, hoy) !== null) return null;
  const lugar = sitioTrabajo(p)!;
  const clase = claseContrato(p);
  const educacion = estudios(p.nivelCodigo);
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    // El nombre tal como lo da el organismo: Google pide no retocarlo.
    title: p.titulo,
    description: descripcionHtml(p),
    datePosted: p.publicado,
    validThrough: validoHasta(p.fin!),
    url: absoluta(rutaFicha(p)),
    identifier: { '@type': 'PropertyValue', name: 'CIDO', value: p.id.replace(/^cido-/, '') },
    // Sin logotipo: los escudos municipales no son nuestros para usarlos.
    hiringOrganization: { '@type': 'Organization', name: p.empleador.replace(/\s*·\s*/g, ' – ') },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: lugar.nombre, addressRegion: 'Cataluña', addressCountry: 'ES' },
      ...(lugar.lat !== null && lugar.lon !== null
        ? { geo: { '@type': 'GeoCoordinates', latitude: lugar.lat, longitude: lugar.lon } }
        : {}),
    },
    ...(clase === 'temporal' || clase === 'bolsa' ? { employmentType: 'TEMPORARY' } : {}),
    // Se solicita en la sede del organismo, no aquí.
    directApply: false,
    ...(p.plazas ? { totalJobOpenings: p.plazas } : {}),
    ...(educacion !== undefined ? { educationRequirements: educacion } : {}),
  };
}
