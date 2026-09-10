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
    .enum(["family", "work", "none"])
    .describe(
      "family si es de la vida familiar o el colegio; work si es del negocio de alquiler turístico; none si al leerlo entero resulta no ser ni una cosa ni otra.",
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
      "De dos a cuatro frases con lo que hace falta para decidir sin abrir el correo: importes, plazos con fecha, números de reserva o factura, quién espera qué y desde cuándo, y qué pasa si nadie lo mira.",
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
});

export type TriageResult = z.infer<typeof TriageResultSchema>;
