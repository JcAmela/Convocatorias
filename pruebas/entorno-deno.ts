/**
 * El poco Deno que la función toca al cargarse. `index.ts` lee dos variables
 * de entorno y registra un servidor en el nivel superior, así que sin esto el
 * módulo revienta nada más importarlo.
 *
 * Las credenciales se dejan vacías a propósito: con ellas así, las funciones
 * que hablan con la base (`readSnapshot`, `writeSnapshot`, `saveSeen`) no
 * llegan a salir a la red. Aquí solo se prueba la lógica pura.
 */
const servidas: ((req: Request) => Response | Promise<Response>)[] = [];

(globalThis as Record<string, unknown>).Deno = {
  env: { get: () => undefined },
  serve: (handler: (req: Request) => Response | Promise<Response>) => {
    servidas.push(handler);
  },
};
