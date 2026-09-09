import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^\d{2}:\d{2}$/;

/**
 * Lo que el modelo debe devolver por cada compromiso encontrado.
 *
 * Las fechas van como texto local (`2026-03-05`, `17:30`) y no como instante:
 * la conversión a UTC la hace Radar con la zona del espacio, para que un
 * "17:30" del colegio sea siempre las 17:30 en Barcelona pase lo que pase con
 * el horario de verano.
 */
export const ExtractedItemSchema = z.object({
  type: z.enum(["event", "action"]),
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Título corto y accionable, en el idioma del correo."),
  details: z
    .string()
    .max(600)
    .describe(
      "Los detalles prácticos: qué hay que llevar, cuánto cuesta, quién va. Sin relleno.",
    ),
  date: z
    .string()
    .regex(ISO_DATE)
    .nullable()
    .describe("Fecha del evento o fecha límite de la acción, AAAA-MM-DD."),
  time: z
    .string()
    .regex(LOCAL_TIME)
    .nullable()
    .describe("Hora de inicio HH:MM en 24h. null si el correo no la da."),
  end_time: z
    .string()
    .regex(LOCAL_TIME)
    .nullable()
    .describe("Hora de fin HH:MM si el correo la da."),
  location: z.string().max(200).nullable(),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "1 si el correo lo dice literalmente; menos si hay que interpretar.",
    ),
});

export const ExtractionResultSchema = z.object({
  items: z.array(ExtractedItemSchema).max(10),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
