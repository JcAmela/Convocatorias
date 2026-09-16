/**
 * Lo que necesita TypeScript para leer
 * `supabase/functions/convoca-board/index.ts` fuera de Deno.
 *
 * Ese fichero —817 líneas, el más grande del proyecto— estaba en el `exclude`
 * del `tsconfig.json`, así que nunca pasaba por `npm run check`: la mitad del
 * sistema que decide qué datos llegan al navegador no la miraba nadie. Con
 * estas dos declaraciones entra en el typecheck sin tener que instalar Deno.
 *
 * El global `Deno`, con lo mínimo que el módulo usa y no más: si mañana toca
 * otra cosa del runtime, el typecheck lo dirá en vez de callárselo.
 */
declare const Deno: {
  env: { get(clave: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

/**
 * El import de tipos del runtime de Supabase. En Deno se resuelve por red
 * desde jsr; aquí basta con que el módulo exista para que el import lateral
 * no sea un error. Los tipos que de verdad se usan son los de arriba.
 */
declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts';
