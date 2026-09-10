-- El parte deja de ser un titular y pasa a ser un parte.
--
-- Hasta ahora, al desplegar una línea aparecía el snippet de Gmail: las dos
-- primeras líneas del correo, que casi nunca son lo que importa. El dato que
-- hace falta para decidir —el importe corregido, el plazo convertido en fecha,
-- quién espera respuesta y desde cuándo, qué se rompe si nadie lo mira— está en
-- mitad del cuerpo, y había que abrir Gmail para verlo.
--
-- Ahora eso se escribe al leer el correo y se guarda aquí. Es la diferencia
-- entre "la gestoría pregunta por una factura" y "pide siete justificantes,
-- corrige el importe en unos 350 € menos y avisa de que pedirá rectificativa".
alter table emails
  add column if not exists detail text;
