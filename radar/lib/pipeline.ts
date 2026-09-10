import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import { ingestInbox } from "@/lib/ingest/ingest";
import { gatePending } from "@/lib/triage/gate";
import { triagePending } from "@/lib/triage/run";
import { connectRecent } from "@/lib/triage/connect";
import { buildTriageContext } from "@/lib/triage/context";
import { extractPending } from "@/lib/extraction/run";
import { syncSpace } from "@/lib/calendar/sync";
import { Spend } from "@/lib/usage";
import { deadlineIn, porcion, type Deadline } from "@/lib/deadline";
import type { Space } from "@/lib/types";
import { describeError } from "@/lib/errors";
import {
  CATEGORIAS_PROPIAS,
  CRITERIO_ACTUAL,
  ESTADOS_LEIBLES,
  MARCA_USUARIO,
} from "@/lib/triage/estados";

export interface PipelineResult {
  /** Correos nuevos vistos en el buzón (solo cabeceras). */
  messagesNew: number;
  /** Mirados por encima, con el asunto. */
  screened: number;
  /** Descartados ahí mismo por ruido, sin llegar a abrirse. */
  discarded: number;
  /** Leídos enteros y resumidos. */
  read: number;
  family: number;
  work: number;
  created: number;
  updated: number;
  /** Lo que ha costado esta pasada, en dólares. */
  costUsd: number;
  /** Cuántos quedan sin leer después de esta pasada. */
  remaining: number;
  /** Cuántos quedan sin mirar siquiera. Los dos juntos son el trabajo que falta. */
  pendingScreen: number;
  /**
   * Etapas que pararon por falta de tiempo.
   *
   * No son fallos. El pipeline está pensado para varias pasadas cortas, así
   * que una etapa que dice "hasta aquí" y deja el resto para luego está
   * haciendo exactamente su trabajo. Mezclarlas con los errores pintaba de
   * rojo todas las pasadas y escondía los fallos de verdad.
   */
  parciales: string[];
  errors: string[];
}

/**
 * El ciclo completo, en orden y en un solo sitio.
 *
 * El orden es la arquitectura entera del coste, y va de barato a caro:
 *
 *  1. **Cabeceras** — se baja de Gmail el remitente, el asunto y dos líneas de
 *     vista previa de todo lo que ha entrado. Gratis.
 *  2. **Filtro por asunto** — veinte correos por llamada al modelo más barato,
 *     que dice de qué vida es cada uno o si es ruido. Aquí muere el 95%, por
 *     una fracción de céntimo cada uno.
 *  3. **Lectura** — a los supervivientes se les baja el cuerpo y se les paga un
 *     resumen. Son unos pocos al día.
 *  4. **Cruce** — una sola llamada sobre los resúmenes del día, mirándolos
 *     juntos, para ver lo que no se ve de uno en uno: que la queja de una
 *     huésped explica la suspensión de un anuncio.
 *  5. **Extracción** — solo a los que además piden algo se les buscan
 *     compromisos con fechas. Es la llamada cara, y la que menos veces ocurre.
 *  6. **Calendario** — lo confirmado se sincroniza.
 *
 * Está aquí y no repartido porque el botón Actualizar y el cron hacen
 * exactamente lo mismo; si fueran dos secuencias, acabarían divergiendo y lo
 * que ves al pulsar no sería lo que pasa por la noche.
 *
 * Cada etapa captura su propio error y devuelve lo que llevaba hecho: que
 * Gmail corte por cuota no puede impedir que se clasifique lo ya descargado.
 */
