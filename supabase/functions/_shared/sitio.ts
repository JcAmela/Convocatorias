/**
 * Dónde se sirve la web. Una sola copia para Astro (`site`), los enlaces de
 * los correos, la vista previa del correo y el build, que lee de aquí el
 * `meta.json` publicado para comparar.
 *
 * Al cambiar de dominio se toca aquí y en `.github/workflows/frescura.yml`,
 * que es YAML y no puede importarlo.
 */
export const SITIO = "https://convocatorias-ten.vercel.app";
