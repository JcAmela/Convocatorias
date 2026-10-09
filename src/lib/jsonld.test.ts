import { beforeAll, describe, expect, it } from 'vitest';
import { desfaseMadrid, descripcionHtml, jobPosting, motivoSinJobPosting, validoHasta } from './jsonld';
import { usaSitios } from './localizacion';
import { SITIOS, plaza } from './pruebas';
import { serializaJsonLd } from './seo';

const HOY = '2026-10-09';

/** Una abierta de la que se sabe todo: la que sí lleva JobPosting. */
const completa = (cambios = {}) => plaza({
  id: 'cido-22213201',
  titulo: "1 plaça d'Auxiliar administratiu/iva",
  empleador: 'Ayuntamiento de Badalona · Institut Municipal de Serveis Personals',
  donde: { sedeId: 'badalona', trabajoId: 'badalona', origen: 'sede' },
  fin: '2026-10-20',
  publicado: '2026-09-30',
  plazas: 2,
  nivelCodigo: 'C2',
  seleccion: 'Concurso-oposición: méritos y examen',
  ...cambios,
});

beforeAll(() => usaSitios(SITIOS));

describe('cuándo lleva JobPosting', () => {
  it('una abierta completa, sí', () => {
    expect(motivoSinJobPosting(completa(), 'abiertas', HOY)).toBeNull();
    expect(jobPosting(completa(), 'abiertas', HOY)).not.toBeNull();
  });

  it('pendientes y cerradas, nunca', () => {
    expect(jobPosting(completa(), 'pendientes', HOY)).toBeNull();
    expect(jobPosting(completa(), 'cerradas', HOY)).toBeNull();
  });

  it('sin fecha de cierre o con el plazo ya pasado, no', () => {
    expect(jobPosting(completa({ fin: null }), 'abiertas', HOY)).toBeNull();
    expect(jobPosting(completa({ fin: '2026-10-08' }), 'abiertas', HOY)).toBeNull();
    expect(jobPosting(completa({ fin: HOY }), 'abiertas', HOY)).not.toBeNull();
  });

  it('con una fecha que no es firme, no; con un plazo que cambió, sí', () => {
    const orientativa = completa({ notaPlazo: "Data orientativa; si teniu algun dubte, consulteu l'ens convocant" });
    const segunWeb = completa({ notaPlazo: "Termini segons el web de l'ens convocant" });
    const cambiado = completa({ notaPlazo: 'Termini anterior: 30/09/2026' });
    expect(motivoSinJobPosting(orientativa, 'abiertas', HOY)).toBe('la fecha de cierre no es firme');
    expect(motivoSinJobPosting(segunWeb, 'abiertas', HOY)).toBe('la fecha de cierre no es firme');
    expect(motivoSinJobPosting(cambiado, 'abiertas', HOY)).toBeNull();
  });

  it('sin saber dónde se trabaja, no: la sede del organismo no vale', () => {
    const soloSede = completa({ donde: { sedeId: 'badalona', trabajoId: null, origen: 'desconocido' } });
    expect(motivoSinJobPosting(soloSede, 'abiertas', HOY)).toBe('no se sabe dónde se trabaja');
    const comarca = completa({ donde: { sedeId: 'badalona', trabajoId: 'comarca-barcelones', origen: 'titulo' } });
    expect(motivoSinJobPosting(comarca, 'abiertas', HOY)).toBe('no se sabe en qué municipio se trabaja');
  });

  it('con la descripción corta, no', () => {
    expect(jobPosting(completa({ plazas: null }), 'abiertas', HOY)).toBeNull();
    expect(jobPosting(completa({ seleccion: null }), 'abiertas', HOY)).toBeNull();
    expect(jobPosting(completa({ nivelEstudios: null, titulacion: 'Vegeu les bases' }), 'abiertas', HOY)).toBeNull();
    expect(jobPosting(completa({ publicado: null }), 'abiertas', HOY)).toBeNull();
  });
});

describe('lo que lleva', () => {
  const jp = () => jobPosting(completa(), 'abiertas', HOY)!;

  it('el título original, el mismo del h1', () => {
    expect(jp().title).toBe("1 plaça d'Auxiliar administratiu/iva");
  });

  it('validThrough a las 23:59:59 con la hora de Madrid', () => {
    expect(jp().validThrough).toBe('2026-10-20T23:59:59+02:00');
    expect(validoHasta('2026-12-01')).toBe('2026-12-01T23:59:59+01:00');
    // El día del cambio de hora de octubre ya es invierno a las 23:59.
    expect(desfaseMadrid('2026-10-25')).toBe('+01:00');
    expect(desfaseMadrid('2027-03-28')).toBe('+02:00');
  });

  it('identifier como PropertyValue, directApply false, sin sueldo ni logotipo', () => {
    const j = jp();
    expect(j.identifier).toEqual({ '@type': 'PropertyValue', name: 'CIDO', value: '22213201' });
    expect(j.directApply).toBe(false);
    expect(j).not.toHaveProperty('baseSalary');
    expect(j.hiringOrganization).toEqual({
      '@type': 'Organization', name: 'Ayuntamiento de Badalona – Institut Municipal de Serveis Personals',
    });
  });

  it('el lugar con su país y sus coordenadas', () => {
    expect(jp().jobLocation).toEqual({
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: 'Badalona', addressRegion: 'Cataluña', addressCountry: 'ES' },
      geo: { '@type': 'GeoCoordinates', latitude: 41.4502, longitude: 2.2445 },
    });
  });

  it('TEMPORARY en temporales y bolsas; nada en las fijas', () => {
    expect(jp().employmentType).toBe('TEMPORARY');
    expect(jobPosting(completa({ tipo: 'bolsa' }), 'abiertas', HOY)!.employmentType).toBe('TEMPORARY');
    expect(jobPosting(completa({ fijo: true }), 'abiertas', HOY)).not.toHaveProperty('employmentType');
  });

  it('estudios aproximados a partir del grupo', () => {
    expect(jobPosting(completa({ nivelCodigo: 'AP' }), 'abiertas', HOY)!.educationRequirements).toBe('no requirements');
    expect(jobPosting(completa({ nivelCodigo: 'A1' }), 'abiertas', HOY)!.educationRequirements)
      .toEqual({ '@type': 'EducationalOccupationalCredential', credentialCategory: 'bachelor degree' });
  });

  it('la descripción en HTML lleva lo mismo que la página', () => {
    const html = descripcionHtml(completa({ otrosRequisitos: 'Nivell C de català' }));
    for (const trozo of ['Ayuntamiento de Badalona', 'Cuándo puedes apuntarte', '20 de octubre de 2026',
      '2 puestos convocados', 'Badalona · Barcelonès', 'Nivell C de català', 'Concurso-oposición', 'Manda siempre']) {
      expect(html).toContain(trozo);
    }
    expect(html).toMatch(/^<p>.*<ul>.*<\/ul>.*<\/p>$/);
  });

  it('el HTML de la descripción va escapado', () => {
    const html = descripcionHtml(completa({ otrosRequisitos: '<script>alert(1)</script> & más' }));
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; más');
  });
});

describe('serializaJsonLd', () => {
  it('no deja que un texto cierre la etiqueta <script>', () => {
    const s = serializaJsonLd({ title: '</script><script>alert(1)</script>' });
    expect(s).not.toContain('</script>');
    expect(JSON.parse(s).title).toBe('</script><script>alert(1)</script>');
  });
});
