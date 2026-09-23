-- Qué se rompe si nadie lo mira hoy.
--
-- El parte contaba qué había pasado y se quedaba ahí. "El huésped pregunta por
-- el check-in" y "el huésped entra mañana, lleva dos mensajes sin respuesta y
-- si no sale hoy llega enojado" son el mismo correo, y solo el segundo te hace
-- abrirlo.
--
-- Va en su propia columna y no dentro del detalle porque tiene que poder
-- enseñarse aparte: es la frase que decide si algo se mira ahora o mañana, y
-- enterrada en el cuarto renglón no decide nada.
alter table emails
  add column if not exists riesgo text;
