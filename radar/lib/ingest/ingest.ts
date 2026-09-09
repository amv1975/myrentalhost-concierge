import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import { getMessage, listMessageIds } from "@/lib/google/gmail";
import { buildGmailQuery, matchesSource } from "@/lib/ingest/query";
import type { Source, Space } from "@/lib/types";

export interface IngestResult {
  space: string;
  messagesSeen: number;
  messagesNew: number;
  skipped: number;
  error?: string;
}

/**
 * Trae los correos nuevos de un espacio y los guarda en crudo. No extrae nada.
 *
 * Idempotente por construcción: el INSERT lleva ON CONFLICT DO NOTHING sobre
 * emails.gmail_message_id, así que ejecutarlo veinte veces seguidas deja la
 * misma fila. Es lo que permite que el cron pase cada hora sobre la misma
 * ventana de 14 días sin acumular basura.
 */
export async function ingestSpace(space: Space): Promise<IngestResult> {
  const admin = createAdminClient();
  const result: IngestResult = {
    space: space.key,
    messagesSeen: 0,
    messagesNew: 0,
    skipped: 0,
  };

  const { data: runRow } = await admin
    .from("sync_runs")
    .insert({ space_id: space.id, kind: "ingest" })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  try {
    const { data: sourceRows, error: sourcesError } = await admin
      .from("sources")
      .select("*")
      .eq("space_id", space.id)
      .eq("enabled", true);
    if (sourcesError) throw sourcesError;

    const sources = (sourceRows ?? []) as Source[];
    const query = buildGmailQuery(sources, space.lookback_days);
    if (!query) {
      await finishRun(runId, "ok", result);
      return result;
    }

    const userId = await getIngestUserId(space.id);
    if (!userId) {
      throw new Error(
        `Ningún miembro de ${space.name} tiene credenciales de Google guardadas. Entra una vez en la app para concederlas.`,
      );
    }
    const accessToken = await getAccessToken(userId);

    const messageIds = await listMessageIds(accessToken, query);
    result.messagesSeen = messageIds.length;

    // Los que ya tenemos no se vuelven a pedir a la API: ahorra cuota y hace
    // que la ejecución típica del cron sea casi gratis.
    const known = await knownMessageIds(messageIds);
    const fresh = messageIds.filter((id) => !known.has(id));

    for (const messageId of fresh) {
      const message = await getMessage(accessToken, messageId);

      if (!matchesSource(message.fromEmail, sources)) {
        result.skipped += 1;
        continue;
      }

      const { error: insertError } = await admin.from("emails").insert(
        {
          space_id: space.id,
          gmail_message_id: message.id,
          gmail_thread_id: message.threadId,
          from_email: message.fromEmail,
          from_name: message.fromName,
          subject: message.subject,
          snippet: message.snippet,
          body_text: message.bodyText,
          received_at: message.receivedAt.toISOString(),
        },
        // Otra ejecución concurrente puede haberlo insertado entre la
        // comprobación y aquí; el UNIQUE lo resuelve sin ruido.
        { count: "exact" },
      );

      if (insertError) {
        if (insertError.code === "23505") continue;
        throw insertError;
      }
      result.messagesNew += 1;
    }

    await finishRun(runId, "ok", result);
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    await finishRun(runId, "error", result);
    return result;
  }
}

async function knownMessageIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const admin = createAdminClient();
  const known = new Set<string>();

  // .in() con listas muy largas revienta la URL; por lotes.
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data, error } = await admin
      .from("emails")
      .select("gmail_message_id")
      .in("gmail_message_id", batch);
    if (error) throw error;
    for (const row of (data ?? []) as { gmail_message_id: string }[]) {
      known.add(row.gmail_message_id);
    }
  }
  return known;
}

async function finishRun(
  runId: string | undefined,
  status: "ok" | "error",
  result: IngestResult,
): Promise<void> {
  if (!runId) return;
  const admin = createAdminClient();
  await admin
    .from("sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      messages_seen: result.messagesSeen,
      messages_new: result.messagesNew,
      error: result.error ?? null,
    })
    .eq("id", runId);
}
