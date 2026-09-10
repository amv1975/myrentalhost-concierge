import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Qué columnas espera el código y cuáles tiene de verdad la base de datos.
 *
 * Existe porque las dos se separaron sin que nadie se enterara: una migración
 * se aplicó a medias, el código siguió adelante, y el fallo salió horas después
 * como un "Could not find the 'bulk' column" en mitad de una actualización.
 * Ese error dice la verdad pero llega tarde y de uno en uno.
 *
 * Aquí se comprueban todas de golpe. El truco: pedirle a PostgREST un select
 * con todas las columnas esperadas y cero filas. Si falta alguna, contesta con
 * su nombre; se quita de la lista y se vuelve a preguntar. En dos o tres
 * vueltas están todas las que faltan, sin necesidad de permisos especiales ni
 * de consultar el catálogo de Postgres.
 */

const ESPERADO: Record<string, string[]> = {
  emails: [
    "space_id", "gmail_message_id", "gmail_thread_id", "from_email",
    "from_name", "subject", "snippet", "body_text", "received_at",
    "recipients", "bulk", "triage_status", "triage_category", "summary",
    "detail", "link_note", "actionable", "importance", "triage_model",
    "triaged_at", "dismissed_at", "extraction_status", "extraction_attempts",
  ],
  items: [
    "space_id", "email_id", "type", "title", "normalized_title", "starts_at",
    "due_date", "status", "dedupe_key", "pinned", "google_event_id",
  ],
  spaces: [
    "key", "name", "description", "timezone", "google_calendar_id",
    "lookback_days", "auto_confirm_enabled",
  ],
  sync_runs: [
    "kind", "status", "messages_seen", "messages_new", "input_tokens",
    "output_tokens", "cost_usd",
  ],
};

export interface SchemaCheck {
  ok: boolean;
  /** "emails.bulk", "sync_runs.cost_usd"… */
  missing: string[];
  /** Si la comprobación en sí no se pudo hacer. */
  error?: string;
}

export async function checkSchema(): Promise<SchemaCheck> {
  const admin = createAdminClient();
  const missing: string[] = [];

  try {
    for (const [table, columns] of Object.entries(ESPERADO)) {
      let pending = [...columns];

      // Una vuelta por columna que falte, más una final para confirmar.
      for (let round = 0; round <= columns.length; round++) {
        const { error } = await admin
          .from(table)
          .select(pending.join(","))
          .limit(0);
        if (!error) break;

        const name = columnFromError(error.message);
        if (!name || !pending.includes(name)) {
          return {
            ok: false,
            missing,
            error: `${table}: ${error.message}`,
          };
        }

        missing.push(`${table}.${name}`);
        pending = pending.filter((column) => column !== name);
      }
    }

    return { ok: missing.length === 0, missing };
  } catch (error) {
    return {
      ok: false,
      missing,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** PostgREST dice: Could not find the 'bulk' column of 'emails' in the schema cache */
function columnFromError(message: string): string | null {
  return /the '([^']+)' column/.exec(message)?.[1] ?? null;
}
