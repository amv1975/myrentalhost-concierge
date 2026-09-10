export type SpaceKey = "family" | "work";
export type ItemType = "event" | "action";
export type ItemStatus =
  | "pending"
  | "confirmed"
  | "dismissed"
  | "done"
  | "needs_review";
export type ExtractionStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "skipped";
/**
 * De quién viene, o a quién llega.
 *
 * Los `to_*` existen porque en el trabajo lo estable no es el remitente —un
 * gestor o un proveedor escriben desde su propio dominio— sino el buzón al que
 * escriben.
 */
export type SourceKind = "domain" | "email" | "to_domain" | "to_email";
export type TriageCategory = "family" | "work" | "none";
export type TriageStatus = "pending" | "processing" | "done" | "failed";
export type Importance = "alta" | "normal" | "baja";

export interface Space {
  id: string;
  key: SpaceKey;
  name: string;
  /** Qué entra en esta vida. Lo lee el clasificador para decidir. */
  description: string | null;
  timezone: string;
  default_location: string | null;
  google_calendar_id: string;
  auto_confirm_enabled: boolean;
  auto_confirm_threshold: number;
  lookback_days: number;
}

export interface Source {
  id: string;
  space_id: string;
  kind: SourceKind;
  value: string;
  enabled: boolean;
}

export interface Email {
  id: string;
  /** Null hasta que el clasificador decide de qué vida es. */
  space_id: string | null;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  received_at: string;
  recipients: string[];
  /** Envío masivo: trae List-Unsubscribe. Casi siempre es ruido. */
  bulk: boolean;
  triage_status: TriageStatus;
  triage_category: TriageCategory | null;
  /** De qué va, en una frase. Lo pone el clasificador. */
  summary: string | null;
  /** Si pide algo concreto; solo entonces se le buscan compromisos. */
  actionable: boolean;
  importance: Importance;
  triaged_at: string | null;
  extraction_status: ExtractionStatus;
  extraction_attempts: number;
  extraction_error: string | null;
  extracted_at: string | null;
}

export interface Item {
  id: string;
  space_id: string;
  email_id: string;
  gmail_message_id: string;
  item_index: number;
  type: ItemType;
  title: string;
  normalized_title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  due_date: string | null;
  location: string | null;
  confidence: number;
  status: ItemStatus;
  dedupe_key: string;
  supersedes_item_id: string | null;
  superseded_by_item_id: string | null;
  changed_fields: ChangedFields | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  synced_at: string | null;
  sync_error: string | null;
  /** Fijado arriba a mano: importa por encima de cuándo cae. */
  pinned: boolean;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Del correo de origen, para poder enlazar a él. Se rellena en la consulta. */
  email_subject?: string | null;
  email_from?: string | null;
  email_from_name?: string | null;
}

/** Qué cambió respecto al ítem al que este sustituye, para el diff en la UI. */
export type ChangedFields = Record<
  string,
  { before: string | null; after: string | null }
>;

/** El espacio en la URL va en español; la clave en base de datos, en inglés. */
export const SPACE_SLUGS: Record<string, SpaceKey> = {
  familia: "family",
  trabajo: "work",
};

export const SLUG_BY_SPACE: Record<SpaceKey, string> = {
  family: "familia",
  work: "trabajo",
};

export function slugToSpaceKey(slug: string): SpaceKey | null {
  return SPACE_SLUGS[slug] ?? null;
}

/**
 * Cómo se llama cada espacio en la interfaz.
 *
 * Vive aquí y no en la base de datos a propósito: los espacios son dos y no
 * van a cambiar, así que renombrarlos debe ser editar una línea y desplegar,
 * no ejecutar SQL a mano contra producción. `spaces.name` sigue existiendo
 * para el seed y para los mensajes del backend.
 */
export const SPACE_LABELS: Record<SpaceKey, string> = {
  family: "Family",
  work: "Work",
};

export function spaceLabel(key: SpaceKey): string {
  return SPACE_LABELS[key];
}
