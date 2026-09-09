-- Datos de partida. Nada de esto vive en el código de la app.
-- Las fuentes son editables desde /[espacio]/ajustes y van a cambiar.

insert into spaces (key, name, timezone, default_location, google_calendar_id)
values
  ('family', 'Familia', 'Europe/Madrid',
   'Col·legi Lestonnac, Carrer Pau Claris 131, Barcelona', 'primary'),
  ('work',   'Trabajo', 'Europe/Madrid', null, 'primary')
on conflict (key) do nothing;


-- Quién entra y a qué. Victoria solo ve Familia: el espacio Trabajo no le
-- aparece en la UI y RLS no le devuelve ninguna de sus filas.
insert into allowed_members (email, space_key, role)
values
  ('agustinvillafanie@gmail.com', 'family', 'owner'),
  ('agustinvillafanie@gmail.com', 'work',   'owner'),
  ('victoria.williams1@gmail.com', 'family', 'member')
on conflict (email, space_key) do nothing;


-- Fuentes de Familia: el colegio de las niñas.
insert into sources (space_id, kind, value)
select s.id, 'domain'::source_kind, v.value
from spaces s, (values
  ('maileducamos.com'),
  ('berrly.cloud'),
  ('lestonnacbcn.org')
) as v(value)
where s.key = 'family'
on conflict (space_id, kind, value) do nothing;


-- Fuentes de Trabajo: los canales de reserva y el buzón de la empresa.
insert into sources (space_id, kind, value)
select s.id, 'domain'::source_kind, v.value
from spaces s, (values
  ('guest.booking.com'),
  ('airbnb.com')
) as v(value)
where s.key = 'work'
on conflict (space_id, kind, value) do nothing;

insert into sources (space_id, kind, value)
select s.id, 'email'::source_kind, v.value
from spaces s, (values
  ('express@airbnb.com'),
  ('info@myrentalhost.com')
) as v(value)
where s.key = 'work'
on conflict (space_id, kind, value) do nothing;
