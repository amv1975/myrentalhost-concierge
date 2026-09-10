import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMessageHeaders,
  listMessageIds,
  GmailRateLimitError,
} from "@/lib/google/gmail";
import { buildInboxQuery } from "@/lib/ingest/query";
import { SIN_PLAZO, type Deadline } from "@/lib/deadline";
import type { Source, Space, SpaceKey } from "@/lib/types";
import { describeError } from "@/lib/errors";

export interface IngestResult {
  messagesSeen: number;
  messagesNew: number;
  error?: string;
}

/**
 * Trae del buzón lo que ha entrado desde la última vez: remitente, asunto y
 * vista previa. Sin cuerpo.
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
 * Aquí ya no se decide de qué espacio es nada. Antes, un remitente de la lista
 * de confianza entraba con su espacio puesto y se saltaba el filtro por
 * asunto — y como los remitentes de confianza son justo los que más volumen
 * generan (Airbnb, Booking), doscientos sesenta avisos automáticos se colaban
 * a la cola de lectura cara sin que nadie los mirase. El atajo estaba pensado
 * para ahorrar, y costaba diez veces más de lo que ahorraba.
 *
 * Idempotente por construcción: los mensajes conocidos ni siquiera se piden a
 * la API, y el INSERT se apoya en el UNIQUE de gmail_message_id para el caso de
 * dos ejecuciones a la vez.
 */
export async function ingestInbox(
  accessToken: string,
  spaces: Space[],
  /** Desde cuándo mirar. Lo calcula el pipeline con la última pasada buena. */
  since: Date,
  plazo: Deadline = SIN_PLAZO,
  maxMessages = 200,
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
    const messageIds = await listMessageIds(
      accessToken,
      buildInboxQuery(since),
      maxMessages,
    );
    result.messagesSeen = messageIds.length;

    const known = await knownMessageIds(messageIds);
    const fresh = messageIds.filter((id) => !known.has(id));

    for (const messageId of fresh) {
      if (!plazo.ok()) {
        result.error =
          "Se acabó el tiempo bajando correos; los que falten entran en la siguiente actualización.";
        break;
      }
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

      const { error: insertError } = await admin.from("emails").insert({
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
