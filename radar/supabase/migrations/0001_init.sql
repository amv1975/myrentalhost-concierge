-- Radar — esquema inicial.
--
-- Dos garantías estructurales que este archivo debe sostener:
--   1. Idempotencia: un mensaje de Gmail se guarda una sola vez y sus ítems no
--      se pueden duplicar por muchas veces que corra el cron.
--   2. Separación de espacios: Familia y Trabajo se separan en la base de datos
--      vía RLS, no en la UI. Un miembro de Familia no puede leer una fila de
--      Trabajo ni manipulando el cliente.

create extension if not exists pg_trgm;

create type space_key as enum ('family', 'work');
create type item_type as enum ('event', 'action');
create type item_status as enum ('pending', 'confirmed', 'dismissed', 'done', 'needs_review');
create type extraction_status as enum ('pending', 'processing', 'done', 'failed', 'skipped');
create type source_kind as enum ('domain', 'email');


-- ---------------------------------------------------------------------------
-- Espacios y miembros
-- ---------------------------------------------------------------------------

create table spaces (
  id                    uuid primary key default gen_random_uuid(),
  key                   space_key not null unique,
  name                  text not null,
  timezone              text not null default 'Europe/Madrid',
  default_location      text,
  -- Destino de los eventos confirmados. 'primary' es el calendario principal
  -- de la cuenta; cambiar a un calendario dedicado es un UPDATE de esta fila.
  google_calendar_id    text not null default 'primary',
  auto_confirm_enabled  boolean not null default false,
  auto_confirm_threshold numeric(3,2) not null default 0.90
    check (auto_confirm_threshold between 0 and 1),
  lookback_days         integer not null default 14 check (lookback_days between 1 and 90),
  created_at            timestamptz not null default now()
);

