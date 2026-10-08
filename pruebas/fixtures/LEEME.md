# Fixture del tablero

`tablero.json` es lo que construye la CI (`DATOS=fixture npm run build`) y lo
que usarán las pruebas visuales: una muestra fija para que el resultado no
dependa de lo que se publique ese día.

**Fuente:** CIDO – Diputació de Barcelona, datos abiertos con licencia
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es). Muestra
extraída el 8 de octubre de 2026 de la API
`api.diba.cat/dadesobertes/cido/v1/oposicions`. Los registros no se han
modificado; solo se ha elegido cuáles entran.

Las cuatro plazas con id `00000000-0000-4000-8000-…` son **inventadas**: cubren
los casos de los portales Convoca sin reproducir ningún dato de esos portales.

Se rehace con:

```bash
node pruebas/fixtures/genera.mjs ruta/a/la/copia.json
```
