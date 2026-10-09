-- La copia ya no se regenera «cuando caduca»: desde el 8 de octubre solo la
-- rehace la rutina de las 04:00 con ?refresh=1 (ver convoca-board).
comment on table public.convoca_snapshot is
  'Única fila con la respuesta ya calculada del portal. Solo la regenera la rutina diaria (convoca-board?refresh=1, 04:00 UTC); las visitas sirven esta copia aunque sea vieja.';
