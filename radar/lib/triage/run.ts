import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { TriageResultSchema, type TriageResult } from "@/lib/triage/schema";
import {
  buildTriageSystemPrompt,
  buildTriageUserPrompt,
  type TriageContext,
} from "@/lib/triage/prompt";
import type { Email, Space } from "@/lib/types";

/**
 * El modelo rápido y barato de la primera etapa.
 *
 * Esta llamada se hace sobre TODO lo que entra en la bandeja, así que su precio
 * es el que decide si la aplicación es viable. Clasificar y resumir en una
 * frase es una tarea acotada: no hace falta el modelo caro, que se reserva para
 * los pocos correos que resultan tener un compromiso dentro.
 */
export const TRIAGE_MODEL = "claude-haiku-4-5";

/** Se leen muchos, así que van en paralelo; el límite lo pone la API. */
const CONCURRENCY = 8;

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
): Promise<TriageResult> {
  const response = await getClient().messages.parse({
    model: TRIAGE_MODEL,
    max_tokens: 500,
    output_config: { format: zodOutputFormat(TriageResultSchema) },
    system: buildTriageSystemPrompt(context),
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

  if (response.stop_reason === "refusal") {
    throw new Error("El modelo rechazó clasificar este correo.");
  }
  if (!response.parsed_output) {
    throw new Error("La clasificación no cumple el esquema esperado.");
  }

  return response.parsed_output;
}

/** Clasifica los correos que aún no han pasado por aquí. */
export async function triagePending(
  spaces: Space[],
  context: TriageContext,
  limit = 120,
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
      .in("triage_status", ["pending", "failed"])
      .order("received_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const emails = (data ?? []) as Email[];

    for (let i = 0; i < emails.length; i += CONCURRENCY) {
      const batch = emails.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(
        batch.map(async (email) => {
          try {
            return { email, triage: await triageOne(email, context), error: null };
          } catch (caught) {
            return {
              email,
              triage: null,
              error: caught instanceof Error ? caught.message : String(caught),
            };
          }
        }),
      );

      for (const outcome of outcomes) {
        await save(outcome, byKey, result);
      }
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
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

  const spaceId = byKey.get(triage.category) ?? null;

  await admin
    .from("emails")
    .update({
      triage_status: "done",
      triage_category: triage.category,
      summary: triage.summary,
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
  if (triage.category === "family") result.family += 1;
  else if (triage.category === "work") result.work += 1;
  else result.ignored += 1;
}
