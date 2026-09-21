-- Lo que Gmail considera importante.
--
-- No es una etiqueta que ponga nadie a mano: Gmail la calcula con años de
-- historial de este buzón concreto —qué se abre, qué se contesta, qué se
-- archiva sin leer—. Es la mejor señal que había disponible y Radar la estaba
-- tirando a la basura, cuando venía gratis en la misma respuesta que las
-- cabeceras.
--
-- Dos correos que se perdieron el mismo día, un cliente potencial de Airbnb y
-- un plazo legal de formación, venían los dos marcados así.

alter table emails add column if not exists gmail_important boolean not null default false;

create index if not exists emails_important_idx
  on emails (gmail_important, received_at desc)
  where triaged_at is null;
