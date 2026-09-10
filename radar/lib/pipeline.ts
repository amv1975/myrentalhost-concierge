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
import { deadlineIn, type Deadline } from "@/lib/deadline";
import type { Space } from "@/lib/types";
import { describeError } from "@/lib/errors";

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
  /** Cuántos quedan sin leer después de esta pasada. Si es >0, hay que repetir. */
  remaining: number;
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
   * fetch"— y entonces no avanzas nada y encima no sabes por qué. Veinticinco
   * segundos siempre llegan, y quien llama vuelve a llamar hasta terminar.
   */
  totalMs = 25_000,
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

  // El buzón es uno solo; la ventana, la más amplia de las configuradas.
  const lookbackDays = Math.max(...spaces.map((s) => s.lookback_days || 14));

  // Con la cola llena, bajar más correos es cavar más hondo el agujero: el
  // tiempo de esta pasada rinde mucho más vaciándola.
  const backlog = await countBacklog();
  if (backlog < BACKLOG_LIMIT) {
    const ingested = await ingestInbox(accessToken, spaces, lookbackDays, plazo);
    result.messagesNew = ingested.messagesNew;
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

  const gated = await gatePending(spaces, context, spend, plazo);
  result.screened = gated.screened;
  result.discarded = gated.discarded;
  if (gated.error) result.errors.push(gated.error);

  const triaged = await triagePending(accessToken, spaces, context, spend, plazo);
  result.read = triaged.read;
  result.family = triaged.family;
  result.work = triaged.work;
  if (triaged.error) result.errors.push(triaged.error);

  // Va después de resumir porque cruza los resúmenes, no los correos en crudo,
  // y antes de extraer porque no depende de los compromisos.
  // El cruce solo tiene sentido con los resúmenes ya hechos, así que si no dio
  // tiempo a resumir, tampoco se cruza: se hace en la siguiente pasada.
  if (plazo.ok()) {
    const linked = await connectRecent(spend);
    if (linked.error) result.errors.push(linked.error);
  }

  for (const space of spaces) {
    const extracted = await extractPending(space, spend, plazo);
    result.created += extracted.created;
    result.updated += extracted.updated;
    if (extracted.error) result.errors.push(extracted.error);

    // Sincronizar toca el calendario de verdad: si no hay tiempo para hacerlo
    // entero, mejor no empezarlo.
    if (plazo.ok()) {
      const synced = await syncSpace(space);
      if (synced.error) result.errors.push(synced.error);
    }
  }

  result.costUsd = spend.usd;
  result.remaining = await countUnread();
  await recordSpend(spend, result);

  return result;
}

/** Con más de esto en cola, esta pasada no baja correos nuevos. */
const BACKLOG_LIMIT = 60;

/** Lo que falta por clasificar o por leer. */
async function countBacklog(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .is("triaged_at", null);
  return count ?? 0;
}

/** Lo que ya se sabe que es tuyo y todavía no se ha leído entero. */
async function countUnread(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("emails")
    .select("id", { count: "exact", head: true })
    .not("space_id", "is", null)
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
    error: result.errors[0] ?? null,
  });

  if (error) {
    result.errors.push(`No se pudo apuntar el gasto: ${error.message}`);
  }
}
