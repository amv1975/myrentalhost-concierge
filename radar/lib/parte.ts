import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceLabel } from "@/lib/source-label";
import { formatDate, formatDateTime, daysBetween } from "@/lib/format";
import type { Email, Item, SpaceKey } from "@/lib/types";
import { describeError } from "@/lib/errors";
import { VENTANA_MS } from "@/lib/ventana";
import { MARCA_USUARIO } from "@/lib/triage/estados";

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

/** Ventana del parte. La misma que la de la ingesta, y por eso vive fuera. */

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
  /**
   * Qué se rompe si nadie lo mira hoy.
   *
   * Null casi siempre, y tiene que seguir siéndolo: si todas las líneas
   * avisaran de una consecuencia, ninguna avisaría de nada.
   */
  riesgo: string | null;
  /** Para un compromiso: cuándo cae. Para un correo, nada. */
  when: string | null;
  fromEmail: string | null;
  subject: string | null;
  /** Si hay algo que hacer. Un aviso de que algo se resolvió solo, no lo hay. */
  actionable: boolean;
  /** Qué tiene que ver con otro correo del día, si tiene que ver con alguno. */
  link: string | null;
  /** Aún sin resumir: se sabe que es tuyo, pero todavía no se ha leído. */
  reading: boolean;
  gmailMessageId: string;
  /** Marcado a mano como importante. Sube arriba y no se cae con el tiempo. */
  starred: boolean;
  /**
   * Su relación con el calendario.
   *
   * - `null` — no es una cita con hora, así que no hay nada que poner.
   * - `"puede"` — tiene fecha y hora y todavía no está puesta.
   * - `"puesto"` — ya está en tu Google Calendar.
   *
   * Se calcula aquí y no en la pantalla porque depende de dos condiciones que
   * vive el servidor: que el compromiso sea de tipo evento —lo único que
   * sincroniza el calendario— y que no tenga ya su google_event_id.
   */
  agenda: "puede" | "puesto" | null;
}

export interface NoiseEntry {
  /** Hace falta para poder rescatarlo: sin id, la lista solo se mira. */
  id: string;
  who: string;
  /** El remitente de verdad, para poder seguirlo como boletín. */
  fromEmail: string;
  subject: string;
  /**
   * Apareció buscando en Gmail, no en lo que Radar había descartado.
   *
   * Importa decirlo: significa que Radar ni lo había mirado, no que lo mirara
   * y lo tirase. Enseñarlo como "descartado" sería acusar al filtro de algo
   * que no hizo.
   */
  deGmail?: boolean;
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
  /** Cuántos se sabe que son tuyos pero todavía no se han leído. */
  reading: number;
  /** Qué se tiró. Vacío si este usuario no es el dueño del buzón. */
  noise: NoiseEntry[];
  /**
   * Boletines llegados desde la última síntesis del Feed.
   *
   * Es lo que convierte el enlace del Feed en un motivo para entrar. Sin el
   * número, es una pestaña más que hay que acordarse de mirar.
   */
  feedPendientes: number;
  /** Qué ha fallado al construir el parte, si ha fallado algo. */
  error?: string;
}

const VACIO: Parte = {
  feedPendientes: 0,
  reading: 0,
  scanned: 0,
  discarded: 0,
  updatedAt: null,
  urgent: [],
  rest: [],
  fyi: [],
  noise: [],
};

/**
 * El parte nunca lanza.
 *
 * Es la pantalla de inicio: si revienta, no se ve nada de nada, ni siquiera el
 * botón de actualizar, y encima el navegador enseña "a server error occurred",
 * que no dice qué ha pasado. Vale mil veces más una pantalla medio vacía que
 * cuenta el problema.
 */
export async function getParte(): Promise<Parte> {
  try {
    return await buildParte();
  } catch (error) {
    return {
      ...VACIO,
      error: describeError(error),
    };
  }
}

async function buildParte(): Promise<Parte> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const since = new Date(Date.now() - VENTANA_MS).toISOString();
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
      // Ni por triage_status ni por summary, a propósito. Un correo que ya ha
      // pasado el filtro por asunto YA se sabe que es tuyo, aunque todavía no
      // se haya leído entero: enseñarlo con su asunto y un "leyéndolo" es
      // infinitamente mejor que decir "0 para ti" mientras la cola avanza.
      // Esconderlo hasta tenerlo perfecto hacía que la app pareciera vacía y
      // rota justo cuando estaba trabajando.
      .not("space_id", "is", null)
      .is("dismissed_at", null)
      .order("received_at", { ascending: false }),
    // Lo marcado a mano no se cae de la lista porque pasen dos días: si lo
    // señalaste es porque sigue pendiente hasta que tú digas lo contrario.
    supabase
      .from("emails")
      .select("*")
      .eq("triage_model", MARCA_USUARIO)
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
  const unicas = dedupe(entries);

  unicas.sort(
    (a, b) =>
      Number(b.starred) - Number(a.starred) || b.at.localeCompare(a.at),
  );

  const noise = user ? await getNoise(user.id, since) : { list: [], count: 0 };

  const reading = unicas.filter((e) => e.reading).length;

  return {
    reading,
    scanned: await countScanned(since),
    discarded: noise.count,
    updatedAt: emails[0]?.triaged_at ?? null,
    urgent: unicas.filter((e) => e.urgent),
    // Lo que no pide nada baja al tercer montón aunque sea de los tuyos: saber
    // que una reserva entró bien tranquiliza, pero no es una tarea, y mezclarlo
    // con las que sí lo son es lo que hace que una lista deje de despacharse.
    rest: unicas.filter((e) => !e.urgent && e.actionable),
    fyi: unicas.filter((e) => !e.urgent && !e.actionable),
    noise: noise.list,
    feedPendientes: await contarFeedPendientes(),
  };
}

