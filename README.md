# Convocatorias

Tablero de plazas de empleo público en el área de Barcelona: los ayuntamientos
con sede a menos de 25 km de Barcelona, Badalona o el Maresme sur —Barcelonès,
Baix Llobregat, Maresme y los dos Vallès— más las convocatorias de la
Generalitat de Catalunya y de la Diputació de Barcelona.

No incluye plazas de policía, guardia urbana ni mossos.

## Qué hace

- **Las tres listas** que devuelve la API: con plazo abierto, anunciadas sin plazo
  todavía, y ya cerradas. Más una cuarta pestaña con las que guardas tú.
- **Gráfico de cierres**: cuántas convocatorias vencen cada uno de los próximos
  45 días. Se pulsa un día y la lista se queda solo con ese.
- **Filtros** por estudios, tipo de plaza, quién convoca, dónde se trabaja,
  tiempo que queda y cercanía, todos con el número de plazas que quedarían al
  marcarlos.
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
    datos.ts         lectura en build, saneado de la respuesta y caída elegante
    filtros.ts       filtrado, recuento por faceta, orden y estado en la URL
    formato.ts       fechas en español, urgencia, traducción de niveles
    lugar.ts         limpia los lugares de trabajo y arma el catálogo de municipios
    oficios.ts       puentes entre el español que se teclea y el catalán del anuncio
  layouts/Base.astro
  pages/index.astro
```

## Los datos

```
https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board
```

Edge Function de Supabase, pública, sin autenticación y con
`Access-Control-Allow-Origin: *`. Devuelve `abiertas`, `pendientes`, `cerradas`,
`resumen`, `errores` y la fecha de cálculo. Salen del portal CIDO de la Diputació
de Barcelona y de los portales Convoca de Badalona, El Masnou y Santa Coloma.

**Se leen dos veces, a propósito.** Una en el build, para que la primera pintada
ya lleve plazas de verdad en el HTML (bueno para el buscador de Google y para
quien entra con mala conexión). Y otra en el navegador al montar la isla, que
sustituye lo anterior por lo de hoy. Por eso un despliegue de hace un mes sigue
enseñando datos frescos.

Si la API no contesta durante el build, el build **no falla**: se genera con las
listas vacías y el navegador las rellena.

Para cambiar de endpoint, toca `API` en `src/lib/datos.ts`.

El código de esa función vive en `supabase/functions/convoca-board/index.ts`.
Estaba solo en Supabase, sin control de versiones; está aquí para poder leerlo
y revisarlo con el resto. Se despliega con `supabase functions deploy
convoca-board`.

**De dónde sale cada convocatoria.** Tres consultas a CIDO (municipal,
autonómica y diputaciones) y los portales Convoca de Badalona, El Masnou y
Santa Coloma. Las tres de CIDO usan el mismo criterio de área: la sede del
organismo a menos de 25 km de alguno de los ocho pueblos de `TOWNS`. Antes no
era así —la Generalitat entraba por radio y los ayuntamientos por una lista
cerrada de ocho nombres— y el resultado era un tablero con 367 plazas de la
Generalitat y 9 de ayuntamientos.

### Lo que llega no siempre está limpio

Dos cosas se corrigen aquí porque en el origen no tienen arreglo:

- **Campos que faltan.** En las convocatorias antiguas la API omite `empleador`,
  `enlace` o `nivelCodigo` en vez de mandarlos a `null`. `saneaTablero()` en
  `datos.ts` pone la respuesta en regla al entrar, así que el resto del código
  puede fiarse del contrato de `tipos.ts`.
- **El lugar de trabajo.** El origen lo saca del último paréntesis del título,
  así que a veces no hay ("…als Serveis Territorials a Girona"), a veces es un
  código interno ("(NAJ)", "(BST - Girona)") y a veces trae la errata de quien
  tecleó el anuncio ("Barccelona", "LLeida"). `lugar.ts` lo rescata del título,
  tira lo que no es un topónimo y funde las grafías raras con la buena
  comparándolas entre sí, sin ninguna lista de municipios que mantener.
- **El idioma.** El origen traduce casi todo menos los títulos, la titulación y
  los avisos de plazo. Los títulos se dejan en catalán y se marcan con
  `lang="ca"`; los avisos de plazo sí se traducen (`enEspanol()` en
  `formato.ts`), porque son la frase que dice si la fecha es firme. Y el
  buscador abre cada palabra tecleada en sus formas catalanas, que si no
  «técnico» no encontraba ninguna de las doscientas cincuenta plazas de
  *tècnic*.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:4321
npm run check    # tipos de Astro, React y TypeScript
npm run build    # genera dist/
```

## Despliegue

Sitio estático, sin variables de entorno. En Vercel se importa el repositorio y
se deja lo que detecta solo (`npm run build` → `dist`).

El HTML lleva incrustada la foto del día del build. Como el navegador revalida,
no hace falta reconstruir a diario; si aun así lo quieres, crea un Deploy Hook en
Vercel y llámalo desde un cron.
