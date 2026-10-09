# Convocatorias

Tablero de plazas de empleo público de toda Cataluña: los ayuntamientos de las
cuatro provincias, los consejos comarcales, la Generalitat y las diputaciones.
Alrededor de mil convocatorias vivas en cualquier momento.

No incluye plazas de policía, guardia urbana ni mossos.

## Qué hace

- **Las tres listas** que devuelve la API: con plazo abierto, anunciadas sin plazo
  todavía, y ya cerradas. Más una cuarta pestaña con las que guardas tú.
- **Gráfico de cierres**: cuántas convocatorias vencen cada uno de los próximos
  45 días. Se pulsa un día y la lista se queda solo con ese.
- **Filtros** por estudios, tipo de plaza, quién convoca, dónde se trabaja
  —municipio o comarca entera— y tiempo que queda, todos con el número de
  plazas que quedarían al marcarlos.
- **Distancias de verdad**: eliges tu municipio una vez y cada convocatoria dice
  a cuántos kilómetros queda. Se puede ordenar por cercanía y esconder lo que
  pille lejos.
- **Buscador** que ignora acentos y mayúsculas, exige todas las palabras y
  salva el salto del español al catalán: se teclea «administrativo» y encuentra
  las plazas de *administratiu*. La tecla `/` lo enfoca desde cualquier punto
  de la página.
- **Ficha de detalle** en un panel lateral, con requisitos, avisos de plazo y los
  enlaces para presentar la solicitud.
- **Guardadas** con la estrella, en `localStorage` de ese navegador.
- **Estado en la URL**: cualquier combinación de filtros se puede guardar en
  marcadores o mandar por WhatsApp y se abre igual.
- Vista de tarjetas o de tabla, tema claro/oscuro/automático.

## Cómo está montado

| Pieza | Para qué |
|---|---|
| **Astro** | Genera el sitio estático y aísla el JavaScript en una sola isla |
| **React** | La isla interactiva: filtros, gráfico, panel de detalle |
| **Tailwind v4** | Utilidades sobre variables CSS propias, sin `dark:` repetido |

Los colores se declaran una vez como variables en `src/styles/global.css` y se
exponen a Tailwind con `@theme inline`, así que `bg-surface` o `text-ink-3`
cambian solos entre claro y oscuro.

```
src/
  components/
    Tablero.tsx      la isla: estado, filtros, sincronía con la URL
    Filtros.tsx      barra de búsqueda, orden y desplegables de faceta
    Calendario.tsx   gráfico de cierres por día (SVG a mano) y su tabla
    Tarjeta.tsx      la plaza en formato tarjeta
    Tabla.tsx        la misma lista en formato denso
    Detalle.tsx      panel lateral con la ficha completa
    Tema.tsx         claro / oscuro / el del sistema
    Limite.tsx       red bajo la lista: un fallo al pintar no tumba la página
    piezas.tsx       píldoras e iconos compartidos
  lib/
    tipos.ts         el contrato de la API
    datos.ts         saneado de lo que llega del servidor
    lectura.ts       la lectura del build, que se niega a publicar datos malos
    publicos.ts      lo que se publica en /datos/ y lo que lleva el HTML
    supabase-publico.ts  la URL de Supabase y la clave pública, una sola copia
    filtros.ts       filtrado, recuento por faceta, orden y estado en la URL
    formato.ts       fechas en español, urgencia, traducción de niveles
    localizacion.ts  resuelve el sitio de cada plaza contra el catálogo del servidor
    cercania.ts      tu municipio de referencia y la distancia hasta cada plaza
    oficios.ts       puentes entre el español que se teclea y el catalán del anuncio
  layouts/Base.astro
  pages/
    index.astro      la portada
    suscripciones.astro  «Mis búsquedas»
    404.astro
    datos/           los JSON estáticos que lee la isla
```

## Los datos

### El ciclo de cada día

Todo pasa de madrugada y en este orden (UTC):

| Hora | Qué | Dónde |
|---|---|---|
| 04:00 | `convoca-board?refresh=1` rasca las fuentes y guarda la copia | pg_cron → Edge Function |
| 04:20 | `convoca-correo` manda los avisos con lo de hoy | pg_cron → Edge Function |
| 04:40 | El deploy hook de Vercel reconstruye la web con la copia nueva | pg_cron → Vercel |
| 06:00 | Se comprueba que lo publicado es de hoy (`generado` < 12 h) | GitHub Actions (`frescura.yml`) |

Los tres trabajos de pg_cron están en `supabase/migraciones/2026-10-08-cron.sql`.
Los dos secretos que usan (`deploy_hook` y `correo_token`) viven en **Supabase
Vault**, no en el texto del cron ni en este repositorio.

### La Edge Function

```
https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board
```

