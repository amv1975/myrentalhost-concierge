import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import {
  cancelEvent,
  createEvent,
  updateEvent,
  type CalendarEventInput,
} from "@/lib/google/calendar";
import { DEFAULT_EVENT_MINUTES, addMinutes } from "@/lib/extraction/dates";
import { needsSync } from "@/lib/calendar/needs-sync";
import type { Item, Space } from "@/lib/types";
import { describeError } from "@/lib/errors";

export interface SyncResult {
  space: string;
  created: number;
  updated: number;
  cancelled: number;
  failed: number;
  error?: string;
}

/**
 * Lleva al calendario los eventos confirmados de un espacio.
 *
 * Solo eventos: las acciones no tienen hora y el calendario no sabe guardarlas
 * — viven en Radar, que es justamente el motivo de que la app exista.
 *
 * Idempotente: un ítem que ya tiene google_event_id se actualiza en su sitio, y
 * si no ha cambiado desde la última sincronización ni siquiera se llama a la
 * API. Ejecutarlo veinte veces seguidas no crea veinte eventos.
 */
export async function syncSpace(space: Space): Promise<SyncResult> {
  const admin = createAdminClient();
  const result: SyncResult = {
    space: space.key,
    created: 0,
    updated: 0,
    cancelled: 0,
    failed: 0,
  };

  try {
    const { data, error } = await admin
      .from("items")
      .select("*")
      .eq("space_id", space.id)
      .eq("type", "event")
      .in("status", ["confirmed", "dismissed"]);
    if (error) throw error;

    const items = (data ?? []) as Item[];
    const pending = items.filter(needsSync);
    if (pending.length === 0) return result;

    const userId = await getIngestUserId(space.id);
    if (!userId) {
      throw new Error(
        `Ningún miembro de ${space.name} tiene credenciales de Google guardadas.`,
      );
    }
    const accessToken = await getAccessToken(userId);
    const attendees = await getAttendees(space, userId);

    for (const item of pending) {
      await syncOne(item, space, accessToken, attendees, result);
    }

    return result;
  } catch (error) {
    result.error = describeError(error);
    return result;
  }
}


async function syncOne(
  item: Item,
  space: Space,
  accessToken: string,
  attendees: string[],
  result: SyncResult,
): Promise<void> {
  const admin = createAdminClient();
  const calendarId = item.google_calendar_id ?? space.google_calendar_id;

  try {
    // Descartar un evento que ya estaba en el calendario lo quita de ahí. Si
    // Radar se inventó una reunión, dejarla puesta sería peor que retirarla.
    if (item.status === "dismissed") {
      if (item.google_event_id) {
        await cancelEvent(accessToken, calendarId, item.google_event_id);
        await admin
          .from("items")
          .update({
            google_event_id: null,
            synced_at: new Date().toISOString(),
            sync_error: null,
          })
          .eq("id", item.id);
        result.cancelled += 1;
      }
      return;
    }

    const starts = new Date(item.starts_at!);
    const input: CalendarEventInput = {
      summary: item.title,
      description: buildDescription(item),
      location: item.location,
      start: starts,
      end: item.ends_at
        ? new Date(item.ends_at)
        : addMinutes(starts, DEFAULT_EVENT_MINUTES),
      timeZone: space.timezone,
      attendees,
    };

    if (item.google_event_id) {
      // La razón de guardar el id: cuando el colegio mueve la hora, se corrige
      // el evento que ya está en el calendario en lugar de duplicarlo.
      await updateEvent(accessToken, calendarId, item.google_event_id, input);
      result.updated += 1;

      await admin
        .from("items")
        .update({
          google_calendar_id: calendarId,
          synced_at: new Date().toISOString(),
          sync_error: null,
        })
        .eq("id", item.id);
      return;
    }

    const event = await createEvent(accessToken, calendarId, input);
    result.created += 1;

    await admin
      .from("items")
      .update({
        google_event_id: event.id,
        google_calendar_id: calendarId,
        synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", item.id);
  } catch (error) {
    // Un evento que falla no puede impedir que el resto se sincronice, y el
    // error queda visible en la UI en vez de perderse en un log.
    result.failed += 1;
    await admin
      .from("items")
      .update({
        sync_error: describeError(error),
      })
      .eq("id", item.id);
  }
}

function buildDescription(item: Item): string {
  const parts = [item.description?.trim()].filter(Boolean);
  parts.push(
    `— Extraído por Radar del correo ${item.gmail_message_id}. Revisa el original si algo no cuadra.`,
  );
  return parts.join("\n\n");
}

/**
 * A quién invitar. En Familia siempre va Victoria, que es la regla del
 * enunciado; se resuelve desde allowed_members para no escribir su correo en el
 * código, y se excluye al propio organizador.
 */
async function getAttendees(
  space: Space,
  organizerId: string,
): Promise<string[]> {
  const admin = createAdminClient();

  const { data: members, error } = await admin
    .from("allowed_members")
    .select("email")
    .eq("space_key", space.key);
  if (error) throw error;

  const { data: organizer } = await admin
    .from("google_accounts")
    .select("email")
    .eq("user_id", organizerId)
    .maybeSingle();

  const organizerEmail = (organizer?.email ?? "").toLowerCase();

  return ((members ?? []) as { email: string }[])
    .map((m) => m.email.toLowerCase())
    .filter((email) => email !== organizerEmail);
}

/** Sincroniza un ítem concreto, justo después de confirmarlo desde la UI. */
export async function syncItemById(itemId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: item, error } = await admin
    .from("items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!item || (item as Item).type !== "event") return;

  const { data: space } = await admin
    .from("spaces")
    .select("*")
    .eq("id", (item as Item).space_id)
    .single();

  const typedItem = item as Item;
  const typedSpace = space as Space;
  if (!needsSync(typedItem)) return;

  const userId = await getIngestUserId(typedSpace.id);
  if (!userId) return;

  const accessToken = await getAccessToken(userId);
  const attendees = await getAttendees(typedSpace, userId);
  const result: SyncResult = {
    space: typedSpace.key,
    created: 0,
    updated: 0,
    cancelled: 0,
    failed: 0,
  };

  await syncOne(typedItem, typedSpace, accessToken, attendees, result);
}
