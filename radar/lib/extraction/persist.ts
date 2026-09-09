import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDedupeKey,
  diffItems,
  findMatchingItem,
  normalizeTitle,
  type ExistingItem,
} from "@/lib/extraction/dedupe";
import {
  DEFAULT_EVENT_MINUTES,
  addMinutes,
  zonedTimeToUtc,
} from "@/lib/extraction/dates";
import type { ExtractedItem } from "@/lib/extraction/schema";
import type { Email, Space } from "@/lib/types";

export interface PersistResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Guarda los ítems de un correo.
 *
 * Tres caminos posibles por ítem:
 *   - No se parece a nada → alta en estado pending (o confirmed si el espacio
 *     tiene auto-confirmación y la confianza da).
 *   - Se parece a algo ya guardado y NO ha cambiado nada → no se toca. Es el
 *     caso normal cuando el mismo correo se reprocesa.
 *   - Se parece a algo ya guardado y SÍ ha cambiado (el cole movió la hora) →
 *     el ítem anterior queda marcado como sustituido y el nuevo entra en
 *     needs_review con el diff. Nunca se sobrescribe en silencio un compromiso
 *     ya confirmado.
 *
 * El UNIQUE (gmail_message_id, item_index) protege de una re-extracción del
 * mismo mensaje: el upsert sobre esa clave hace que el segundo intento
 * actualice su propia fila en vez de crear una nueva.
 */
export async function persistItems(
  email: Pick<Email, "id" | "space_id" | "gmail_message_id" | "gmail_thread_id">,
  extracted: ExtractedItem[],
  space: Space,
): Promise<PersistResult> {
  const admin = createAdminClient();
  const result: PersistResult = { created: 0, updated: 0, unchanged: 0 };

  const existing = await loadExistingItems(space.id);

  for (const [index, item] of extracted.entries()) {
    const normalizedTitle = normalizeTitle(item.title);
    const dedupeKey = buildDedupeKey({
      type: item.type,
      normalizedTitle,
      date: item.date,
    });

    const startsAt =
      item.type === "event" && item.date && item.time
        ? zonedTimeToUtc(item.date, item.time, space.timezone)
        : null;
    const endsAt = startsAt
      ? item.end_time && item.date
        ? zonedTimeToUtc(item.date, item.end_time, space.timezone)
        : addMinutes(startsAt, DEFAULT_EVENT_MINUTES)
      : null;
    const dueDate = item.type === "action" ? item.date : null;

    const match = findMatchingItem(
      {
        type: item.type,
        normalizedTitle,
        dedupeKey,
        date: item.date,
        threadId: email.gmail_thread_id,
      },
      existing,
    );

    const row = {
      space_id: email.space_id,
      email_id: email.id,
      gmail_message_id: email.gmail_message_id,
      item_index: index,
      type: item.type,
      title: item.title.trim(),
      normalized_title: normalizedTitle,
      description: item.details?.trim() || null,
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
      all_day: false,
      due_date: dueDate,
      location: item.location?.trim() || space.default_location || null,
      confidence: item.confidence,
      dedupe_key: dedupeKey,
    };

    // El ítem se ha emparejado consigo mismo: mismo correo, misma posición. Es
    // una re-extracción del mismo mensaje, no un compromiso que haya cambiado.
    const isSameSourceItem =
      match !== null &&
      match.gmail_message_id === email.gmail_message_id &&
      match.item_index === index;

    if (!match || isSameSourceItem) {
      // En una re-extracción no se toca el estado: si ya lo habías confirmado o
      // descartado, esa decisión es tuya y se respeta. Omitir la columna hace
      // justo eso, porque el upsert solo escribe las columnas presentes.
      const payload: Record<string, unknown> = { ...row };
      if (!isSameSourceItem) {
        payload.status = shouldAutoConfirm(item.confidence, space)
          ? "confirmed"
          : "pending";
      }

      const { error } = await admin
        .from("items")
        .upsert(payload, { onConflict: "gmail_message_id,item_index" });
      if (error) throw error;

      if (isSameSourceItem) result.unchanged += 1;
      else result.created += 1;
      continue;
    }

    const changes = diffItems(match, {
      title: row.title,
      description: row.description,
      startsAt,
      dueDate,
      location: row.location,
    });

    if (Object.keys(changes).length === 0) {
      result.unchanged += 1;
      continue;
    }

    // Hay cambio real sobre un compromiso que ya existía.
    const { data: inserted, error } = await admin
      .from("items")
      .upsert(
        {
          ...row,
          status: "needs_review",
          supersedes_item_id: match.id,
          changed_fields: changes,
          // El evento de Google se hereda: al confirmar, se actualiza ese
          // evento en vez de crear uno nuevo.
          google_event_id: match.google_event_id,
        },
        { onConflict: "gmail_message_id,item_index" },
      )
      .select("id")
      .single();
    if (error) throw error;

    await admin
      .from("items")
      .update({ superseded_by_item_id: inserted.id })
      .eq("id", match.id);

    result.updated += 1;
  }

  return result;
}

function shouldAutoConfirm(confidence: number, space: Space): boolean {
  return space.auto_confirm_enabled && confidence >= space.auto_confirm_threshold;
}

interface ExistingRow extends ExistingItem {
  gmail_message_id: string;
  item_index: number;
}

/**
 * Los ítems del espacio contra los que comparar. Solo los recientes: un
 * compromiso de hace tres meses no es el mismo que uno de mañana aunque se
 * llamen parecido.
 */
async function loadExistingItems(spaceId: string): Promise<ExistingRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString();

  const { data, error } = await admin
    .from("items")
    .select(
      "id, type, normalized_title, dedupe_key, status, starts_at, due_date, google_event_id, title, description, location, all_day, gmail_message_id, item_index, emails!inner(gmail_thread_id)",
    )
    .eq("space_id", spaceId)
    .gte("created_at", since);
  if (error) throw error;

  return ((data ?? []) as unknown as (Omit<ExistingRow, "gmail_thread_id"> & {
    emails: { gmail_thread_id: string } | { gmail_thread_id: string }[];
  })[]).map((row) => {
    const { emails, ...rest } = row;
    const thread = Array.isArray(emails) ? emails[0] : emails;
    return { ...rest, gmail_thread_id: thread?.gmail_thread_id ?? "" };
  });
}
