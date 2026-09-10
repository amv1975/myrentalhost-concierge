import { z } from "zod";

/**
 * Lo mínimo que puede devolver el filtro: un número y una palabra.
 *
 * Se paga por token de salida y esta etapa procesa la bandeja entera, así que
 * cada campo de más se multiplica por cientos de correos al día. El resumen y
 * la importancia se piden después, solo de los pocos que sobreviven.
 */
export const GateResultSchema = z.object({
  results: z
    .array(
      z.object({
        i: z.number().int().describe("El número del correo en la lista."),
        category: z
          .enum(["family", "work", "none"])
          .describe("La vida a la que pertenece, o none."),
      }),
    )
    .describe("Una entrada por cada correo recibido, en el mismo orden."),
});

export type GateResult = z.infer<typeof GateResultSchema>;
