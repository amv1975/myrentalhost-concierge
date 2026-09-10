import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessageBody, GmailRateLimitError } from "@/lib/google/gmail";
import { env } from "@/lib/env";
import { readUsage, type Spend } from "@/lib/usage";
import { TriageResultSchema, type TriageResult } from "@/lib/triage/schema";
import {
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  type TriageContext,
} from "@/lib/triage/prompt";
import { SIN_PLAZO, type Deadline } from "@/lib/deadline";
import type { Email, Space } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { CATEGORIAS_PROPIAS, ESTADOS_LEIBLES } from "@/lib/triage/estados";

/**
 * El modelo rápido y barato de la segunda etapa.
 *
 * Aquí ya no entra la bandeja entera: solo lo que ha pasado el filtro por
 * asunto, que son unos pocos correos al día. Aun así se usa el modelo barato,
 * porque resumir en una frase y decir si algo pide acción es una tarea
 * acotada; el caro se reserva para sacar los compromisos con sus fechas.
 */
export const TRIAGE_MODEL = "claude-haiku-4-5";

/**
 * Cuántos se leen a la vez.
 *
 * Cada uno son doce mil caracteres, así que lo que limita una pasada es el
 * reloj de Vercel y no el límite de la API. Diez a la vez es lo que hace que
 * una cola de sesenta correos se despache en dos pulsaciones y no en seis.
 */
const CONCURRENCY = 10;

/**
 * Tope de correos a los que se les baja el cuerpo y se les paga un resumen por
 * pasada. Es el freno de mano: aunque el filtro se equivoque y deje pasar de
 * más, una actualización no puede dispararse de coste.
 */
const MAX_PER_RUN = 40;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export interface TriageRunResult {
  read: number;
  family: number;
  work: number;
  ignored: number;
  failed: number;
  error?: string;
}

export async function triageOne(
  email: Pick<
    Email,
    | "from_email"
    | "from_name"
    | "subject"
    | "body_text"
    | "received_at"
    | "recipients"
  >,
  context: TriageContext,
  spend?: Spend,
): Promise<TriageResult> {
  const response = await getClient().messages.parse({
    model: TRIAGE_MODEL,
    max_tokens: 1200,
    output_config: { format: zodOutputFormat(TriageResultSchema) },
    // Idéntico en toda la pasada: en caché cuesta la décima parte.
    system: [
      {
        type: "text",
        text: buildTriageSystemPrompt(context),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildTriageUserPrompt({
          fromEmail: email.from_email,
          fromName: email.from_name,
          recipients: email.recipients ?? [],
          subject: email.subject,
          bodyText: email.body_text ?? "",
          receivedAt: new Date(email.received_at),
        }),
      },
    ],
  });

  spend?.add(TRIAGE_MODEL, readUsage(response.usage));

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo rechazó clasificar este correo.");
  }
  if (!response.parsed_output) {
    throw new Error("La clasificación no cumple el esquema esperado.");
  }

  return response.parsed_output;
}

/**
 * Baja el cuerpo de los correos que han sobrevivido al filtro y los resume.
 *
 * Solo llegan aquí los que ya tienen categoría: los que el filtro por asunto
 * ha dejado pasar y los de remitentes conocidos. De cada uno se pide el mensaje
 * a Gmail —ahora sí, entero— y se le saca la frase que se ve en la app, si pide
 * algo y cuánto corre.
 */
