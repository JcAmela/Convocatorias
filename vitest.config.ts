import { defineConfig } from 'vitest/config';

/**
 * La función de Supabase corre en Deno y la web en Node, así que hasta hoy la
 * mitad del sistema que más código tiene —817 líneas— no la ejecutaba nadie
 * fuera de producción. No hace falta Deno para probarla: lo único que trae de
 * ese entorno son dos cosas, y las dos se pueden fingir.
 *
 *   - `import "jsr:…/edge-runtime.d.ts"`, que solo aporta tipos y aquí se
 *     resuelve a un módulo vacío;
 *   - el global `Deno`, que el módulo toca en tres sitios al cargarse
 *     (`env.get` dos veces y `serve` una). Lo pone `pruebas/entorno-deno.ts`.
 *
 * Con eso el fichero se importa tal cual, sin copiarlo ni trocearlo, y lo que
 * se prueba es exactamente lo que se despliega.
 */
export default defineConfig({
  resolve: {
    alias: {
      'jsr:@supabase/functions-js/edge-runtime.d.ts': new URL(
        './pruebas/jsr-edge-runtime.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    setupFiles: ['./pruebas/entorno-deno.ts'],
  },
});
