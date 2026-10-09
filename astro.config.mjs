// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { SITIO } from './supabase/functions/_shared/sitio.ts';

export default defineConfig({
  // De dónde se sirve el sitio: con esto Astro puede componer la URL canónica
  // y las de compartir. Se cambia en `_shared/sitio.ts`.
  site: SITIO,
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  build: { inlineStylesheets: 'auto' },
});
