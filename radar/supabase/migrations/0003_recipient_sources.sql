-- Fuentes por destinatario, además de por remitente.
--
-- Filtrar solo por quién escribe deja fuera lo que más importa en el trabajo:
-- un gestor, una asesoría o un proveedor escriben desde su propio dominio y
-- nunca van a estar en una lista blanca hecha de antemano. Lo que sí es estable
-- es a qué buzón llegan: administracion@, agus@, el dominio de la empresa.
--
-- Con esto, Trabajo puede decir "todo lo que llegue a mis direcciones de
-- empresa" y dejar de perder correos por venir de un remitente desconocido.

alter type source_kind add value if not exists 'to_email';
alter type source_kind add value if not exists 'to_domain';
