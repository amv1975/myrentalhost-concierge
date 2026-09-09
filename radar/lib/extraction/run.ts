import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXTRACTION_MODEL, extractItems } from "@/lib/extraction/extract";
import { persistItems } from "@/lib/extraction/persist";
import type { Email, Space } from "@/lib/types";

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
 * Extrae los correos pendientes de un espacio.
 *
 * La cola es `emails.extraction_status`: cada mensaje se procesa una sola vez.
 * Esa es la razón por la que el cron puede pasar cada hora sobre la misma
 * ventana de 14 días sin volver a pagar la extracción ni arriesgar duplicados.
 */
export async function extractPending(
  space: Space,
  limit = 25,
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
      .limit(limit);
    if (error) throw error;

    for (const email of (data ?? []) as Email[]) {
      await processOne(email, space, result);
    }

    await finishRun(runId, "ok", result);
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", result);
    return result;
  }
}

async function processOne(
  email: Email,
  space: Space,
  result: ExtractRunResult,
): Promise<void> {
  const admin = createAdminClient();

  await admin
    .from("emails")
    .update({
      extraction_status: "processing",
      extraction_attempts: email.extraction_attempts + 1,
    })
    .eq("id", email.id);

  try {
    const items = await extractItems(email, space);
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
  } catch (error) {
    // Un correo que falla no puede tumbar la tanda entera.
    await admin
      .from("emails")
      .update({
        extraction_status: "failed",
        extraction_error:
          error instanceof Error ? error.message : String(error),
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
