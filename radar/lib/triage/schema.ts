import { z } from "zod";

/**
 * Lo que se saca de un correo que ya ha pasado el filtro por asunto.
 *
 * Antes esto era diminuto porque corría sobre la bandeja entera. Ya no: aquí
 * llegan diez correos al día, los que alguien ha decidido que son tuyos. A
 * esos sí compensa leerlos enteros y sacarles todo lo que hace falta para
 * decidir sin abrir Gmail — que es la diferencia entre un titular y un parte.
 */
export const TriageResultSchema = z.object({
  category: z
    .enum(["family", "personal", "work", "none"])
    .describe(
      "family si es de la casa y las niñas (colegio, actividades, salud de ellas); personal si es su administración privada (banco, seguros, impuestos, salud propia, coche, suministros, comunidad de vecinos); work si es del negocio de alquiler turístico; none si al leerlo entero resulta no ser nada de eso.",
    ),
  summary: z
    .string()
    .max(180)
    .describe(
      "El titular: qué pasa, en una frase corta y concreta. Sin repetir el asunto literal.",
    ),
  detail: z
    .string()
    .max(700)
    .describe(
      "De dos a cuatro frases con lo que hace falta para decidir sin abrir el correo: importes, plazos con fecha, números de reserva o factura, y quién espera qué desde cuándo.",
    ),
  riesgo: z
    .string()
    .max(140)
    .nullable()
    .describe(
      "Qué pasa si nadie lo mira hoy, en una frase corta y concreta: 'si no sale hoy, el huésped llega mañana enojado y con el cobro en disputa', 'el plazo vence el viernes y la multa es de 300 €'. null si no pasa nada por dejarlo para otro día — que es la mayoría de las veces. No lo rellenes con un genérico tipo 'podría generar retrasos'.",
    ),
  actionable: z
    .boolean()
    .describe(
      "true solo si hay algo que hacer. Un aviso de que algo ya se resolvió solo, una confirmación o un boletín es false aunque sea importante saberlo.",
    ),
  importance: z
    .enum(["alta", "normal", "baja"])
    .describe(
      "alta si hay dinero, un plazo legal, alguien esperando respuesta que ya insistió, o algo que se rompe si se ignora.",
    ),
  cita: z
    .object({
      titulo: z
        .string()
        .max(120)
        .describe(
          "Cómo se llamaría en el calendario. Corto y reconocible de un vistazo: 'Reunión de vecinos', 'Tutoría con la profesora de tercero'.",
        ),
      fecha: z
        .string()
        .describe(
          "El día, en AAAA-MM-DD. Las fechas relativas se resuelven contra la fecha del correo, no contra hoy.",
        ),
      hora: z
        .string()
        .nullable()
        .describe(
          "La hora de inicio en HH:MM, hora local de Madrid. null si el correo no la dice: no te la inventes.",
        ),
      hora_fin: z
        .string()
        .nullable()
        .describe("La hora de fin en HH:MM, si el correo la dice. null si no."),
      lugar: z.string().max(200).nullable().describe("Dónde, si lo dice."),
    })
    .nullable()
    .describe(
      "La cita que hay que apuntar en el calendario, si la hay. null en la inmensa mayoría de los correos.",
    ),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;
