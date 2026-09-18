-- Aplicada el 2026-09-18. Copia en el repositorio de lo que hay en la base:
-- el esquema vivía solo en Supabase, igual que le pasaba a la función.
--
-- Una suscripción es una búsqueda guardada de la web más un correo. Los
-- filtros se guardan tal cual salen de la URL del tablero
-- (?estudios=C2,AP&donde=comarca-barcelones&desde=badalona&cerca=1): no hace
-- falta inventar un lenguaje de filtros, el usuario pone los que ya existen y
-- lo que reciba por correo será exactamente lo que vio en pantalla.

create table if not exists public.convoca_suscripciones (
  id uuid primary key default gen_random_uuid(),

  -- La cuenta. El correo NO se copia aquí: vive en auth.users y se lee al
  -- enviar. Cuantos menos datos personales duplicados, menos que proteger y
  -- menos que borrar el día que alguien lo pida.
  usuario_id uuid not null references auth.users(id) on delete cascade,

  nombre text not null default 'Mi búsqueda',
  filtros text not null default '',

  plan text not null default 'gratis'
    check (plan in ('gratis', 'estandar', 'premium')),
  -- Se deriva del plan, pero se guarda aparte: así se puede regalar una
  -- cadencia mejor sin tocar el plan.
  cadencia text not null default 'mensual'
    check (cadencia in ('diaria', 'semanal', 'mensual')),

  activa boolean not null default true,
  -- Hasta que no hay fecha aquí no se envía nada: es la doble confirmación.
  confirmada_en timestamptz,
  -- Para gestionar o darse de baja desde el propio correo, sin iniciar sesión.
  token uuid not null default gen_random_uuid(),

  -- Desde cuándo se buscan novedades. Se compara con
  -- convoca_board_items.first_seen, que conserva la primera vez que se vio
  -- cada convocatoria.
  ultimo_envio_en timestamptz,
  creada_en timestamptz not null default now()
);

create unique index if not exists convoca_suscripciones_token_idx
  on public.convoca_suscripciones (token);
create index if not exists convoca_suscripciones_usuario_idx
  on public.convoca_suscripciones (usuario_id);
create index if not exists convoca_suscripciones_envio_idx
  on public.convoca_suscripciones (cadencia, activa)
  where activa and confirmada_en is not null;

alter table public.convoca_suscripciones enable row level security;

-- Cada uno ve y toca solo las suyas. La función de envío usa la clave de
-- servicio, que se salta RLS, así que no necesita política propia.
create policy "cada uno ve las suyas"    on public.convoca_suscripciones for select using (auth.uid() = usuario_id);
create policy "cada uno crea las suyas"  on public.convoca_suscripciones for insert with check (auth.uid() = usuario_id);
create policy "cada uno edita las suyas" on public.convoca_suscripciones for update using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "cada uno borra las suyas" on public.convoca_suscripciones for delete using (auth.uid() = usuario_id);

-- La rutina diaria que refresca el tablero, creada el mismo día. Sin ella la
-- base solo se actualizaba cuando alguien entraba en la web.
--   select cron.schedule('convoca-board-diario', '0 4 * * *',
--     $$ select net.http_get(
--          url := 'https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board?refresh=1',
--          timeout_milliseconds := 120000) $$);
