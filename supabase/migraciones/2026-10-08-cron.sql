-- Las tres rutinas diarias, ya sin secretos en el texto del comando.
--
-- pg_cron guarda cada comando como texto en `cron.job`, y hasta hoy el token
-- de `convoca-correo` iba ahí en claro. Ahora los dos secretos viven en
-- Supabase Vault y el comando solo dice dónde buscarlos:
--   - `correo_token`: el `x-token` de convoca-correo. La función tiene el
--     mismo valor como secreto `CORREO_TOKEN`.
--   - `board_token`: el `x-token` que deja a convoca-board rascar con
--     `refresh=1`. La función tiene el mismo valor como `REFRESH_TOKEN`.
--   - `deploy_hook`: la URL del deploy hook de Vercel (rama master).
-- Ninguno de los dos valores está en este repositorio.
--
-- `cron.schedule` con un nombre que ya existe sustituye el trabajo, así que
-- este fichero se puede volver a aplicar y deja siempre lo mismo.
--
-- Horario (UTC):
--   04:00  convoca-board con refresh=1: rasca las fuentes y guarda la copia.
--   04:20  convoca-correo: manda los avisos con lo de hoy.
--   04:40  rebuild de la web: el build lee la copia de las 04:00 y publica.

select cron.schedule('convoca-board-diario', '0 4 * * *', $$
  select net.http_get(
    url := 'https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board?refresh=1',
    headers := jsonb_build_object(
      'x-token', (select decrypted_secret from vault.decrypted_secrets where name = 'board_token')),
    timeout_milliseconds := 120000)
$$);

select cron.schedule('convoca-correo-diario', '20 4 * * *', $$
  select net.http_post(
    url := 'https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-correo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-token', (select decrypted_secret from vault.decrypted_secrets where name = 'correo_token')),
    body := jsonb_build_object('tanda', true),
    timeout_milliseconds := 180000)
$$);

select cron.schedule('rebuild-diario', '40 4 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deploy_hook'),
    timeout_milliseconds := 30000)
$$);
