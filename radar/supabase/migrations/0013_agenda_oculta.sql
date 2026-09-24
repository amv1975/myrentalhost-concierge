-- Quitar de la vista una cita que ya no hace falta mirar.
--
-- "El telefonillo es de mantenimiento: con verlo una vez ya está." La agenda
-- enseñaba lo de hoy y mañana sin forma de despachar nada, así que lo ya
-- resuelto seguía compitiendo por la atención con lo que no lo está.
--
-- Se guarda aquí y NO se toca el evento en Google, que es la regla de toda la
-- app: Radar solo escribe en el calendario los eventos que creó ella misma. Un
-- evento de otra persona, o uno que puso él a mano, no se modifica ni se borra
-- por haberlo despachado en una pantalla.
--
-- El id de Google ya distingue cada repetición de un evento recurrente, así
-- que ocultar el telefonillo de hoy no oculta el de la semana que viene.
create table if not exists agenda_ocultos (
  google_event_id text primary key,
  ocultado_at     timestamptz not null default now()
);

-- Como los descartados y el Feed: no pertenecen a ningún espacio, así que RLS
-- no puede decidir por pertenencia. Se cierran del todo y solo se tocan con
-- service role, desde código que comprueba antes que quien pregunta es el
-- dueño del buzón.
alter table agenda_ocultos enable row level security;

grant all on agenda_ocultos to service_role;
