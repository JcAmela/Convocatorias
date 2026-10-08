/**
 * Dónde está Supabase y la clave pública. Una sola copia para el cliente de
 * la cuenta, la API del tablero y la lectura del build.
 *
 * La clave es la pública: está pensada para viajar en el navegador y no abre
 * nada por sí sola. Lo que protege los datos son las políticas de cada tabla,
 * no esconder la clave.
 */
export const URL_SUPABASE = 'https://tytcebxazuprhzyzntyy.supabase.co';
export const CLAVE_PUBLICA = 'sb_publishable_FlAUQhKdvYCe2iAFu8oa7g_R2YQcL5a';
