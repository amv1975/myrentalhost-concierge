import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXTRACTION_MODEL, extractItems } from "@/lib/extraction/extract";
import { persistItems } from "@/lib/extraction/persist";
import {
  buildLearnedSection,
  getDismissedExamples,
} from "@/lib/extraction/learned";
import type { Spend } from "@/lib/usage";
import type { Email, Space } from "@/lib/types";
import { describeError } from "@/lib/errors";

export interface ExtractRunResult {
  space: string;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  error?: string;
}

/** Tras tres intentos fallidos se deja de reintentar y se muestra el error. */
const MAX_ATTEMPTS = 3;

/**
 * Correos analizados a la vez.
 *
 * Uno detrás de otro, veinte correos son veinte esperas seguidas y pulsar
 * Actualizar se hace eterno. Cuatro en paralelo lo divide por cuatro sin
 * acercarse a los límites de la API ni disparar el coste, que depende de
 * cuántos correos se analizan y no de con qué rapidez.
 */
const CONCURRENCY = 4;

/**
 * Tope de correos a los que se les extraen compromisos por pasada.
 *
 * Es la llamada cara del sistema. Aquí solo llega lo que ha pasado dos filtros
 * y encima pide algo, así que quince sobran para un día normal; el tope está
 * por si algo se desmadra, para que el susto tenga techo.
 */
const MAX_PER_RUN = 15;

/**
 * Extrae los correos pendientes de un espacio.
 *
 * La cola es `emails.extraction_status`: cada mensaje se procesa una sola vez.
 * Esa es la razón por la que el cron puede pasar cada hora sobre la misma
 * ventana de 14 días sin volver a pagar la extracción ni arriesgar duplicados.
 */
export async function extractPending(
  space: Space,
  spend?: Spend,
  limit = MAX_PER_RUN,
): Promise<ExtractRunResult> {
  const admin = createAdminClient();
  const result: ExtractRunResult = {
    space: space.key,
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
  };

  const { data: runRow } = await admin
    .from("sync_runs")
    .insert({ space_id: space.id, kind: "extract" })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  try {
    const { data, error } = await admin
      .from("emails")
      .select("*")
      .eq("space_id", space.id)
      .in("extraction_status", ["pending", "failed"])
      .lt("extraction_attempts", MAX_ATTEMPTS)
      .order("received_at", { ascending: true })
      .limit(Math.min(limit, MAX_PER_RUN));
    if (error) throw error;

    // Una sola consulta por tanda: lo aprendido no cambia entre correos.
    const learned = buildLearnedSection(await getDismissedExamples(space.id));

    const emails = (data ?? []) as Email[];

    for (let i = 0; i < emails.length; i += CONCURRENCY) {
      const batch = emails.slice(i, i + CONCURRENCY);

      // Lo lento es preguntarle a Claude, y eso va en paralelo.
      const extracted = await Promise.all(
        batch.map((email) => extractOne(email, space, learned, spend)),
      );

      // Guardar va en serie a propósito: el emparejamiento de un ítem mira los
      // que ya existen, y dos correos del mismo lote hablando del mismo
      // compromiso se crearían por duplicado en vez de reconocerse.
      for (const outcome of extracted) {
        await persistOne(outcome, space, result);
      }
    }

    await finishRun(runId, "ok", result);
    return result;
  } catch (error) {
    result.error = describeError(error);
    await finishRun(runId, "error", result);
    return result;
  }
}

interface ExtractOutcome {
  email: Email;
  items: Awaited<ReturnType<typeof extractItems>> | null;
  error: string | null;
}

/** Solo pregunta. No escribe nada más que el intento, para no reprocesar. */
async function extractOne(
  email: Email,
  space: Space,
  learned: string,
  spend?: Spend,
): Promise<ExtractOutcome> {
  const admin = createAdminClient();

  await admin
    .from("emails")
    .update({
      extraction_status: "processing",
      extraction_attempts: email.extraction_attempts + 1,
    })
    .eq("id", email.id);

  try {
    return {
      email,
      items: await extractItems(email, space, learned, spend),
      error: null,
    };
  } catch (error) {
    // Un correo que falla no puede tumbar la tanda entera.
    return {
      email,
      items: null,
      error: describeError(error),
    };
  }
}

async function persistOne(
  outcome: ExtractOutcome,
  space: Space,
  result: ExtractRunResult,
): Promise<void> {
  const admin = createAdminClient();
  const { email, items, error } = outcome;

  if (error !== null || items === null) {
    await admin
      .from("emails")
      .update({ extraction_status: "failed", extraction_error: error })
      .eq("id", email.id);
    result.failed += 1;
    return;
  }

  try {
    const persisted = await persistItems(email, items, space);

    await admin
      .from("emails")
      .update({
        // Sin compromisos no es un fallo: es el resultado correcto para un
        // boletín informativo, y conviene distinguirlo en la UI.
        extraction_status: items.length === 0 ? "skipped" : "done",
        extraction_error: null,
        extraction_model: EXTRACTION_MODEL,
        extracted_at: new Date().toISOString(),
      })
      .eq("id", email.id);

    result.processed += 1;
    result.created += persisted.created;
    result.updated += persisted.updated;
  } catch (caught) {
    await admin
      .from("emails")
      .update({
        extraction_status: "failed",
        extraction_error:
          describeError(caught),
      })
      .eq("id", email.id);
    result.failed += 1;
  }
}

async function finishRun(
  runId: string | undefined,
  status: "ok" | "error",
  result: ExtractRunResult,
): Promise<void> {
  if (!runId) return;
  const admin = createAdminClient();
  await admin
    .from("sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      messages_seen: result.processed,
      items_created: result.created,
      items_updated: result.updated,
      error: result.error ?? null,
    })
    .eq("id", runId);
}
