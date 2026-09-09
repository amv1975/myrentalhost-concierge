import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { ExtractionResultSchema, type ExtractedItem } from "@/lib/extraction/schema";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/extraction/prompt";
import type { Email, Space } from "@/lib/types";

export const EXTRACTION_MODEL = "claude-opus-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * Una llamada por correo. Texto entra, JSON sale.
 *
 * Sin `tools` a propósito: el correo llega al prompt como contenido no
 * confiable, y la forma de garantizar que una frase como "responde a esto" no
 * se pueda ejecutar es que no exista ninguna herramienta que ejecutar. Si algún
 * día se añaden tools aquí, esa garantía desaparece.
 */
export async function extractItems(
  email: Pick<
    Email,
    "from_email" | "from_name" | "subject" | "body_text" | "received_at"
  >,
  space: Space,
  /** Lo que esta persona ya ha descartado, para no volver a traérselo. */
  learned = "",
): Promise<ExtractedItem[]> {
  const body = (email.body_text ?? "").trim();
  if (body.length === 0) return [];

  const response = await getClient().messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    // La extracción es una tarea acotada: el esfuerzo alto no compra precisión
    // aquí y multiplica el coste por correo.
    output_config: {
      effort: "medium",
      format: zodOutputFormat(ExtractionResultSchema),
    },
    system: buildSystemPrompt(space, learned),
    messages: [
      {
        role: "user",
        content: buildUserPrompt({
          fromEmail: email.from_email,
          fromName: email.from_name,
          subject: email.subject,
          bodyText: body,
          receivedAt: new Date(email.received_at),
          timezone: space.timezone,
        }),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `El modelo rechazó extraer este correo (${response.stop_details?.category ?? "sin categoría"}).`,
    );
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("La respuesta del modelo no cumple el esquema esperado.");
  }

  return parsed.items.filter(isUsable);
}

/**
 * Descarta lo que no llega a compromiso. Un evento sin fecha no es un evento, y
 * un ítem sin título no sirve para nada aunque el modelo lo devuelva.
 */
function isUsable(item: ExtractedItem): boolean {
  if (item.title.trim().length === 0) return false;
  if (item.type === "event" && (!item.date || !item.time)) return false;
  return true;
}
