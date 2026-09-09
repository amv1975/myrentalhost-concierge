import { createClient } from "@/lib/supabase/server";
import { daysBetween } from "@/lib/format";
import type { Item } from "@/lib/types";

export interface SpaceView {
  /** Lo que hay que revisar: primero lo que cambió, luego lo nuevo. */
  toReview: Item[];
  /** Acciones abiertas, la más urgente arriba. */
  openActions: Item[];
  /** Eventos confirmados que aún no han pasado. */
  upcomingEvents: Item[];
  /** Días que lleva esperando el ítem pendiente más antiguo. */
  oldestPendingDays: number | null;
}

/**
 * Todo lo que la vista de un espacio necesita, en una consulta.
 *
 * El orden lo dicta el uso: lo que exige una decisión va primero, y dentro de
 * eso los `needs_review` antes que las altas nuevas, porque un compromiso que
 * cambió cuando ya estaba en el calendario es lo más urgente que hay aquí.
 */
export async function getSpaceView(spaceId: string): Promise<SpaceView> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    // El asunto y el remitente del correo vienen en la misma consulta: son lo
    // que permite enlazar al original sin una petición por ítem.
    .select("*, emails(subject, from_email, from_name)")
    .eq("space_id", spaceId)
    .in("status", ["pending", "needs_review", "confirmed"])
    .order("created_at", { ascending: true });
  if (error) throw error;

  const items = ((data ?? []) as (Item & {
    emails: {
      subject: string | null;
      from_email: string;
      from_name: string | null;
    } | null;
  })[]).map(({ emails, ...item }) => ({
    ...item,
    email_subject: emails?.subject ?? null,
    email_from: emails?.from_email ?? null,
    email_from_name: emails?.from_name ?? null,
  })) as Item[];
  const now = new Date();
  const todayIso = now.toISOString();

  const toReview = items
    .filter((i) => i.status === "pending" || i.status === "needs_review")
    .sort((a, b) => {
      // Lo fijado a mano manda sobre cualquier otro criterio: es la única
      // forma que tiene el usuario de decir "esto por encima de la fecha".
      const pin = byPinned(a, b);
      if (pin !== 0) return pin;
      if (a.status !== b.status) return a.status === "needs_review" ? -1 : 1;
      return byDate(a) - byDate(b);
    });

  const openActions = items
    .filter((i) => i.type === "action" && i.status === "confirmed")
    .sort((a, b) => byPinned(a, b) || byDate(a) - byDate(b));

  const upcomingEvents = items
    .filter(
      (i) =>
        i.type === "event" &&
        i.status === "confirmed" &&
        (i.ends_at ?? i.starts_at ?? "") >= todayIso,
    )
    .sort((a, b) => byPinned(a, b) || byDate(a) - byDate(b));

  const oldestPending = toReview[0];
  const oldestPendingDays = oldestPending
    ? Math.abs(daysBetween(oldestPending.created_at, now))
    : null;

  return { toReview, openActions, upcomingEvents, oldestPendingDays };
}

/** Lo fijado sube. Empate si ninguno lo está o si lo están los dos. */
function byPinned(a: Item, b: Item): number {
  if (a.pinned === b.pinned) return 0;
  return a.pinned ? -1 : 1;
}

/** Sin fecha va al final, no al principio. */
function byDate(item: Item): number {
  const value = item.starts_at ?? item.due_date;
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value,
  );
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
