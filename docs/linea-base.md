# Línea base de rendimiento

La medida contra la que se compara cada cambio de diseño (F2 y F5). Tomada el
9 de octubre de 2026 sobre el commit `2743514`, el diseño anterior al
rediseño, con el fixture (`pruebas/fixtures/tablero.json`).

## Cómo se mide

```bash
DATOS=fixture npm run build
npm run preview -- --port 4322          # en otra terminal
node pruebas/medir.mjs http://localhost:4322/ 5 docs/linea-base
```

- **LCP y TBT**: Lighthouse en móvil (`--preset=perf --form-factor=mobile`,
  con su estrangulamiento simulado), 5 pasadas y la mediana.
- **CLS**: Playwright con un móvil de 375×812, desde que carga la página
  hasta 6 s después, con la carga de `/datos/abiertas.json` incluida. 5
  pasadas y la mediana. Es el único método válido para el CLS: Lighthouse no
  ve lo que la isla pide después de cargar.
- **Capturas**: 375×812 y 1280×800, en claro y en oscuro, con la hora fijada
  (`docs/linea-base/*.png`).

Las cifras de cada pasada están en `docs/linea-base/medidas.json`.

## Resultado

| Métrica | Mediana | Pasadas |
|---|---|---|
| Rendimiento (Lighthouse, móvil) | 82 | 94, 72, 73, 98, 82 |
| LCP | 1.898 ms | 1.641 – 2.288 ms |
| TBT | 662 ms | 130 – 1.372 ms |
| FCP | 1.781 ms | — |
| CLS (con la carga diferida) | 0 | 0 en las 5 |

## Cómo leerlo

- **El TBT varía mucho entre pasadas** (de 130 a 1.372 ms): Lighthouse simula
  un móvil lento sobre un ordenador que hace otras cosas. Con 5 pasadas, un
  ±5 % de diferencia está dentro del ruido. Para decidir si un cambio empeora
  algo, mide con 9 pasadas antes y después en la misma sesión.
- **CLS 0**: desde F0 la portada no revalida al cargar, así que la píldora de
  la hora ya no salta. El rediseño no puede subirlo.
- **Primera pantalla en el móvil**: a 375×812 no se ve ninguna tarjeta
  (cabecera, pestañas, buscador, seis filtros, cuatro cifras y el
  calendario). F5 quiere la primera tarjeta en y ≤ 260.
- Las tres webfonts de Google bloqueaban el pintado: F2 las quitó.

## Después de F2 (letra del sistema y tarjeta nueva)

Medido el 9 de octubre de 2026 con `pruebas/comparar.mjs`: el build de la
línea base (`799e089`) y el de F2, servidos a la vez y medidos intercalados,
9 pasadas cada uno.

| Métrica | Antes | Después | Diferencia |
|---|---|---|---|
| LCP | 1.859 ms | 1.704 ms | −8 % |
| TBT | 755 ms | 516 ms | −32 % |
| FCP | 1.768 ms | 1.536 ms | −13 % |
| CLS | 0 | 0 | — |

Medir las dos versiones intercaladas es lo que vale a partir de ahora: dos
tandas seguidas de la misma versión, medidas por separado, dieron un FCP de
1.655 y de 2.063 ms. Intercaladas, la misma versión contra sí misma difiere
un 1 %.

```bash
git worktree add ../antes <commit>          # y allí: DATOS=fixture npx astro build
ASTRO_PREVIEW_BACKGROUND=1 npx astro preview --port 4330 --ignore-lock   # en ../antes
ASTRO_PREVIEW_BACKGROUND=1 npx astro preview --port 4331 --ignore-lock   # aquí, tras el build
node pruebas/comparar.mjs http://localhost:4330/ http://localhost:4331/ 9
```

`ASTRO_PREVIEW_BACKGROUND` impide que `astro preview` se vaya a segundo plano
cuando lo lanza un agente de IA, y `--ignore-lock` deja abrir dos a la vez.
