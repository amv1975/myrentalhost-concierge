import { createClient } from "@/lib/supabase/server";
import { daysBetween } from "@/lib/format";
import type { Importance, Item } from "@/lib/types";

/**
 * Un correo resumido en una frase.
 *
 * No todo lo que llega es un compromiso, pero saber que llegó y de qué iba
 * también es información: es la diferencia entre "no me ha llegado nada" y
 * "me ha llegado esto y puedo ignorarlo".
 */
export interface EmailBrief {
  id: string;
  gmail_message_id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  summary: string | null;
  importance: Importance;
  received_at: string;
}

export interface SpaceView {
  /** Lo que hay que revisar: primero lo que cambió, luego lo nuevo. */
  toReview: Item[];
  /** Acciones abiertas, la más urgente arriba. */
  openActions: Item[];
  /** Eventos confirmados que aún no han pasado. */
  upcomingEvents: Item[];
  /** Días que lleva esperando el ítem pendiente más antiguo. */
  oldestPendingDays: number | null;
  /** El resto del correo de este espacio, en una frase cada uno. */
  digest: EmailBrief[];
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

  // Los correos que ya han producido una tarjeta no se repiten abajo: verlos
  // dos veces haría dudar de si son dos cosas distintas.
  const withItems = new Set(items.map((i) => i.email_id));
  const digest = (await getDigest(spaceId)).filter(
    (email) => !withItems.has(email.id),
  );

  return { toReview, openActions, upcomingEvents, oldestPendingDays, digest };
}

/** Cuántos correos resumidos se muestran. Más allá, ya es la bandeja. */
const DIGEST_LIMIT = 40;

async function getDigest(spaceId: string): Promise<EmailBrief[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("emails")
    .select(
      "id, gmail_message_id, from_email, from_name, subject, summary, importance, received_at",
    )
    .eq("space_id", spaceId)
    .eq("triage_status", "done")
    .not("summary", "is", null)
    .order("received_at", { ascending: false })
    .limit(DIGEST_LIMIT);
  if (error) throw error;

  const briefs = (data ?? []) as EmailBrief[];

  // Lo importante arriba; dentro de cada grupo, lo más reciente primero.
  const rank: Record<Importance, number> = { alta: 0, normal: 1, baja: 2 };
  return briefs.sort(
    (a, b) =>
      rank[a.importance] - rank[b.importance] ||
      b.received_at.localeCompare(a.received_at),
  );
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