export async function runPipeline(
  spaces: Space[],
  /**
   * Cuánto puede durar esta pasada.
   *
   * No son los 60 s que da Vercel a propósito. Una petición de un minuto desde
   * un móvil con la pantalla encendida a medias se muere sola —"Failed to
   * fetch"— y entonces no avanzas nada y encima no sabes por qué. Treinta y
   * cinco llegan bien, y quien llama vuelve a llamar hasta terminar.
   */
  totalMs = 35_000,
): Promise<PipelineResult> {
  const plazo: Deadline = deadlineIn(totalMs);
  const spend = new Spend();
  const result: PipelineResult = {
    messagesNew: 0,
    screened: 0,
    discarded: 0,
    read: 0,
    family: 0,
    work: 0,
    created: 0,
    updated: 0,
    costUsd: 0,
    remaining: 0,
    pendingScreen: 0,
    parciales: [],
    errors: [],
  };

  if (spaces.length === 0) return result;

  // Conseguir el token es lo primero que puede fallar —permiso caducado, red,
  // Google de mal humor— y hasta ahora reventaba sin decir por qué.
  let accessToken: string;
  try {
    const userId = await getIngestUserId(spaces[0].id);
    if (!userId) {
      result.errors.push(
        "No hay credenciales de Google guardadas. Entra una vez en la app para concederlas.",
      );
      return result;
    }
    accessToken = await getAccessToken(userId);
  } catch (error) {
    result.errors.push(
      describeError(error),
    );
    return result;
  }

  const desde = await desdeCuandoMirar();

  // Con la cola llena, bajar más correos es cavar más hondo el agujero: el
  // tiempo de esta pasada rinde mucho más vaciándola.
  const backlog = await countBacklog();
  if (backlog < BACKLOG_LIMIT) {
    const ingested = await ingestInbox(
      accessToken,
      spaces,
      desde,
      porcion(plazo, REPARTO.bajar),
    );
    result.messagesNew = ingested.messagesNew;
    if (ingested.parcial) result.parciales.push(ingested.parcial);
    if (ingested.error) result.errors.push(ingested.error);
  }

  let context;
  try {
    context = await buildTriageContext(spaces);
  } catch (error) {
    result.errors.push(
      `No se pudo leer la configuración de los espacios: ${
        describeError(error)
      }`,
    );
    return result;
  }

  const gated = await gatePending(
    spaces,
    context,
    spend,
    porcion(plazo, REPARTO.filtrar),
  );
  result.screened = gated.screened;
  result.discarded = gated.discarded;
  if (gated.parcial) result.parciales.push(gated.parcial);
  if (gated.error) result.errors.push(gated.error);

  // La lectura va con el plazo entero, no con una porción: es la etapa que
  // produce lo que se ve, y lo que le sobre a las anteriores es suyo.
  const triaged = await triagePending(accessToken, spaces, context, spend, plazo);
  result.read = triaged.read;
  result.family = triaged.family;
  result.work = triaged.work;
  if (triaged.parcial) result.parciales.push(triaged.parcial);
  if (triaged.error) result.errors.push(triaged.error);

  // Va después de resumir porque cruza los resúmenes, no los correos en crudo,
  // y antes de extraer porque no depende de los compromisos.
  // El cruce compara resúmenes, así que con media cola sin resumir compararía
  // textos vacíos, pagaría por ello y además borraría las notas de la pasada
  // anterior. Solo cuando ya no queda nada por leer.
  result.remaining = await countUnread();

  if (plazo.ok() && result.remaining === 0) {
    const linked = await connectRecent(spend);
    if (linked.error) result.errors.push(linked.error);
  }

  for (const space of spaces) {
    const extracted = await extractPending(space, spend, plazo);
    result.created += extracted.created;
    result.updated += extracted.updated;
    if (extracted.parcial) result.parciales.push(extracted.parcial);
    if (extracted.error) result.errors.push(extracted.error);

    // Sincronizar toca el calendario de verdad: si no hay tiempo para hacerlo
    // entero, mejor no empezarlo.
    if (plazo.ok()) {
      const synced = await syncSpace(space);
      if (synced.error) result.errors.push(synced.error);
    }
  }

  result.costUsd = spend.usd;
  // Se vuelve a contar al final: el filtro puede haber convertido correos sin
  // mirar en correos por leer, y quien llama necesita el trabajo que queda de
  // verdad, no el de hace veinte segundos.
  result.remaining = await countUnread();
  result.pendingScreen = await countBacklog();
  await recordSpend(spend, result);

  return result;
}

/** Con más de esto en cola, esta pasada no baja correos nuevos. */
const BACKLOG_LIMIT = 60;

/**
 * Cuánto puede llevarse cada etapa antes de dejar paso.
 *
 * Sin este reparto, la descarga se comía el plazo entero y la lectura no leía
 * ni un correo — pasada tras pasada, con el contador clavado. Bajar y filtrar
 * tienen techo; leer se queda con lo que sobre, porque es la única etapa que
 * produce algo que se ve en pantalla.
 */
const REPARTO = {
  bajar: 8_000,
  filtrar: 10_000,
};

/**
 * Cuánto se solapa con la pasada anterior.
 *
 * Un correo puede llegar a Gmail con la fecha ligeramente movida, y entre que
 * una pasada termina y se guarda pasan segundos. Media hora de solape no
 * cuesta nada —los mensajes ya guardados ni se piden— y evita el único fallo
 * que sería grave aquí: saltarse un correo para siempre.
 */
