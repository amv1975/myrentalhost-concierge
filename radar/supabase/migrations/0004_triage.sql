-- Radar deja de mirar solo una lista de remitentes y pasa a leer el buzón.
--
-- El motivo: una lista blanca no cubre un buzón real. La gestoría que manda la
-- factura, el proveedor nuevo, el correo del banco — ninguno va a estar en ella,
-- y son justo los que no se pueden perder.
--
-- Leer todo con el modelo caro sería inviable: una bandeja normal recibe
-- cientos de correos al día y casi todo es publicidad. Por eso el trabajo va en
-- escalones, de barato a caro:
--
--   1. De cada correo se bajan solo las cabeceras y la vista previa. Gratis.
--   2. Un modelo barato mira veinte asuntos de una vez y dice de qué vida es
--      cada uno, o si es ruido. Ahí muere la mayor parte.
--   3. A los que sobreviven se les baja el cuerpo y se les paga un resumen.
--   4. Y solo a los que además piden algo se les extraen compromisos.
--
-- Cada escalón cuesta más que el anterior y recibe muchos menos correos.

-- Hasta ahora el espacio se sabía por el remitente, antes de guardar. Ahora se
-- decide después de leerlo, así que un correo recién llegado todavía no tiene.
alter table emails alter column space_id drop not null;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'triage_category') then
    create type triage_category as enum ('family', 'work', 'none');
  end if;
  if not exists (select 1 from pg_type where typname = 'triage_status') then
    create type triage_status as enum ('pending', 'processing', 'done', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'importance_level') then
    create type importance_level as enum ('alta', 'normal', 'baja');
  end if;
end
$$;

alter table emails
  add column if not exists triage_status triage_status not null default 'pending',
  add column if not exists triage_category triage_category,
  -- De qué va, en una frase. Es lo que se lee de un vistazo aunque el correo
  -- no pida nada: saber que existe y poder ignorarlo también es información.
  add column if not exists summary text,
  -- Si además pide algo, pasa a la extracción de compromisos.
  add column if not exists actionable boolean not null default false,
  add column if not exists importance importance_level not null default 'normal',
  add column if not exists triage_model text,
  add column if not exists triaged_at timestamptz,
  -- A quién iba, con las copias. Sin esto no se puede distinguir un correo
  -- dirigido a un buzón de empresa de uno donde solo apareces de rebote.
  add column if not exists recipients text[] not null default '{}',
  -- Trae List-Unsubscribe: es un envío masivo, no un correo escrito para ti.
  -- Es la pista más barata que hay de que algo es ruido.
  add column if not exists bulk boolean not null default false;

-- El cuerpo ya no se guarda al ingerir: se pide a Gmail solo cuando el correo
-- ha pasado el filtro por asunto. La inmensa mayoría se queda sin él para
-- siempre, que es justo el ahorro.
alter table emails alter column body_text drop not null;

-- Los dos escalones consultan la misma tabla pero buscan cosas distintas: el
-- filtro, lo que aún no tiene categoría; la lectura, lo que ya la tiene.
create index if not exists emails_pending_gate_idx
  on emails (triage_status, received_at desc)
  where triage_status in ('pending', 'failed') and triage_category is null;

create index if not exists emails_pending_triage_idx
  on emails (triage_status, triage_category, received_at desc)
  where triage_status in ('pending', 'failed');

create index if not exists emails_triage_category_idx
  on emails (triage_category, received_at desc)
  where triage_category is not null;

-- Qué es "familia" y qué es "trabajo" para esta persona. Lo lee el
-- clasificador: sin esto no puede decidir a qué vida pertenece un correo de un
-- remitente que no ha visto nunca, que es justo el caso que hay que resolver.
alter table spaces
  add column if not exists description text;

update spaces set description =
  'La vida familiar: el colegio de las hijas (Col·legi Lestonnac, Barcelona), '
  || 'actividades extraescolares, salud y médicos de la familia, y la '
  || 'administración doméstica — recibos del hogar, seguros, banco personal, '
  || 'coche, viajes en familia.'
where key = 'family' and description is null;

update spaces set description =
  'MyRentalHost, un negocio de gestión de alquiler turístico en Barcelona: '
  || 'reservas y mensajes de huéspedes de Airbnb y Booking, propietarios de los '
  || 'pisos, limpiezas y mantenimiento, proveedores, gestoría y asesoría, '
  || 'facturas y temas fiscales del negocio, licencias turísticas y normativa, '
  || 'y asociaciones del sector como Apartur.'
where key = 'work' and description is null;

-- ---------------------------------------------------------------------------
-- Cuánto cuesta cada pasada.
--
-- Una app que lee tu bandeja entera con un modelo detrás da miedo por el
-- importe, y con razón. Guardar los tokens y el coste de cada ejecución
-- permite enseñarlo en pantalla en vez de esperar a la factura.
-- ---------------------------------------------------------------------------

alter table sync_runs
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists cost_usd numeric(10, 6) not null default 0;

alter table sync_runs drop constraint if exists sync_runs_kind_check;
alter table sync_runs add constraint sync_runs_kind_check
  check (kind in ('ingest', 'extract', 'triage'));

create index if not exists sync_runs_started_idx on sync_runs (started_at desc);

-- Los correos ya guardados vienen de remitentes que estaban en la lista, así
-- que su espacio es correcto; se marcan como clasificados para no volver a
-- pagar por leerlos.
update emails
set triage_status = 'done',
    triage_category = (select key::text::triage_category from spaces s where s.id = emails.space_id),
    actionable = true
where triage_status = 'pending' and space_id is not null;