/**
 * Cuántos boletines han llegado desde la última síntesis.
 *
 * Aislado y con cero por defecto a propósito: el Feed es opcional y sus tablas
 * pueden no existir todavía —o tardar en aparecer en la caché de PostgREST,
 * que es lo que pasó la primera vez—. Un extra que no está montado no puede
 * tumbar la pantalla de inicio.
 */
async function contarFeedPendientes(): Promise<number> {
  try {
    const admin = createAdminClient();

    const { data: feeds, error } = await admin
      .from("feeds")
      .select("from_email");
    if (error) return 0;

    const remitentes = ((feeds ?? []) as { from_email: string }[]).map(
      (f) => f.from_email,
    );
    if (remitentes.length === 0) return 0;

    const { data: ultima } = await admin
      .from("feed_digests")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const desde =
      (ultima as { created_at: string } | null)?.created_at ??
      new Date(Date.now() - VENTANA_MS).toISOString();

    const { count } = await admin
      .from("emails")
      .select("id", { count: "exact", head: true })
      .in("from_email", remitentes)
      .gte("received_at", desde);

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * El mismo correo, una sola línea.
 *
 * Muchos avisos llegan a la vez a dos o tres buzones del negocio, o el colegio
 * escribe a los dos padres. Son el mismo mensaje con distinto destinatario, y
 * verlo repetido tres veces en el parte hace dudar de si son tres cosas
 * distintas. Se reconocen por remitente y asunto dentro de la misma hora.
 */
function dedupe(entries: ParteEntry[]): ParteEntry[] {
  const vistos = new Map<string, ParteEntry>();

  for (const entry of entries) {
    const hora = entry.at.slice(0, 13);
    const clave = `${entry.kind}:${entry.fromEmail ?? ""}:${entry.subject ?? entry.headline}:${hora}`;

    const anterior = vistos.get(clave);
    // Se queda el que más información tiene: uno leído gana a uno sin leer.
    if (!anterior || (anterior.reading && !entry.reading)) {
      vistos.set(clave, entry);
    }
  }

  return [...vistos.values()];
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
    reading: false,
    at: item.emails?.received_at ?? item.created_at,
    who: sourceLabel(item.emails?.from_email, item.emails?.from_name) ?? "",
    headline: item.title,
    detail: item.description,
    // Un compromiso ya lleva su fecha delante; el riesgo es de los correos.
    riesgo: null,
    when: whenLabel(item),
    fromEmail: item.emails?.from_email ?? null,
    subject: item.emails?.subject ?? null,
    actionable: true,
    link: null,
    gmailMessageId: item.gmail_message_id,
    starred: item.pinned,
    agenda: agendaDe(item),
  };
}

/**
 * Qué se puede hacer con este compromiso y el calendario.
 *
 * Solo los de tipo evento llegan al calendario: una acción con fecha límite
 * —"pagar antes del 30"— no es una cita y ponerla como tal llenaría la agenda
 * de bloques falsos. Es justo la distinción con la que nació la aplicación.
 */
function agendaDe(item: Item): "puede" | "puesto" | null {
  if (item.type !== "event") return null;
  if (item.google_event_id) return "puesto";
  if (!item.starts_at) return null;
  return "puede";
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
    // de que existiera el detalle, o si aún no se ha leído.
    detail: email.detail ?? email.snippet,
    riesgo: email.riesgo,
    reading: email.summary === null,
    when: null,
    fromEmail: email.from_email,
    subject: email.subject,
    actionable: email.actionable || email.summary === null,
    link: null,
    agenda: null,
    gmailMessageId: email.gmail_message_id,
    starred: email.triage_model === MARCA_USUARIO && email.importance === "alta",
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
): Promise<{ list: NoiseEntry[]; count: number }> {
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
    .select("id, from_email, from_name, subject")
    .gte("received_at", since)
    .eq("triage_category", "none")
    // Lo que descartaste tú no vuelve a ofrecerse para rescatar: ya lo
    // decidiste, y proponerte deshacerlo cada mañana es discutir contigo.
    .is("dismissed_at", null)
    .order("received_at", { ascending: false })
    .limit(NOISE_SHOWN);

  const list = ((data ?? []) as Pick<
    Email,
    "id" | "from_email" | "from_name" | "subject"
  >[]).map((row) => ({
    id: row.id,
    who: sourceLabel(row.from_email, row.from_name) ?? row.from_email,
    fromEmail: row.from_email,
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
