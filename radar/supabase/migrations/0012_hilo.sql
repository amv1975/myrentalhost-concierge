-- Quién habló el último.
--
-- El parte leía cada correo suelto, así que "el huésped pregunta por el
-- check-in" salía igual tanto si le contestaste hace una hora como si lleva
-- dos mensajes y dos días esperando. Esas dos cosas no se parecen en nada, y
-- la segunda es la que te hace abrir el correo.
--
-- Sale de las etiquetas que Gmail ya da: ni se lee un cuerpo ni pasa por el
-- modelo. Se guarda en el correo y no se recalcula en cada pintada, porque
-- mirar el parte no puede costar una llamada a Google por línea.
alter table emails
  add column if not exists esperando_desde timestamptz,
  add column if not exists sin_responder integer not null default 0;