create table space_members (
  space_id   uuid not null references spaces(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Los user_id de Supabase Auth no existen hasta el primer login, así que el
-- seed declara quién puede entrar por email y un trigger resuelve la
-- pertenencia cuando la cuenta aparece.
create table allowed_members (
  email      text not null,
  space_key  space_key not null,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (email, space_key)
);

create or replace function public.sync_space_membership_for_email(p_user_id uuid, p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into space_members (space_id, user_id, role)
  select s.id, p_user_id, a.role
  from allowed_members a
  join spaces s on s.key = a.space_key
  where lower(a.email) = lower(p_email)
  on conflict (space_id, user_id) do nothing;
$$;

create or replace function public.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_space_membership_for_email(new.id, new.email);
  return new;
end;
$$;

create trigger auth_user_created
  after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- Añadir a alguien a allowed_members después de que ya se haya registrado
-- también le debe dar acceso, sin exigirle volver a entrar.
create or replace function public.on_allowed_member_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
begin
  for v_user in select * from auth.users where lower(email) = lower(new.email) loop
    perform public.sync_space_membership_for_email(v_user.id, v_user.email);
  end loop;
  return new;
end;
$$;

create trigger allowed_member_added
  after insert on allowed_members
  for each row execute function public.on_allowed_member_added();


-- ---------------------------------------------------------------------------
-- Fuentes (remitentes). Editables desde la UI, nunca constantes en el código.
-- ---------------------------------------------------------------------------

create table sources (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references spaces(id) on delete cascade,
  kind       source_kind not null,
  value      text not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  unique (space_id, kind, value)
);

create index sources_space_enabled_idx on sources (space_id) where enabled;


-- ---------------------------------------------------------------------------
-- Correos crudos
-- ---------------------------------------------------------------------------

create table emails (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references spaces(id) on delete cascade,
  -- La clave de la idempotencia. UNIQUE global, no por espacio: un correo
  -- pertenece a un solo espacio, y si un remitente apareciera en las fuentes de
  -- ambos, se queda en el primero que lo ingiere en lugar de duplicarse.
  gmail_message_id   text not null unique,
  gmail_thread_id    text not null,
  from_email         text not null,
  from_name          text,
  subject            text,
  snippet            text,
  body_text          text,
  received_at        timestamptz not null,
  extraction_status  extraction_status not null default 'pending',
  extraction_attempts integer not null default 0,
  extraction_error   text,
  extraction_model   text,
  extracted_at       timestamptz,
  created_at         timestamptz not null default now()
);

create index emails_space_received_idx on emails (space_id, received_at desc);
create index emails_thread_idx on emails (space_id, gmail_thread_id);
create index emails_pending_extraction_idx on emails (extraction_status, received_at)
  where extraction_status in ('pending', 'failed');


-- ---------------------------------------------------------------------------
-- Ítems: los compromisos extraídos
-- ---------------------------------------------------------------------------

create table items (
  id                    uuid primary key default gen_random_uuid(),
  space_id              uuid not null references spaces(id) on delete cascade,
  email_id              uuid not null references emails(id) on delete cascade,
  gmail_message_id      text not null,
  item_index            integer not null,

  type                  item_type not null,
  title                 text not null,
  -- Título normalizado (sin tildes, minúsculas, sin puntuación). Se calcula en
  -- TypeScript, no aquí, para poder testear el matching sin base de datos.
  normalized_title      text not null,
  description           text,
  starts_at             timestamptz,
  ends_at               timestamptz,
  all_day               boolean not null default false,
  due_date              date,
  location              text,
  confidence            numeric(3,2) not null check (confidence between 0 and 1),
  status                item_status not null default 'pending',

  -- Derivada del contenido, no de la posición: un reintento de extracción
  -- reconoce sus propios ítems aunque el modelo los devuelva en otro orden.
  dedupe_key            text not null,
  -- El compromiso al que este ítem sustituye (el cole cambió la hora).
  supersedes_item_id    uuid references items(id) on delete set null,
  superseded_by_item_id uuid references items(id) on delete set null,
  -- Qué cambió respecto al ítem sustituido, para pintar el diff en la UI.
  changed_fields        jsonb,

  google_event_id       text,
  google_calendar_id    text,
  synced_at             timestamptz,
  sync_error            text,

  reviewed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Red de seguridad contra el reintento de extracción. No basta por sí sola
  -- (item_index no es estable entre extracciones distintas); la defensa
  -- principal es que emails.extraction_status impide re-extraer.
  unique (gmail_message_id, item_index),

  -- Un evento sin hora de inicio no es un evento.
  constraint event_needs_start check (type <> 'event' or starts_at is not null)
);

create index items_space_status_due_idx on items (space_id, status, due_date);
create index items_space_status_starts_idx on items (space_id, status, starts_at);
create index items_dedupe_idx on items (space_id, dedupe_key);
create index items_title_trgm_idx on items using gin (normalized_title gin_trgm_ops);
create index items_email_idx on items (email_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_touch_updated_at
  before update on items
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- Auditoría de ejecuciones
-- ---------------------------------------------------------------------------

create table sync_runs (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid references spaces(id) on delete cascade,
  kind           text not null check (kind in ('ingest', 'extract')),
  status         text not null default 'running' check (status in ('running', 'ok', 'error')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  messages_seen  integer not null default 0,
  messages_new   integer not null default 0,
  items_created  integer not null default 0,
  items_updated  integer not null default 0,
  error          text
);

create index sync_runs_space_started_idx on sync_runs (space_id, started_at desc);


-- ---------------------------------------------------------------------------
-- Credenciales de Google. Nunca legibles desde el cliente.
-- ---------------------------------------------------------------------------

create table google_accounts (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  email                   text not null,
  refresh_token           text not null,
  access_token            text,
  access_token_expires_at timestamptz,
  scopes                  text[] not null default '{}',
  updated_at              timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- security definer para no recursar sobre las políticas de space_members.
create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from space_members m
    where m.space_id = p_space_id and m.user_id = auth.uid()
  );
$$;

alter table spaces          enable row level security;
alter table space_members   enable row level security;
alter table allowed_members enable row level security;
alter table sources         enable row level security;
alter table emails          enable row level security;
alter table items           enable row level security;
alter table sync_runs       enable row level security;
alter table google_accounts enable row level security;

create policy spaces_select on spaces
  for select using (public.is_space_member(id));

create policy space_members_select on space_members
  for select using (user_id = auth.uid());

create policy sources_select on sources
  for select using (public.is_space_member(space_id));
create policy sources_insert on sources
  for insert with check (public.is_space_member(space_id));
create policy sources_update on sources
  for update using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));
create policy sources_delete on sources
  for delete using (public.is_space_member(space_id));

create policy emails_select on emails
  for select using (public.is_space_member(space_id));

-- Solo lectura desde el navegador. Confirmar, descartar y marcar como hecho
-- pasan por /api/items/[id], que comprueba la pertenencia al espacio y escribe
-- con service role. Así el cliente nunca puede tocar google_event_id ni
-- inventarse un estado.
create policy items_select on items
  for select using (public.is_space_member(space_id));

create policy sync_runs_select on sync_runs
  for select using (space_id is null or public.is_space_member(space_id));

-- allowed_members y google_accounts quedan sin políticas: solo service role.


-- ---------------------------------------------------------------------------
-- Privilegios
--
-- Supabase concede acceso a anon/authenticated por defecto, pero dejarlo
-- implícito esconde la decisión de diseño. Escritos aquí, se leen de un vistazo
-- y una regresión los rompe: el navegador puede LEER sus espacios y editar sus
-- remitentes, y nada más. Confirmar, descartar y sincronizar pasan por la API.
-- ---------------------------------------------------------------------------

grant select on spaces, space_members, emails, items, sync_runs to authenticated;
grant select, insert, update, delete on sources to authenticated;

-- allowed_members y google_accounts no se conceden a nadie: el refresh token de
-- Google no debe ser legible ni siquiera para su dueño desde el navegador.
grant all on all tables in schema public to service_role;
