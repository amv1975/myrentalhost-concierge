import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { GateResultSchema } from "@/lib/triage/gate-schema";
import { knownSpaceFor } from "@/lib/ingest/query";
import {
  buildGateSystemPrompt,
  buildGateUserPrompt,
  type GateContext,
  type GateEmail,
} from "@/lib/triage/gate-prompt";
import {
  buildIgnoredSection,
  buildStarredSection,
  getIgnoredExamples,
  getStarredExamples,
} from "@/lib/triage/learned";
import { readUsage, type Spend } from "@/lib/usage";
import { SIN_PLAZO, type Deadline } from "@/lib/deadline";
import type { Email, Source, Space, TriageCategory } from "@/lib/types";
import { describeError } from "@/lib/errors";

/** El modelo más barato que hay. Para mirar un asunto sobra. */
export const GATE_MODEL = "claude-haiku-4-5";

/**
 * Correos por llamada.
 *
 * Es la palanca del coste. El prompt de sistema se paga una vez por llamada,
 * así que repartirlo entre veinte correos lo diluye veinte veces; con uno por
 * llamada, el prompt costaría más que los propios correos. Veinte también es
 * poco suficiente para que el modelo no se confunda de número.
 */
const BATCH = 20;

/** Llamadas simultáneas. Cada una lleva veinte correos, así que con esto se
 *  clasifican ciento sesenta a la vez. */
const CONCURRENCY = 8;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/** Lo que basta para decidir: nunca se carga el cuerpo en esta etapa. */
type ScreenedEmail = Pick<
  Email,
  "id" | "from_email" | "from_name" | "subject" | "snippet" | "bulk"
>;

export interface GateRunResult {
  /** Correos mirados por encima. */
  screened: number;
  /** Los que resultan ser de alguna de las dos vidas. */
  kept: number;
  /** Ruido: ni se les baja el cuerpo. */
  discarded: number;
  failed: number;
  error?: string;
}

/**
 * Mira por encima todo lo que ha entrado y aparta el ruido.
 *
 * Esta es la etapa que hace viable leer un buzón entero. De trescientos correos
 * al día, la inmensa mayoría se resuelve aquí, con un asunto y dos líneas, por
 * una fracción de céntimo. Solo lo que sobrevive llega a costar dinero de
 * verdad: bajarle el cuerpo, resumirlo y, si pide algo, extraerle compromisos.
 */
export async function gatePending(
  spaces: Space[],
  context: GateContext,
  spend: Spend,
  plazo: Deadline = SIN_PLAZO,
  limit = 300,
): Promise<GateRunResult> {
  const admin = createAdminClient();
  const result: GateRunResult = {
    screened: 0,
    kept: 0,
    discarded: 0,
    failed: 0,
  };

  const spaceIdByKey = new Map(spaces.map((s) => [s.key, s.id]));

  try {
    // "Nunca lo ha mirado un modelo" es exactamente triaged_at nulo. Sirve
    // para lo recién llegado y también para rescatar lo que entró por el
    // atajo de remitente conocido, que se saltaba este filtro y llenaba de
    // avisos automáticos la cola de lectura.
    const { data, error } = await admin
      .from("emails")
      .select(
        "id, from_email, from_name, subject, snippet, bulk, triage_status",
      )
      .in("triage_status", ["pending", "failed"])
      .is("triaged_at", null)
      .order("received_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const pending = (data ?? []) as ScreenedEmail[];

    // La lista de remitentes del usuario ya no decide qué entra, pero sigue
    // sirviendo para no dudar entre familia y trabajo.
    const { data: sourceRows } = await admin
      .from("sources")
      .select("*, spaces(key)")
      .eq("enabled", true);
    const sources = ((sourceRows ?? []) as (Source & {
      spaces: { key: string } | null;
    })[]).map((row) => ({ ...row, space_key: row.spaces?.key }));

    // Dos consultas por pasada, no por lote: lo aprendido no cambia entre
    // lotes y va en el prompt de sistema, que además está en caché.
    //
    // Lo marcado va después de lo descartado a propósito: cuando un correo se
    // parece a las dos listas, lo último que lee el modelo es que ante la duda
    // suba. Perderse algo cuesta más que enseñar algo de más.
    const [ignored, starred] = await Promise.all([
      getIgnoredExamples(),
      getStarredExamples(),
    ]);
    const learned =
      buildIgnoredSection(ignored) + buildStarredSection(starred);

    const batches: ScreenedEmail[][] = [];
    for (let i = 0; i < pending.length; i += BATCH) {
      batches.push(pending.slice(i, i + BATCH));
    }

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      if (!plazo.ok()) {
        result.error = `Se acabó el tiempo mirando asuntos; el resto entra en la siguiente actualización.`;
        break;
      }
      await Promise.all(
        batches
          .slice(i, i + CONCURRENCY)
          .map((batch) =>
            runBatch(
              batch,
              context,
              learned,
              sources,
              spend,
              spaceIdByKey,
              result,
            ),
          ),
      );
    }

    return result;
  } catch (error) {
    result.error = describeError(error);
    return result;
  }
}