const SOLAPE_MS = 30 * 60_000;

/** Lo máximo que se mira hacia atrás la primera vez, o tras un parón largo. */
const VENTANA_MAX_MS = 2 * 86_400_000;

/**
 * Desde cuándo hay que mirar el buzón.
 *
 * Desde que terminó la última ingesta buena, con un poco de solape. Antes se
 * pedía una ventana fija en cada pasada —catorce días— y cada actualización
 * volvía a recorrer miles de mensajes ya guardados para descubrir que ya
 * estaban guardados: media hora de trabajo para no traer nada.
 *
 * El tope existe para el primer día y para cuando la app lleva tiempo parada:
 * el parte enseña dos días, así que traer más sería bajar correos que no se
 * van a mirar.
 */
async function desdeCuandoMirar(): Promise<Date> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("sync_runs")
    .select("finished_at")
    .eq("kind", "ingest")
    .eq("status", "ok")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tope = Date.now() - VENTANA_MAX_MS;
  const ultima = (data as { finished_at: string } | null)?.finished_at;
  if (!ultima) return new Date(tope);

  return new Date(Math.max(Date.parse(ultima) - SOLAPE_MS, tope));
}

/**
 * Lo que le falta por mirar al filtro por asunto.
 *
 * Tiene que contar lo mismo que selecciona gatePending, y eso ya no es solo
 * "nunca lo ha mirado nadie": también vuelve lo que un criterio retirado tiró
 * a la basura. Si contara de menos, el botón diría que no queda trabajo con
 * quinientos correos esperando, y además el pipeline seguiría bajando correos
 * nuevos en vez de vaciar la cola.
 */
async function countBacklog(): Promise<number> {
  const admin = createAdminClient();

  const base = () =>
    admin
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("triage_category", "none")
      .is("dismissed_at", null);

  const [nuevos, caducados, sinSello] = await Promise.all([
    admin
      .from("emails")
      .select("id", { count: "exact", head: true })
      .is("triaged_at", null),
    base()
      .neq("triage_model", CRITERIO_ACTUAL)
      .neq("triage_model", MARCA_USUARIO),
    base().is("triage_model", null),
  ]);

  return (nuevos.count ?? 0) + (caducados.count ?? 0) + (sinSello.count ?? 0);
}

/**
 * Lo que la siguiente pasada va a intentar leer.
 *
 * Tiene que coincidir exactamente con lo que selecciona triagePending. Si
 * contara de más —correos que ninguna etapa va a tocar— el número no bajaría
 * nunca de ahí y quien llama seguiría llamando en balde.
 */
async function countUnread(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .in("triage_status", [...ESTADOS_LEIBLES])
    .in("triage_category", [...CATEGORIAS_PROPIAS])
    .not("triaged_at", "is", null)
    .is("summary", null)
    .is("dismissed_at", null);
  return count ?? 0;
}

/**
 * Deja constancia de lo gastado, para poder sumar el mes.
 *
 * Sin esto, el importe solo existiría mientras la pantalla está abierta y no
 * habría forma de contestar a "¿cuánto llevo?" sin ir a la factura.
 */
async function recordSpend(
  spend: Spend,
  result: PipelineResult,
): Promise<void> {
  const admin = createAdminClient();
  // Apuntar lo gastado es contabilidad, no trabajo: si falla, se pierde una
  // línea del histórico, no la actualización que el usuario acaba de pedir.
  // El estado solo se pone en rojo por un fallo de verdad. Una etapa que se
  // quedó a medias por tiempo se apunta igual —hay que poder verla— pero la
  // pasada cuenta como buena, que es lo que fue.
  const nota = result.errors[0] ?? result.parciales[0] ?? null;
  const { error } = await admin.from("sync_runs").insert({
    kind: "triage",
    status: result.errors.length > 0 ? "error" : "ok",
    finished_at: new Date().toISOString(),
    messages_seen: result.screened,
    messages_new: result.messagesNew,
    items_created: result.created,
    items_updated: result.updated,
    input_tokens: spend.inputTokens,
    output_tokens: spend.outputTokens,
    cost_usd: spend.usd,
    error: nota,
  });

  if (error) {
    result.errors.push(`No se pudo apuntar el gasto: ${error.message}`);
  }
}
