import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceLabel } from "@/lib/source-label";
import { formatDate, formatDateTime, daysBetween } from "@/lib/format";
import type { Email, Item, SpaceKey } from "@/lib/types";

/**
 * El parte de la mañana.
 *
 * Una sola lista, no dos pestañas. A las siete de la mañana con el café no
 * quieres elegir en qué mitad de tu vida mirar: quieres saber qué pasa hoy. La
 * etiqueta de cada línea dice si es de casa o del negocio, y con eso basta —
 * los espacios siguen separados donde de verdad importa, que es en la base de
 * datos, no en la pantalla.
 *
 * Arriba lo que hay que mirar hoy. Debajo el resto de lo que es tuyo. Y al
 * final, cuántos correos se tiraron y cuáles: sin poder comprobar eso, nadie
 * se fía de un filtro que decide por él.
 */

/** Ventana del parte. Dos días cubren el fin de semana sin llenar la pantalla. */
const WINDOW_HOURS = 48;

/** Un compromiso que vence dentro de esto sube arriba aunque nadie lo marque. */
const URGENT_DAYS = 3;

const NOISE_SHOWN = 60;

export interface ParteEntry {
  id: string;
  /** Un compromiso extraído, o un correo que solo se resume. */
  kind: "item" | "email";
  life: SpaceKey;
  urgent: boolean;
  /** Cuándo llegó el correo. */
  at: string;
  who: string;
  headline: string;
  detail: string | null;
  /** Para un compromiso: cuándo cae. Para un correo, nada. */
  when: string | null;
  fromEmail: string | null;
  subject: string | null;
  /** Si hay algo que hacer. Un aviso de que algo se resolvió solo, no lo hay. */
  actionable: boolean;
  gmailMessageId: string;
  needsReview: boolean;
  /** Marcado a mano como importante. Sube arriba y no se cae con el tiempo. */
  starred: boolean;
}

export interface Parte {
  /** Correos mirados en la ventana. */
  scanned: number;
  discarded: number;
  updatedAt: string | null;
  urgent: ParteEntry[];
  rest: ParteEntry[];
  /** Pasó, está bien que lo sepas, y no hay nada que hacer. */
  fyi: ParteEntry[];
  /** Qué se tiró. Vacío si este usuario no es el dueño del buzón. */
  noise: { who: string; subject: string }[];
}

export async function getParte(): Promise<Parte> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const now = new Date();

  // Los espacios visibles ya vienen filtrados por RLS: Victoria no ve Trabajo
  // aunque esta consulta no lo pida.
  const { data: spaceRows } = await supabase.from("spaces").select("id, key");
  const lifeById = new Map(
    ((spaceRows ?? []) as { id: string; key: SpaceKey }[]).map((s) => [
      s.id,
      s.key,
    ]),
  );

  const [itemRows, emailRows, starredRows] = await Promise.all([
    supabase
      .from("items")
      .select("*, emails(subject, from_email, from_name, received_at)")
      .in("status", ["pending", "needs_review", "confirmed"])
      .order("created_at", { ascending: false }),
    supabase
      .from("emails")
      .select("*")
      .gte("received_at", since)
      .eq("triage_status", "done")
      .not("summary", "is", null)
      .is("dismissed_at", null)
      .order("received_at", { ascending: false }),
    // Lo marcado a mano no se cae de la lista porque pasen dos días: si lo
    // señalaste es porque sigue pendiente hasta que tú digas lo contrario.
    supabase
      .from("emails")
      .select("*")
      .eq("triage_model", "usuario")
      .eq("importance", "alta")
      .is("dismissed_at", null)
      .order("received_at", { ascending: false })
      .limit(50),
  ]);

  const items = ((itemRows.data ?? []) as (Item & {
    emails: {
      subject: string | null;
      from_email: string;
      from_name: string | null;
      received_at: string;
    } | null;
  })[])
    // Un evento ya confirmado vive en el calendario; aquí sobra. Una acción
    // confirmada sigue siendo un compromiso abierto hasta que se marca hecha.
    .filter((i) => i.status !== "confirmed" || i.type === "action");

  const byId = new Map<string, Email>();
  for (const email of [
    ...((emailRows.data ?? []) as Email[]),
    ...((starredRows.data ?? []) as Email[]),
  ]) {
    byId.set(email.id, email);
  }
  const emails = [...byId.values()].sort((a, b) =>
    b.received_at.localeCompare(a.received_at),
  );

  const withItem = new Set(items.map((i) => i.email_id));

  const entries: ParteEntry[] = [
    ...items.map((item) => itemEntry(item, lifeById, now)),
    ...emails
      .filter((email) => !withItem.has(email.id))
      .map((email) => emailEntry(email, lifeById)),
  ].filter((entry): entry is ParteEntry => entry !== null);

  // Lo que has marcado tú manda sobre la hora: es lo único de esta pantalla
  // que dice explícitamente "esto por encima de lo demás".
  entries.sort(
    (a, b) =>
      Number(b.starred) - Number(a.starred) || b.at.localeCompare(a.at),
  );

  const noise = user ? await getNoise(user.id, since) : { list: [], count: 0 };

  return {
    scanned: await countScanned(since),
    discarded: noise.count,
    updatedAt: emails[0]?.triaged_at ?? null,
    urgent: entries.filter((e) => e.urgent),
    // Lo que no pide nada baja al tercer montón aunque sea de los tuyos: saber
    // que una reserva entró bien tranquiliza, pero no es una tarea, y mezclarlo
    // con las que sí lo son es lo que hace que una lista deje de despacharse.
    rest: entries.filter((e) => !e.urgent && e.actionable),
    fyi: entries.filter((e) => !e.urgent && !e.actionable),
    noise: noise.list,
  };
}

