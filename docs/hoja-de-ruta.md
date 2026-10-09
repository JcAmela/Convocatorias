# Hoja de ruta

Lo que queda por hacer, en orden. Se marca cada casilla al desplegarla y
comprobarla. Una sesión nueva sigue por la primera sin marcar.

## F0. Arreglos urgentes y red de seguridad

Objetivo: datos frescos cada día, el consumo de Supabase a salvo y ningún
build que publique la web vacía, incompleta o vieja.

- [x] `convoca-board` deja de rascar las fuentes cuando entra una visita:
      sin `?refresh=1` sirve siempre la última copia (`cache: "stale"` si es
      vieja). `verify_jwt` fijado en `supabase/config.toml`.
- [x] Build estricto: falla si la API no contesta, si llegan 0 abiertas, si
      bajan más de un 30 % frente al último build publicado, si falla CIDO o
      si los datos tienen más de 26 h. Variables `CONVOCA_API` y
      `DATOS=fixture`; la CI construye con el fixture.
- [x] Rebuild diario con un deploy hook disparado por pg_cron a las
      04:40 UTC, secretos en Vault, cron versionados y un workflow de GitHub
      que avisa si los datos publicados tienen más de 12 h.
- [x] JSON estático en `/datos/` servido desde la CDN; la portada deja de
      llamar a la Edge Function y pesa 40 KB gzip o menos (18 KB).
- [x] `refresh=1` solo con el token del cron, guardado en Vault.
- [x] Alta de avisos: no se crea ninguna suscripción que nadie haya pedido.
- [x] Higiene: `noindex` en `/suscripciones`, vista previa del correo solo en
      desarrollo, página 404, constante `SITIO` única, atribución CC BY con
      fecha en el pie y README al día.
- [x] Infraestructura reproducible: migración de línea base de las tablas del
      tablero y repositorio privado de copias semanales.
- [ ] Copias: falta el secreto de conexión en el repositorio privado.
- [ ] El workflow de frescura sale en verde dos días seguidos.

## F1. Decisiones que fijan las URL

- [x] Revisar qué aporta cada fuente de datos: los portales Convoca no
      aportaban nada que no estuviera en CIDO y se han quitado.
- [x] Identificadores definitivos para cada convocatoria: `cido-<id>`, el
      mismo número que la ficha oficial de CIDO.
- [x] Rutas: `/convocatoria/<slug>-<id>/`, `/municipio/<id>/`,
      `/comarca/<nombre>/`, `/estudios/<nivel>/`, `/tipo/<clase>/`,
      `/sin-titulacion/` (`src/lib/rutas.ts`). El slug se congela la primera
      vez que se ve la plaza.
- [ ] Elegir y comprar el dominio.

## F2. Cimientos del diseño y tarjeta

- [x] Línea base de rendimiento y capturas (`docs/linea-base.md`).
- [ ] Sin webfonts, tipografía del sistema, tokens nuevos y test de contraste.
- [ ] Tarjeta nueva.

## F3. Páginas para Google

- [ ] Ficha estática por convocatoria, sin islas, con migas de pan.
- [ ] JobPosting solo en las abiertas con fecha, lugar y descripción fiables.
- [ ] Páginas de municipio, comarca, estudios, tipo y sin titulación.
- [ ] SEO técnico: canonical, og:image, sitemap, `noindex` mientras no haya
      dominio.
- [ ] Página «Plazo cerrado» y caducidad de las cerradas.

## F4. Dominio, Cloudflare Pages y Search Console

- [ ] Hosting en Cloudflare Pages, 301 desde las direcciones antiguas.
- [ ] Quitar el `noindex`, enviar el sitemap.
- [ ] JobPosting por fases y aviso a la Indexing API.
- [ ] Analítica sin cookies.

## F5. Rediseño interactivo y rendimiento

- [ ] Ficha como hoja inferior con URL propia y Atrás que la cierra.
- [ ] Tablero móvil, raíl de filtros en escritorio, tabla desde 1024 px.

## F6. Avisos por correo abiertos al público

- [ ] Aviso legal, privacidad y cookies.
- [ ] Baja en un clic sin iniciar sesión.
- [ ] Revisión de permisos y de envío; CAPTCHA.
- [ ] Dominio de envío verificado.

## F7. Cobertura, contenido útil y versión bilingüe

- [ ] Fuentes de datos nuevas.
- [ ] Guías y glosario.
- [ ] Versión `/ca/` en las páginas que aporten.

## F8. Difusión

- [ ] RSS por comarca, bot de Telegram, resumen semanal y widget para webs
      aliadas.

## F9. Monetización

- [ ] Donaciones, afiliación marcada como publicidad, anuncios con CMP y
      acuerdos con entidades. Nunca vender datos.
