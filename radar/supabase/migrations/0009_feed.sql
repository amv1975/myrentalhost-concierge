-- El Feed: los boletines que sí quiere leer.
--
-- Son pocos y son ruido para el parte —no tienen plazo, nadie espera
-- respuesta, no se rompe nada si no se abren—, así que el filtro hace bien en
-- tirarlos. Pero la información sirve, y hoy se pierde.
--
-- No hay categoría nueva ni cambio en el filtro: sus correos ya están
-- descargados, entre los descartados. Lo único que hace falta es saber de
-- quién seguir el rastro, y guardar la síntesis para poder releerla sin
-- volver a pagarla.

create table if not exists feeds (
  id         uuid primary key default gen_random_uuid(),
  from_email text not null unique,
  name       text,
  created_at timestamptz not null default now()
);

create table if not exists feed_digests (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Desde cuándo se miró, para que la siguiente empiece donde acabó esta.
  since      timestamptz not null,
  markdown   text not null,
  emails     integer not null default 0,
  cost_usd   numeric(10,6) not null default 0
);

create index if not exists feed_digests_recent_idx
  on feed_digests (created_at desc);

-- Como los descartados: no pertenecen a ningún espacio, así que RLS no puede
-- decidir por pertenencia. Se cierran del todo y solo se tocan con service
-- role, desde código que comprueba antes que quien pregunta es el dueño del
-- buzón. Sin esto, cualquier miembro de cualquier espacio los leería.
alter table feeds enable row level security;
alter table feed_digests enable row level security;

-- El `grant all on all tables` del 0001 fue una foto, no una regla: alcanzó a
-- las tablas que existían aquel día y a ninguna posterior. Por eso estas dos
-- nacieron invisibles para el código —"permission denied for table feeds"—
-- aunque estuvieran creadas.
grant all on feeds, feed_digests to service_role;

-- Y para que la siguiente tabla no repita el viaje.
alter default privileges in schema public grant all on tables to service_role;