function itemEntry(
  item: Item & {
    emails: {
      subject: string | null;
      from_email: string;
      from_name: string | null;
      received_at: string;
    } | null;
  },
  lifeById: Map<string, SpaceKey>,
  now: Date,
): ParteEntry | null {
  const life = lifeById.get(item.space_id);
  if (!life) return null;

  const due = item.starts_at ?? item.due_date;
  const days = due ? daysBetween(due, now) : null;

  return {
    id: item.id,
    kind: "item",
    life,
    // Lo que cambió después de confirmarse, lo fijado a mano y lo que vence ya.
    urgent:
      item.status === "needs_review" ||
      item.pinned ||
      (days !== null && days <= URGENT_DAYS),
    at: item.emails?.received_at ?? item.created_at,
    who: sourceLabel(item.emails?.from_email, item.emails?.from_name) ?? "",
    headline: item.title,
    detail: item.description,
    when: whenLabel(item),
    fromEmail: item.emails?.from_email ?? null,
    subject: item.emails?.subject ?? null,
    actionable: true,
    gmailMessageId: item.gmail_message_id,
    needsReview: item.status === "needs_review",
    starred: item.pinned,
  };
}

function emailEntry(
  email: Email,
  lifeById: Map<string, SpaceKey>,
): ParteEntry | null {
  const life = email.space_id ? lifeById.get(email.space_id) : undefined;
  if (!life) return null;

  return {
    id: email.id,
    kind: "email",
    life,
    urgent: email.importance === "alta",
    at: email.received_at,
    who: sourceLabel(email.from_email, email.from_name) ?? "",
    headline: email.summary ?? email.subject ?? "(sin asunto)",
    // El snippet de Gmail solo se usa si el correo es viejo y se resumió antes
    // de que existiera el detalle.
    detail: email.detail ?? email.snippet,
    when: null,
    fromEmail: email.from_email,
    subject: email.subject,
    actionable: email.actionable,
    gmailMessageId: email.gmail_message_id,
    needsReview: false,
    starred: email.triage_model === "usuario" && email.importance === "alta",
  };
}

function whenLabel(item: Item): string | null {
  if (item.starts_at) {
    return item.all_day ? formatDate(item.starts_at) : formatDateTime(item.starts_at);
  }
  if (item.due_date) return `antes del ${formatDate(item.due_date)}`;
  return null;
}

/**
 * Lo descartado. Va con service role porque un correo clasificado como ruido no
 * pertenece a ningún espacio y RLS —con razón— no lo devuelve. Solo lo ve quien
 * es dueño del buzón: si Victoria entra, ve el recuento pero no la lista.
 */
async function getNoise(
  userId: string,
  since: string,
): Promise<{ list: { who: string; subject: string }[]; count: number }> {
  const admin = createAdminClient();

  const { data: account } = await admin
    .from("google_accounts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const { count } = await admin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .gte("received_at", since)
    .eq("triage_category", "none");

  if (!account) return { list: [], count: count ?? 0 };

  const { data } = await admin
    .from("emails")
    .select("from_email, from_name, subject")
    .gte("received_at", since)
    .eq("triage_category", "none")
    .order("received_at", { ascending: false })
    .limit(NOISE_SHOWN);

  const list = ((data ?? []) as Pick<
    Email,
    "from_email" | "from_name" | "subject"
  >[]).map((row) => ({
    who: sourceLabel(row.from_email, row.from_name) ?? row.from_email,
    subject: row.subject ?? "(sin asunto)",
  }));

  return { list, count: count ?? 0 };
}

async function countScanned(since: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .gte("received_at", since);
  return count ?? 0;
}
