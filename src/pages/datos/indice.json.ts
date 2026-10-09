import type { APIRoute } from 'astro';
import { indiceDeFichas } from '../../lib/indice';

/** Las fichas de este build, con su huella y su último cambio (`indice.ts`). */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await indiceDeFichas()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
