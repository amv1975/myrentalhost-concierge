import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMessageHeaders,
  listMessageIds,
  GmailRateLimitError,
} from "@/lib/google/gmail";
import { buildInboxQuery, knownSpaceFor } from "@/lib/ingest/query";
import type { Source, Space, SpaceKey } from "@/lib/types";
import { describeError } from "@/lib/errors";

export interface IngestResult {
  messagesSeen: number;
  messagesNew: number;
  error?: string;
}

/**
 * Trae del buzón lo que aún no se ha visto: remitente, asunto y vista previa.
 * Sin cuerpo.
 *
 * Se ingiere el buzón entero, no una lista de remitentes, porque lo que más
 * importa suele venir de quien no esperas. Lo que Gmail ya aparta como
 * promoción, red social o foro se queda fuera: es la mayor parte del volumen y
 * ahí no hay compromisos.
 *
 * El cuerpo no se baja aquí a propósito. De trescientos correos al día, la
 * inmensa mayoría se descarta con solo mirar el asunto, y bajarles el mensaje
 * entero sería trabajo, tiempo y cuota de Gmail gastados en publicidad. Se
 * pide después, uno a uno, solo de los que han sobrevivido al primer filtro.
 *
 * Idempotente por construcción: los mensajes conocidos ni siquiera se piden a
 * la API, y el INSERT se apoya en el UNIQUE de gmail_message_id para el caso de
 * dos ejecuciones a la vez.
 */
export async function ingestInbox(
  accessToken: string,
  spaces: Space[],
  lookbackDays: number,
  maxMessages = 400,
): Promise<IngestResult> {
  const admin = createAdminClient();
  const result: IngestResult = { messagesSeen: 0, messagesNew: 0 };

  const { data: runRow } = await admin
    .from("sync_runs")
    .insert({ kind: "ingest" })
    .select("id")
    .single();
  const runId = runRow?.id as string | undefined;

  try {
    // Remitentes de confianza: ya no deciden qué entra, solo ahorran la
    // clasificación de lo que se sabe de antemano de qué espacio es.
    const { data: sourceRows } = await admin
      .from("sources")
      .select("*, spaces(key)")
      .eq("enabled", true);
    const sources = ((sourceRows ?? []) as (Source & {
      spaces: { key: string } | null;
    })[]).map((s) => ({ ...s, space_key: s.spaces?.key }));

    const spaceIdByKey = new Map(spaces.map((s) => [s.key, s.id]));

    const messageIds = await listMessageIds(
      accessToken,
      buildInboxQuery(lookbackDays),
      maxMessages,
    );
    result.messagesSeen = messageIds.length;

    const known = await knownMessageIds(messageIds);
    const fresh = messageIds.filter((id) => !known.has(id));

    for (const messageId of fresh) {
      let message;
      try {
        message = await getMessageHeaders(accessToken, messageId);
      } catch (error) {
        // Si Gmail corta por cuota, se conserva lo descargado y se termina la
        // tanda. El resto entra en la siguiente pasada, sin duplicar nada.
        if (error instanceof GmailRateLimitError) {
          result.error = error.message;
          break;
        }
        throw error;
      }

      const knownKey = knownSpaceFor(
        message.fromEmail,
        message.recipients,
        sources,
      );
      const knownSpaceId = knownKey
        ? (spaceIdByKey.get(knownKey as SpaceKey) ?? null)
        : null;

      const { error: insertError } = await admin.from("emails").insert({
        space_id: knownSpaceId,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId,
        from_email: message.fromEmail,
        from_name: message.fromName,
        recipients: message.recipients,
        subject: message.subject,
        snippet: message.snippet,
        bulk: message.bulk,
        // Se rellena más tarde, y solo si el correo pasa el filtro por asunto.
        body_text: null,
        received_at: message.receivedAt.toISOString(),
        // De un remitente conocido ya se sabe de qué vida es: se salta el
        // filtro por asunto y va directo a que le bajen el cuerpo.
        ...(knownKey ? { triage_category: knownKey } : {}),
      });

      if (insertError) {
        if (insertError.code === "23505") continue;
        throw insertError;
      }
      result.messagesNew += 1;
    }

    await finishRun(runId, result.error ? "error" : "ok", result);
    return result;
  } catch (error) {
    result.error = describeError(error);
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
