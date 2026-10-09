import { SITIO } from '../../supabase/functions/_shared/sitio.ts';

/**
 * Lo que la web cuenta de sí misma a los buscadores.
 *
 * Mientras se sirva desde un subdominio prestado (`*.vercel.app`,
 * `*.pages.dev`) las fichas y los listados llevan `noindex`, robots.txt no
 * anuncia el sitemap y no se manda nada a Google: lo que Google aprenda en un
 * dominio que no es nuestro habría que desaprenderlo después. Al pasar
 * `SITIO` al dominio propio (F4) esto cambia solo.
 */
export const DOMINIO_PROPIO = !/\.(vercel\.app|pages\.dev)$/.test(new URL(SITIO).hostname);

export const NOMBRE = 'Convocatorias';

/** La imagen para compartir: 1200×630, generada con `pruebas/imagen-og.mjs`. */
export const IMAGEN_OG = { url: `${SITIO}/og.png`, ancho: 1200, alto: 630, alt: 'Convocatorias: empleo público en Cataluña' };

/** Lo que cabe en el resultado de Google: 160 caracteres, cortando por palabra. */
export const MAX_DESCRIPCION = 160;

export function recortaDescripcion(texto: string, max = MAX_DESCRIPCION): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.·–-]+$/, '')}…`;
}

/** La URL absoluta de una ruta de la web. */
export const absoluta = (ruta: string) => new URL(ruta, SITIO).href;

/** WebSite y Organization, para la portada. Sin logotipo: no somos un organismo. */
export function jsonLdPortada() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: NOMBRE,
      url: absoluta('/'),
      inLanguage: 'es',
      description: 'Empleo público con el plazo abierto en toda Cataluña. Web independiente, no oficial.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: NOMBRE,
      url: absoluta('/'),
    },
  ];
}

/** Migas de pan: el mismo camino que se ve encima del título. */
export function jsonLdMigas(migas: { nombre: string; ruta: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: migas.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: m.nombre,
      item: absoluta(m.ruta),
    })),
  };
}

/**
 * JSON listo para ir dentro de `<script type="application/ld+json">`. Un
 * título con `</script>` cerraría la etiqueta antes de tiempo, así que `<` se
 * escapa siempre.
 */
export function serializaJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, '\\u003c');
}
