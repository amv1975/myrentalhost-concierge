# Radar

Los compromisos que llegan por correo, en un solo sitio.

Hay correos que traen compromisos pero no llegan como invitación ni como tarea:
llegan como texto y se pierden en la bandeja. Radar lee la bandeja entera, dice
de qué va cada correo en una frase, y de los que piden algo saca lo que hay que
hacer y lo pone donde se ve.

De cada correo pueden salir dos cosas, y la distinción es el motivo de que la
app exista:

- **Eventos**: tienen fecha y hora. Van al calendario.
- **Acciones**: tienen fecha límite pero no hora, o ni eso. Pagar un recibo,
  firmar una autorización, decidir el precio de un late check-out. Son las que
  se pierden hoy, y el calendario no sabe guardarlas.

Se abre en **el parte de la mañana**: una sola lista con lo que hay que mirar
hoy arriba, el resto de lo tuyo debajo, y al final cuántos correos se tiraron y
cuáles — sin poder comprobar eso, nadie se fía de un filtro que decide por él.

Cada línea lleva su etiqueta, **Familia** (el colegio) o **Trabajo** (el
negocio), porque a las siete de la mañana no quieres elegir en qué mitad de tu
vida mirar. Los dos espacios siguen separados donde de verdad importa: en la
base de datos, con RLS, no en la pantalla.

En producción: **https://radar-sigma-five.vercel.app**

Puesta en marcha: [SETUP.md](SETUP.md).

## Cómo está construido

Next.js en Vercel, Supabase para datos y sesión, Gmail y Calendar de Google,
Claude para la extracción. Mobile-first, en español.

```
app/(app)/[espacio]/           vista, correos y ajustes de cada espacio
app/api/                       cron, ingesta, extracción, mutaciones
lib/google/gmail.ts            cliente de Gmail: dos funciones, ambas de lectura
lib/pipeline.ts                el ciclo completo, en un solo sitio
lib/triage/                    primera etapa: de qué vida es cada correo y de qué va
lib/extraction/                prompt, esquema, fechas, matching, persistencia
supabase/migrations/           el esquema real
tests/                         lógica pura y esquema contra Postgres
```

## Las cinco decisiones que sostienen esto

**Se lee todo, pero por escalones, de barato a caro.** Una lista blanca de
remitentes no cubre un buzón real: la gestoría que manda la factura, el
proveedor nuevo, el banco — ninguno está en ella, y son justo los que no se
pueden perder. Así que entra la bandeja entera. El problema entonces es el
dinero: pasar un modelo bueno por trescientos correos al día, de los que el 99%
es publicidad, sería absurdo. La solución es la misma que usa una persona con el
pulgar en la bandeja — mirar el asunto:

| | Qué se hace | Cuántos correos | Coste |
|---|---|---|---|
| 1 | Bajar de Gmail remitente, asunto y vista previa | todos | 0 |
| 2 | Mirar **veinte asuntos por llamada** al modelo más barato | todos | ~0,0001 $ cada uno |
| 3 | Bajar el cuerpo y resumirlo en una frase | los que sobreviven | ~0,002 $ |
| 4 | Extraer compromisos con sus fechas | los que además piden algo | ~0,02 $ |

El escalón 2 es el que sostiene todo: el prompt de sistema se paga una vez por
llamada y se reparte entre veinte correos, va marcado como caché, y la respuesta
es una palabra por correo. Los remitentes de confianza siguen existiendo, pero
ya no deciden qué entra: solo se saltan ese escalón.

Lo que sobrevive pero no pide nada se queda con su resumen y aparece en "Qué más
ha llegado": saber que algo llegó y poder ignorarlo también es información.


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

**Permisos mínimos, y verificados.** Gmail en solo lectura: no hay en todo el
proyecto una sola llamada que pueda enviar, responder, etiquetar o borrar un
correo. Calendar escribe solo sobre eventos que Radar creó — cada operación
exige el `google_event_id` que guardó la sincronización — y lee una ventana de
dos días para poder decirte si hoy tienes reuniones, sin llegar nunca a la
lista de calendarios de la cuenta ni a su configuración.
`tests/permissions.test.ts` falla si la lista de scopes crece, si aparece una
llamada de escritura a Gmail, si Calendar toca lo que no debe, o si la
extracción declara herramientas.

**El importe se enseña, no se esconde.** Cada llamada cuenta sus tokens y su
precio; el botón Actualizar dice lo que ha costado esa pasada y Ajustes lo que
llevas de mes. Una app que lee tu bandeja entera con un modelo detrás da miedo
justo por esto, y la respuesta no es prometer que es barato: es enseñar el
número cada vez. Hay además topes por pasada — cuarenta cuerpos leídos, quince
extracciones — para que un fallo del filtro tenga techo.

## Estado

Funciona el ciclo completo: autenticación, ingesta de la bandeja, clasificación,
extracción, revisión y sincronización con Google Calendar, con el cron que lo
repite cada día.

Confirmar un evento lo crea en el calendario e invita a quien corresponda;
cuando el colegio mueve la hora se actualiza el evento existente por su
`google_event_id`; y descartar un evento ya puesto lo retira. Las acciones
nunca van al calendario.

Para verlo sin provisionar nada: `RADAR_PREVIEW=1 npm run dev` y abre
`/preview`. Son los componentes reales con datos de ejemplo.
