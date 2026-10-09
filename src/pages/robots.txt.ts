import type { APIRoute } from 'astro';
import { DOMINIO_PROPIO, absoluta } from '../lib/seo';

/**
 * Se deja entrar a todos. El sitemap solo se anuncia con dominio propio
 * (`seo.ts`): mientras tanto las fichas llevan `noindex` y no se manda nada a
 * Google.
 */
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', ...(DOMINIO_PROPIO ? ['', `Sitemap: ${absoluta('/sitemap.xml')}`] : []), ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
