-- El espacio Personal. Va aparte de 0006 porque Postgres no deja usar un valor
-- de enum recién añadido en la misma transacción en la que se creó.

insert into spaces (key, name, timezone, default_location, google_calendar_id)
values ('personal', 'Personal', 'Europe/Madrid', null, 'primary')
on conflict (key) do nothing;

-- Solo Agustín. Que Personal no sea compartido es el motivo de que exista.
insert into allowed_members (email, space_key, role)
values ('agustinvillafanie@gmail.com', 'personal', 'owner')
on conflict (email, space_key) do nothing;

-- Quien ya tenga sesión abierta no vuelve a pasar por el trigger de alta, así
-- que se le da de alta aquí mismo.
insert into space_members (space_id, user_id, role)
select s.id, u.id, 'owner'
from spaces s
join auth.users u on lower(u.email) = 'agustinvillafanie@gmail.com'
where s.key = 'personal'
on conflict (space_id, user_id) do nothing;

-- Qué entra en cada vida. Es lo que lee el filtro, así que decirlo bien aquí
-- vale más que cualquier lista de remitentes.
update spaces set description =
  'Mi administración privada, lo mío y no de la casa: banco, hipoteca, seguros, impuestos y Hacienda, salud y médicos, coche (ITV, multas, seguro), suministros de casa, comunidad de propietarios y administrador de fincas, gestiones con el ayuntamiento, compras y contratos personales. NO entra el negocio de alquiler turístico, ni el colegio de las niñas.'
where key = 'personal';

update spaces set description =
  'La casa y las niñas, lo que compartimos: el colegio Col·legi Lestonnac (circulares, recibos y cuotas escolares, salidas y excursiones, autorizaciones, reuniones y tutorías, notas y boletines, extraescolares, material y uniforme), AMPA, actividades y deporte de las niñas, becas y subvenciones para ellas, pediatra y salud de las niñas, cumpleaños y planes de familia. NO entra el negocio, ni mi administración privada como el banco o los impuestos.'
where key = 'family';
