// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // De dónde se sirve el sitio: con esto Astro puede componer la URL canónica
  // y las de compartir. Si algún día hay dominio propio, se cambia aquí.
  site: 'https://convocatorias-ten.vercel.app',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  build: { inlineStylesheets: 'auto' },
});
