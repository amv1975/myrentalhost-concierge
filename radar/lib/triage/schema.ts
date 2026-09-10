import { z } from "zod";

/**
 * Lo que decide la primera etapa por cada correo.
 *
 * Es deliberadamente pequeño: cuanto más corta la respuesta, más barato leer
 * un buzón entero, y esta etapa se ejecuta sobre todo lo que entra.
 */
export const TriageResultSchema = z.object({
  category: z
    .enum(["family", "work", "none"])
    .describe(
      "family si es de la vida familiar o el colegio; work si es del negocio de alquiler turístico; none si no es ni una cosa ni otra.",
    ),
  summary: z
    .string()
    .max(160)
    .describe(
      "De qué va, en una frase corta y concreta, en castellano. Sin repetir el asunto literal.",
    ),
  actionable: z
    .boolean()
    .describe(
      "true solo si pide algo concreto al destinatario o anuncia una cita con fecha. Un boletín o una confirmación automática es false.",
    ),
  importance: z
    .enum(["alta", "normal", "baja"])
    .describe(
      "alta si hay dinero, un plazo legal o algo que se rompe si se ignora.",
    ),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;