Pública y con `Access-Control-Allow-Origin: *`. Devuelve `abiertas`,
`pendientes`, `cerradas`, `sitios`, `resumen`, `errores` y la fecha de cálculo.
**Solo rasca las fuentes con `?refresh=1`**, que es lo que hace el cron; sin
él sirve siempre la última copia guardada (`cache: "hit"` si es de hoy y
reciente, `"stale"` si no). Así una visita nunca dispara una pasada contra las
fuentes.

El código vive en `supabase/functions/` y se despliega con el CLI:

```bash
npx supabase functions deploy convoca-board --project-ref tytcebxazuprhzyzntyy --no-verify-jwt --use-api
```

`verify_jwt = false` está fijado en `supabase/config.toml` para las dos
funciones: el CLI lo pone a `true` si no se dice nada, y eso dejaría la web y
el cron del correo fuera. **Nunca `--prune`**: borraría funciones que no están
en el repositorio.

`convoca-correo` compone los avisos y los manda por Resend. Necesita dos
secretos de la función: `RESEND_API_KEY` (la **misma** clave va en
Authentication → SMTP, que manda los enlaces de acceso) y `CORREO_TOKEN`, que
protege la función y tiene el mismo valor que `correo_token` en Vault.
Mientras no haya dominio propio, el remitente es `onboarding@resend.dev`, que
solo entrega al titular de la cuenta.

### El build

La web es estática. El build lee la función una sola vez
(`leeTableroEstricto()` en `src/lib/lectura.ts`) y **falla**, dejando servida
la versión anterior, si:

- la API no contesta o no devuelve un tablero;
- llegan 0 abiertas;
- las abiertas bajan más de un 30 % frente al último build publicado (lo lee
  de `/datos/meta.json` en la web en vivo);
- falla CIDO o su callejero;
- los datos tienen más de 26 h.

Si una bajada es real y está comprobada en las fuentes, se construye una vez
con `PERMITIR_BAJADA=1`.

Con lo leído escribe ficheros estáticos que sirve la CDN, cada uno con la
atribución que pide la licencia:

| Fichero | Qué |
|---|---|
| `/datos/abiertas.json`, `pendientes.json`, `cerradas.json` | Las tres listas, sin los campos que el navegador no usa |
| `/datos/sitios.json` | El callejero entero |
| `/datos/meta.json` | `generado`, recuentos, resumen, errores y commit |

El HTML de la portada solo lleva el resumen, las 24 primeras abiertas y lo
mínimo para el calendario. La isla pide las abiertas cuando el navegador queda
libre o al primer gesto en los filtros, y pendientes y cerradas al abrir su
pestaña. Al volver a una pestaña abierta hace rato mira `meta.json` y solo
recarga si hay datos nuevos.

También hace una lectura mínima con la clave pública (la fecha de la copia,
`2026-10-08-latido-anon.sql`) para que el proyecto gratuito de Supabase no se
pause por falta de actividad.

| Variable | Para qué |
|---|---|
| `DATOS=fixture` | Construir con `pruebas/fixtures/tablero.json`, sin red. Es lo que hace la CI |
| `CONVOCA_API` | Leer de otra URL |
| `PERMITIR_BAJADA=1` | Dejar pasar un build con una bajada comprobada |

**De dónde sale cada convocatoria.** Siete consultas a CIDO —ayuntamientos de
Barcelona, Girona, Lleida y Tarragona, consejos comarcales, Generalitat y
diputaciones—, datos abiertos de la Diputació de Barcelona con licencia
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es). Se quedan
fuera a propósito «Altres entitats públiques» (hospitales, universidades y
centros de investigación) y los cuerpos de la Administración del Estado. La
función lee también los portales Convoca de Badalona, El Masnou y Santa
Coloma, pero sus plazas no se publican mientras se revisa esa fuente.

### Lo que llega no siempre está limpio

Dos cosas se corrigen aquí porque en el origen no tienen arreglo:

- **Campos que faltan.** En las convocatorias antiguas la API omite `empleador`,
  `enlace` o `nivelCodigo` en vez de mandarlos a `null`. `saneaTablero()` en
  `datos.ts` pone la respuesta en regla al entrar, así que el resto del código
  puede fiarse del contrato de `tipos.ts`.
- **El lugar.** CIDO enlaza cada oposición con una institución que trae
  `municipi`, `comarca` y coordenadas, y se pide en la misma llamada con
  `?include=institucio`: de ahí sale el 100 % de las sedes. El lugar de trabajo
  es otra cosa y solo se sabe cuando el anuncio lo dice, así que se saca del
  paréntesis o de la cola del título y **se comprueba contra el callejero** —los
  989 municipios catalanes y sus 43 comarcas, cacheados en `convoca_snapshot`—.
  Por eso ya no se cuelan códigos como "TEI" o "SIAD" haciéndose pasar por
  pueblos: si no está en el callejero, no es un sitio.

  `donde.origen` dice de cuál de los dos casos se trata. Cuando el anuncio calla
  —140 bolsas que cubren varios centros a la vez— la web enseña el municipio del
  organismo **con un asterisco**, nunca disfrazado de destino.
