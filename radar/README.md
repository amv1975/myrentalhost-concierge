# Radar

Los compromisos que llegan por correo, en un solo sitio.

Hay correos que traen compromisos pero no llegan como invitación ni como tarea:
llegan como texto y se pierden en la bandeja. Radar los lee, saca lo que hay que
hacer y lo pone donde se ve.

De cada correo pueden salir dos cosas, y la distinción es el motivo de que la
app exista:

- **Eventos**: tienen fecha y hora. Van al calendario.
- **Acciones**: tienen fecha límite pero no hora, o ni eso. Pagar un recibo,
  firmar una autorización, decidir el precio de un late check-out. Son las que
  se pierden hoy, y el calendario no sabe guardarlas.

Dos espacios que no se mezclan nunca: **Familia** (el colegio) y **Trabajo**
(los canales de reserva). Separados en la base de datos con RLS, no solo en la
interfaz.

Puesta en marcha: [SETUP.md](SETUP.md).

## Cómo está construido

Next.js en Vercel, Supabase para datos y sesión, Gmail y Calendar de Google,
Claude para la extracción. Mobile-first, en español.

```
app/(app)/[espacio]/           vista, correos y ajustes de cada espacio
app/api/                       cron, ingesta, extracción, mutaciones
lib/google/gmail.ts            cliente de Gmail: dos funciones, ambas de lectura
lib/extraction/                prompt, esquema, fechas, matching, persistencia
supabase/migrations/           el esquema real
tests/                         lógica pura y esquema contra Postgres
```

## Las cuatro decisiones que sostienen esto

**Un correo se ingiere y se extrae una sola vez.** `emails.gmail_message_id` es
único y `extraction_status` hace de cola. El cron puede pasar cada hora sobre la
misma ventana de catorce días sin duplicar nada ni volver a pagar la extracción.
El `UNIQUE (gmail_message_id, item_index)` está como red de seguridad, pero no
basta por sí solo: `item_index` no es estable entre extracciones, así que los
ítems llevan además una `dedupe_key` derivada del contenido.

**Cuando el colegio cambia la hora, eso llega en otro correo.** Con otro
`gmail_message_id`, así que ningún constraint lo puede ver. `lib/extraction/dedupe.ts`
empareja por hilo de Gmail y por similitud de título dentro de una ventana de
fechas; si el compromiso ya estaba confirmado y algo cambió, el ítem nuevo entra
como `needs_review` con el diff en vez de sobrescribir en silencio. Ante la duda
no empareja: un ítem de más que revisar hace menos daño que machacar un
compromiso que no era el mismo.

**El correo es dato, nunca instrucción.** El cuerpo llega al prompt dentro de un
bloque marcado como no confiable, y el system prompt dice que "responde a esto"
es texto que resumir, no una orden. Pero la defensa que de verdad cuenta es
estructural: la llamada de extracción no declara herramientas. No hay nada que
un correo pueda hacer ejecutar.

**Permisos mínimos, y verificados.** Gmail en solo lectura, Calendar solo para
crear eventos. `tests/permissions.test.ts` falla si la lista de scopes crece, si
aparece en el código una llamada a un endpoint de escritura de Gmail, o si la
extracción empieza a declarar herramientas.

## Estado

Funcionan los pasos 1 a 4: autenticación, ingesta, extracción y revisión.

**Radar todavía no escribe nada fuera de su propia base de datos.** Confirmar un
evento lo marca como confirmado, pero aún no crea nada en Google Calendar. Es
deliberado: primero conviene comprobar sobre correos reales que la extracción es
buena. La sincronización con Calendar y el cron desplegado son lo siguiente.
