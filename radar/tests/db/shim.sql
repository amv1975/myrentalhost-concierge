-- Lo mínimo de Supabase que la migración necesita, para poder aplicar el
-- esquema real contra un Postgres normal en los tests.
--
-- No es una imitación de Supabase: es solo el esquema auth, la función
-- auth.uid() y los roles, que es lo que 0001_init.sql toca. Todo lo demás que
-- se pruebe aquí es el esquema de Radar tal cual se despliega.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique not null
);

-- En Supabase, auth.uid() sale del JWT. Aquí de una variable de sesión, para
-- que los tests puedan actuar como un usuario concreto.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- bypassrls es justo lo que hace el service role en Supabase, y por eso el
    -- código comprueba la pertenencia a mano antes de escribir con él.
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
