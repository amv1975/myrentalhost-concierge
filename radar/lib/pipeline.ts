import "server-only";
import { ingestInbox } from "@/lib/ingest/ingest";
import { triagePending } from "@/lib/triage/run";
import { buildTriageContext } from "@/lib/triage/context";
import { extractPending } from "@/lib/extraction/run";
import { syncSpace } from "@/lib/calendar/sync";
import type { Space } from "@/lib/types";

export interface PipelineResult {
  /** Correos nuevos descargados del buzón. */
  messagesNew: number;
  /** Correos clasificados en esta pasada. */
  read: number;
  family: number;
  work: number;
  ignored: number;
  created: number;
  updated: number;
  errors: string[];
}

/**
 * El ciclo completo, en orden: traer, clasificar, extraer, sincronizar.
 *
 * Está en un solo sitio a propósito. El botón Actualizar y el cron hacen
 * exactamente lo mismo; si fueran dos secuencias distintas acabarían
 * divergiendo y lo que ves al pulsar no sería lo que pasa por la noche.
 *
 * Cada etapa captura su propio error y devuelve lo que llevaba hecho: que
 * Gmail corte por cuota no puede impedir que se clasifique lo ya descargado,
 * ni que un fallo de calendario borre el trabajo de extracción.
 */
export async function runPipeline(spaces: Space[]): Promise<PipelineResult> {
  const result: PipelineResult = {
    messagesNew: 0,
    read: 0,
    family: 0,
    work: 0,
    ignored: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  if (spaces.length === 0) return result;

  // El buzón es uno solo; la ventana, la más amplia de las configuradas.
  const lookbackDays = Math.max(...spaces.map((s) => s.lookback_days || 14));

  const ingested = await ingestInbox(spaces, lookbackDays);
  result.messagesNew = ingested.messagesNew;
  if (ingested.error) result.errors.push(ingested.error);

  const triaged = await triagePending(
    spaces,
    await buildTriageContext(spaces),
  );
  result.read = triaged.read;
  result.family = triaged.family;
  result.work = triaged.work;
  result.ignored = triaged.ignored;
  if (triaged.error) result.errors.push(triaged.error);

  for (const space of spaces) {
    const extracted = await extractPending(space);
    result.created += extracted.created;
    result.updated += extracted.updated;
    if (extracted.error) result.errors.push(extracted.error);

    const synced = await syncSpace(space);
    if (synced.error) result.errors.push(synced.error);
  }

  return result;
}
