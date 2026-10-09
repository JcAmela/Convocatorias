-- LÍNEA BASE: ya aplicada, no ejecutar.
--
-- Las dos tablas del tablero tal como están en producción el 8 de octubre de
-- 2026. Se crearon a mano el 23 de agosto (migración `create_convoca_board_tables`
-- del historial de Supabase) y nunca tuvieron copia en el repositorio, así que
-- quien quisiera rehacer la base no sabía qué forma tenían. Esto es esa forma,
-- sacada de `pg_catalog`, sin datos.
--
-- Se escribe con `if not exists` para que, si alguien la ejecuta por error,
-- no rompa nada; pero no se vuelve a aplicar en producción. Lo que vino
-- después está en sus propias migraciones (`2026-10-08-latido-anon.sql`
-- añade la política y los permisos de `anon` sobre `convoca_snapshot`).

-- Archivo del portal: toda plaza vista alguna vez. `item` es la plaza entera
-- tal como la sirve la API; las otras columnas son lo que hace falta para
-- buscar sin abrir el JSON.
create table if not exists public.convoca_board_items (
  item_id    text        not null primary key,
  item       jsonb       not null,
  apply_end  date,
  employer   text,
  kind       text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index if not exists convoca_board_items_apply_end_idx on public.convoca_board_items (apply_end);
alter table public.convoca_board_items enable row level security;
comment on table public.convoca_board_items is
  'Archivo del portal: toda plaza vista alguna vez. last_seen indica si sigue publicada en origen; apply_end permite separar abiertas de cerradas.';

-- Una sola fila (id = 1) con la respuesta ya calculada de convoca-board.
create table if not exists public.convoca_snapshot (
  id         integer     not null default 1 primary key,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint convoca_snapshot_single_row check (id = 1)
);
alter table public.convoca_snapshot enable row level security;
comment on table public.convoca_snapshot is
  'Única fila con la respuesta ya calculada del portal. Se regenera cuando caduca o cuando la rutina diaria llama con ?refresh=1.';