export async function triagePending(
  /** Null cuando se reanaliza: el cuerpo ya está guardado y no hay que pedir
   *  nada a Gmail. Los correos a los que les falte se quedan para la próxima
   *  actualización en vez de fallar. */
  accessToken: string | null,
  spaces: Space[],
  context: TriageContext,
  spend: Spend,
  plazo: Deadline = SIN_PLAZO,
  limit = MAX_PER_RUN,
): Promise<TriageRunResult> {
  const admin = createAdminClient();
  const result: TriageRunResult = {
    read: 0,
    family: 0,
    work: 0,
    ignored: 0,
    failed: 0,
  };

  const byKey = new Map(spaces.map((s) => [s.key, s.id]));

  try {
    const { data, error } = await admin
      .from("emails")
      .select("*")
      .in("triage_status", [...ESTADOS_LEIBLES])
      .in("triage_category", [...CATEGORIAS_PROPIAS])
      // Que haya pasado el filtro, no solo que tenga categoría: la categoría
      // podía venir del atajo viejo de remitente conocido, y entonces esto se
      // pondría a leer enteros avisos que el filtro habría descartado.
      .not("triaged_at", "is", null)
      .is("summary", null)
      .is("dismissed_at", null)
      // Lo que no es un envío masivo va primero: si la cola es larga, más vale
      // haber leído a las personas que a las máquinas.
      .order("bulk", { ascending: true })
      .order("received_at", { ascending: false })
      .limit(Math.min(limit, MAX_PER_RUN));
    if (error) throw error;

    const emails = (data ?? []) as Email[];

    for (let i = 0; i < emails.length; i += CONCURRENCY) {
      if (!plazo.ok()) {
        result.error =
          "Se acabó el tiempo leyendo correos; los que falten se leen en la siguiente actualización.";
        break;
      }
      const batch = emails.slice(i, i + CONCURRENCY);

      // El cuerpo se pide aquí, no en la ingesta: son estos pocos y no los
      // cientos que entraron.
      const withBody: Email[] = [];
      for (const email of batch) {
        if (email.body_text !== null) {
          withBody.push(email);
          continue;
        }
        if (!accessToken) continue;
        try {
          const bodyText = await getMessageBody(
            accessToken,
            email.gmail_message_id,
          );
          await admin
            .from("emails")
            .update({ body_text: bodyText })
            .eq("id", email.id);
          withBody.push({ ...email, body_text: bodyText });
        } catch (caught) {
          if (caught instanceof GmailRateLimitError) {
            result.error = caught.message;
            break;
          }
          throw caught;
        }
      }

      const outcomes = await Promise.all(
        withBody.map(async (email) => {
          try {
            return {
              email,
              triage: await triageOne(email, context, spend),
              error: null,
            };
          } catch (caught) {
            return {
              email,
              triage: null,
              error: describeError(caught),
            };
          }
        }),
      );

      for (const outcome of outcomes) {
        await save(outcome, byKey, result);
      }

      if (result.error) break;
    }

    return result;
  } catch (error) {
    result.error = describeError(error);
    return result;
  }
}

async function save(
  outcome: {
    email: Email;
    triage: TriageResult | null;
    error: string | null;
  },
  byKey: Map<string, string>,
  result: TriageRunResult,
): Promise<void> {
  const admin = createAdminClient();
  const { email, triage, error } = outcome;

  if (!triage) {
    await admin
      .from("emails")
      .update({ triage_status: "failed", extraction_error: error })
      .eq("id", email.id);
    result.failed += 1;
    return;
  }

  // La categoría ya la decidió el filtro por asunto; el resumen no la
  // reabre, solo puede degradarla a ruido si al leerlo entero resulta serlo.
  const category = triage.category === "none" ? "none" : email.triage_category;
  const spaceId = category ? (byKey.get(category) ?? null) : null;

  await admin
    .from("emails")
    .update({
      triage_status: "done",
      triage_category: category,
      summary: triage.summary,
      detail: triage.detail,
      actionable: triage.actionable,
      importance: triage.importance,
      space_id: spaceId,
      triage_model: TRIAGE_MODEL,
      triaged_at: new Date().toISOString(),
      // Lo que no pide nada no llega al modelo caro: se queda con su resumen.
      extraction_status: triage.actionable ? "pending" : "skipped",
    })
    .eq("id", email.id);

  result.read += 1;
  if (category === "family") result.family += 1;
  else if (category === "work") result.work += 1;
  else result.ignored += 1;
}