async function runBatch(
  batch: ScreenedEmail[],
  context: GateContext,
  learned: string,
  sources: (Source & { space_key?: string })[],
  spend: Spend,
  spaceIdByKey: Map<string, string>,
  result: GateRunResult,
): Promise<void> {
  const admin = createAdminClient();

  let decisions: Map<number, TriageCategory>;
  try {
    decisions = await classify(batch, context, learned, sources, spend);
  } catch {
    // Una tanda que falla se reintenta en la siguiente pasada. Cuesta décimas
    // de céntimo, así que no hace falta contador de intentos: lo que no puede
    // pasar es que un correo desaparezca sin que nadie lo haya mirado.
    await admin
      .from("emails")
      .update({ triage_status: "failed" })
      .in(
        "id",
        batch.map((e) => e.id),
      );
    result.failed += batch.length;
    return;
  }

  const noise: string[] = [];

  for (const [index, email] of batch.entries()) {
    const category = decisions.get(index + 1);

    if (!category) {
      // El modelo se saltó este número. Vuelve a la cola en lugar de darlo por
      // ruido: descartarlo por un fallo de formato sería perder correo.
      await admin
        .from("emails")
        .update({ triage_status: "failed" })
        .eq("id", email.id);
      result.failed += 1;
      continue;
    }

    result.screened += 1;

    if (category === "none") {
      noise.push(email.id);
      result.discarded += 1;
      continue;
    }

    // Sobrevive: se queda pendiente para que le bajen el cuerpo y lo resuman.
    await admin
      .from("emails")
      .update({
        triage_category: category,
        space_id: spaceIdByKey.get(category) ?? null,
        triage_status: "pending",
        triaged_at: new Date().toISOString(),
      })
      .eq("id", email.id);
    result.kept += 1;
  }

  if (noise.length > 0) {
    await admin
      .from("emails")
      .update({
        triage_status: "done",
        triage_category: "none",
        actionable: false,
        extraction_status: "skipped",
        triage_model: GATE_MODEL,
        triaged_at: new Date().toISOString(),
      })
      .in("id", noise);
  }
}

async function classify(
  batch: ScreenedEmail[],
  context: GateContext,
  learned: string,
  sources: (Source & { space_key?: string })[],
  spend: Spend,
): Promise<Map<number, TriageCategory>> {
  const emails: GateEmail[] = batch.map((email) => ({
    fromEmail: email.from_email,
    fromName: email.from_name,
    subject: email.subject,
    snippet: email.snippet,
    bulk: email.bulk ?? false,
    hint: knownSpaceFor(email.from_email, [], sources),
  }));

  const response = await getClient().messages.parse({
    model: GATE_MODEL,
    max_tokens: 1500,
    output_config: { format: zodOutputFormat(GateResultSchema) },
    // El prompt de sistema es idéntico en todas las llamadas de la pasada:
    // marcado como caché, a partir de la segunda cuesta la décima parte.
    system: [
      {
        type: "text",
        text: buildGateSystemPrompt(context, learned),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildGateUserPrompt(emails) }],
  });

  spend.add(GATE_MODEL, readUsage(response.usage));

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("El filtro por asunto no devolvió una respuesta válida.");
  }

  return new Map(
    response.parsed_output.results.map((r) => [r.i, r.category as TriageCategory]),
  );
}
