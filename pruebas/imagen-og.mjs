// La imagen que sale al compartir un enlace (og:image): 1200×630, con la
// marca y lo que es la web. Se genera una vez y se guarda en public/og.png.
//
//   node pruebas/imagen-og.mjs

import { chromium } from '@playwright/test';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #f3f2ec; color: #16181a;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex; flex-direction: column; justify-content: center; padding: 0 96px; }
  .marca { display: flex; align-items: center; gap: 32px; }
  .icono { width: 120px; height: 120px; border-radius: 28px; background: #fbfaf7;
    border: 2px solid #dddbcf; display: grid; place-items: center; }
  h1 { font-size: 96px; font-weight: 700; letter-spacing: -0.02em; }
  p { margin-top: 36px; font-size: 44px; line-height: 1.25; color: #4a504e; max-width: 26ch; }
  small { position: absolute; left: 96px; bottom: 56px; font-size: 26px; color: #656c69; }
</style></head><body>
  <div class="marca">
    <div class="icono"><svg viewBox="0 0 24 24" width="76" height="76">
      <rect x="3" y="4" width="18" height="4" rx="1.4" fill="#12705e"/>
      <rect x="3" y="11" width="11" height="3" rx="1.4" fill="#8a5a02"/>
      <rect x="3" y="17" width="15" height="3" rx="1.4" fill="#656c69"/>
    </svg></div>
    <h1>Convocatorias</h1>
  </div>
  <p>Empleo público en Cataluña, con el plazo abierto</p>
  <small>Web independiente, no oficial · Datos de CIDO, Diputació de Barcelona</small>
</body></html>`;

const navegador = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
await pagina.setContent(html);
await pagina.screenshot({ path: 'public/og.png' });
await navegador.close();
console.log('public/og.png');
