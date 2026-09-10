-- El parte deja de ser un titular y pasa a ser un parte.
--
-- Hasta ahora, al desplegar una línea aparecía el snippet de Gmail: las dos
-- primeras líneas del correo, que casi nunca son lo que importa. El dato que
-- hace falta para decidir —el importe corregido, el plazo convertido en fecha,
-- quién espera respuesta y desde cuándo, qué se rompe si nadie lo mira— está en
-- mitad del cuerpo, y había que abrir Gmail para verlo.
alter table emails
  add column if not exists detail text,
  -- Lo que este correo tiene que ver con otro del mismo día.
  --
  -- Un correo suelto se entiende mal. "Airbnb ha suspendido el anuncio de
  -- Horta" es un aviso; "Airbnb ha suspendido el anuncio de Horta, y la huésped
  -- que está ahí escribió esta mañana que el grafiti sigue sin limpiar" es una
  -- causa y una tarea. Eso solo se ve mirando los correos del día juntos, no de
  -- uno en uno, y por eso se calcula aparte y se guarda aquí.
  add column if not exists link_note text;
