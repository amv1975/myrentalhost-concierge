import type { Item } from "@/lib/types";

/**
 * Decide si un ítem tiene que subir al calendario. Sin efectos: la
 * sincronización de verdad vive en sync.ts, y esto es solo la regla.
 *
 * Es lo único que impide que ejecutar la sincronización cada hora sobre los
 * mismos ítems confirmados acabe creando un evento por ejecución.
 */
export function needsSync(
  item: Pick<
    Item,
    "status" | "starts_at" | "google_event_id" | "synced_at" | "updated_at"
  >,
): boolean {
  // Descartado: solo hay trabajo si llegó a estar en el calendario.
  if (item.status === "dismissed") return item.google_event_id !== null;

  if (!item.starts_at) return false;

  // Nunca subió.
  if (!item.google_event_id || !item.synced_at) return true;

  // Subió, pero el compromiso cambió después: hay que actualizar el evento.
  return Date.parse(item.updated_at) > Date.parse(item.synced_at);
}
