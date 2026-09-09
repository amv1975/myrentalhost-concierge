-- Marcar un compromiso como importante para que se quede arriba.
--
-- La app ya ordena por fecha, que es lo correcto casi siempre. Pero hay cosas
-- que importan por encima de cuándo caen, y sin esto la única forma de que no
-- se pierdan de vista era dejarlas sin revisar.

alter table items
  add column if not exists pinned boolean not null default false;

-- Los fijados se consultan por espacio y salen primero en todas las listas.
create index if not exists items_pinned_idx on items (space_id, pinned)
  where pinned;
