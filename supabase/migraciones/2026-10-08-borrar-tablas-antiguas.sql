-- Las tablas del primer sistema de avisos, el de WhatsApp, que nadie lee ya.
--
-- Las escribían las funciones `convoca-sync` (calls, bags y publications, la
-- última vez el 17 de julio) y `convoca-proxy` (notified), borradas el mismo
-- día que estas tablas. Ninguna vista, función, clave foránea, trigger ni
-- cron las usaba. `convoca_publications` guardaba además el nombre de quien
-- subía cada anuncio al portal municipal: un dato personal que esta web no
-- necesita para nada.
--
-- Destructiva y aplicada el 8 de octubre de 2026, con el «sí» del titular.

drop table if exists public.convoca_calls;
drop table if exists public.convoca_bags;
drop table if exists public.convoca_publications;
drop table if exists public.convoca_notified;
