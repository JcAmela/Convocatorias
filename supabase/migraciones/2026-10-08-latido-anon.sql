-- Una fila que la clave pública pueda leer, para que la base tenga actividad.
--
-- El plan gratuito pausa el proyecto si en una semana no ve actividad de
-- usuarios. Hasta ahora la generaba el navegador, que llama a la función en
-- cada visita; en cuanto la web lea los datos de ficheros estáticos dejará de
-- hacerlo. El build diario hace entonces una lectura con la clave pública, y
-- para eso hace falta algo que esa clave pueda leer: hoy ninguna tabla le
-- devuelve una sola fila.
--
-- Se abre lo mínimo: la fecha de la copia del tablero y nada más. La columna
-- `data` (la copia entera, 2 MB) se queda fuera para que nadie pueda bajársela
-- en bucle por PostgREST a cuenta del egress.
--
--   GET /rest/v1/convoca_snapshot?select=id,updated_at   → 200, una fila
--   GET /rest/v1/convoca_snapshot?select=data            → 401, sin permiso

revoke select on public.convoca_snapshot from anon;
grant select (id, updated_at) on public.convoca_snapshot to anon;

drop policy if exists "anon ve la fecha de la copia" on public.convoca_snapshot;
create policy "anon ve la fecha de la copia" on public.convoca_snapshot
  for select to anon
  using (id = 1);
