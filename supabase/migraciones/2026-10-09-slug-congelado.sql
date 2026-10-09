-- La parte legible de la URL de cada ficha, congelada la primera vez.
--
-- Las fichas serán `/convocatoria/<slug>-<id>/`. El slug sale del título
-- (`supabase/functions/_shared/slug.ts`), y si se recalculara en cada build,
-- una corrección del título en el origen cambiaría la URL que Google ya
-- conoce. En una web estática esa URL vieja no se puede redirigir más que con
-- una lista de reglas limitada, así que el slug se guarda y no se toca.
--
-- convoca-board manda el slug calculado en cada pasada; el trigger conserva
-- el que ya hubiera. Las filas viejas sin slug lo reciben la próxima vez que
-- se vean; las cerradas que ya no se verán lo calculan al leerse, y como su
-- título ya no cambia, da siempre lo mismo.

alter table public.convoca_board_items add column if not exists slug text;

create or replace function public.congela_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.slug is not null then
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

revoke execute on function public.congela_slug() from public, anon, authenticated;

drop trigger if exists congela_slug on public.convoca_board_items;
create trigger congela_slug
  before update on public.convoca_board_items
  for each row execute function public.congela_slug();