- **El idioma.** El origen traduce casi todo menos los títulos, la titulación y
  los avisos de plazo. Los títulos se dejan en catalán y se marcan con
  `lang="ca"`; los avisos de plazo sí se traducen (`enEspanol()` en
  `formato.ts`), porque son la frase que dice si la fecha es firme. Y el
  buscador abre cada palabra tecleada en sus formas catalanas, que si no
  «técnico» no encontraba ninguna de las doscientas cincuenta plazas de
  *tècnic*.

## Desarrollo

```bash
npm ci
npm run dev                     # http://localhost:4321 (y /vista-previa-correo.html)
npm run check                   # tipos de Astro, React, TypeScript y las funciones
npm run test                    # las pruebas (vitest)
DATOS=fixture npm run build     # genera dist/ sin salir a la red
npm run build                   # genera dist/ con los datos en vivo
```

La vista previa del correo solo existe con `npm run dev`; en producción no se
genera.

### Qué se prueba

Las pruebas viven junto al módulo que comprueban (`src/lib/*.test.ts`) y sus
fábricas de datos en `src/lib/pruebas.ts`, porque una `Plaza` tiene veintiséis
campos y escribirlos todos en cada caso esconde lo que cada prueba mira.

Cubren la lógica pura, que es la que se rompe en silencio:

| Fichero | Lo que sostiene |
|---|---|
| `oficios` | El puente español→catalán del buscador, regla a regla |
| `filtros` | Filtrado, recuento por faceta, orden y la ida y vuelta de la URL |
| `formato` | Fechas en local (no UTC), urgencia por tramos |
| `cercania` | Distancias, y que una coordenada imposible no se convierta en una falsa |
| `localizacion` | Qué sitio se enseña, el asterisco de sede y los identificadores |
| `datos` | El saneado de lo que llega del servidor |
| `lectura` | Cuándo el build se niega a publicar, y que lee una sola vez |
| `publicos` | Lo que va en `/datos/` y en el HTML: cuentas, primeras 24, sitios, calendario |
| `cuenta` | Que entrar en «Mis búsquedas» no cree una suscripción que nadie pidió |

Y en `pruebas/`, lo que no vive junto a su módulo:

| Fichero | Lo que sostiene |
|---|---|
| `servidor` | La función de Supabase: coordenadas, identificadores, el lugar que se saca del título, el filtro de policía, fechas y grupos |
| `snapshot` | Que una visita sin `refresh` sirva la copia y no rasque las fuentes |
| `contrato-identificadores` | Que el servidor y la web fabriquen **el mismo** identificador de municipio |

Ese contrato merece explicación. El identificador de un sitio se calcula dos
veces, una en Deno y otra en el navegador, y el código lo advierte: «COPIA
LITERAL […] y tiene que seguir siéndolo». De ahí salen los `?donde=` que la
gente guarda en marcadores, así que si las dos copias divergen los enlaces
dejan de filtrar **sin dar ningún error**: la página carga, el menú va, y
simplemente no sale lo que se quería enseñar. La prueba compara las dos
implementaciones sobre cuarenta topónimos reales elegidos por difíciles
—apóstrofes, guiones interiores, artículos, dos pueblos unidos por «i»— y
falla en cuanto se separan.

La función de Supabase se prueba importándola tal cual, sin copiarla ni
trocearla: `vitest.config.ts` resuelve su import de `jsr:` a un módulo vacío y
`pruebas/entorno-deno.ts` finge las tres cosas del global `Deno` que toca al
cargarse. Lo que se prueba es exactamente lo que se despliega. Y con
`pruebas/deno.d.ts` entra además en `npm run check`, del que estuvo excluida
desde el principio.

No se prueban los componentes: lo que hacen es pintar, y eso se mira en el
navegador. Lo que estas pruebas evitan es que un retoque en una regla del
buscador o en el formato de la URL deje de encontrar cosas sin que se note.

### Integración continua

`.github/workflows/comprobaciones.yml` ejecuta `check`, `test` y `build` en
cada push y cada pull request, con Node 24, que es el que usa Vercel. El build
de la CI usa el fixture: comprueba el código, no los datos del día.

`.github/workflows/frescura.yml` mira cada mañana que lo publicado sea de hoy.
GitHub desactiva los workflows programados de un repositorio público tras 60
días sin actividad; si pasa, se reactiva desde la pestaña Actions.

## Despliegue

Vercel construye `master` en cada push (`npm run build` → `dist`, Node 24) y
cada mañana con el deploy hook. El dominio está escrito una sola vez, en
`supabase/functions/_shared/sitio.ts`, salvo en `frescura.yml`, que es YAML.

Lo que queda por hacer, y en qué orden, está en `docs/hoja-de-ruta.md`.
