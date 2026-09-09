import type { ChangedFields, Item } from "@/lib/types";

/**
 * Título normalizado para comparar: sin tildes, sin mayúsculas, sin puntuación
 * y sin las palabras de relleno que el colegio y los canales de reserva cambian
 * de un correo al siguiente ("recordatorio: reunión" y "RECORDATORI reunió" han
 * de colisionar).
 */
export function normalizeTitle(title: string): string {
  const words = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);

  const meaningful = words.filter((word) => !STOP_WORDS.has(word));

  // Un título que fuera solo palabras vacías dejaría la clave en blanco, y
  // entonces colisionaría con cualquier otro igual de vacío. Mejor conservarlo
  // entero que producir una clave que empareja lo que no debe.
  return (meaningful.length > 0 ? meaningful : words).join(" ").trim();
}

const STOP_WORDS = new Set([
  // Castellano
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "a", "en", "y", "o", "que", "para", "por", "con", "su", "sus", "se", "es",
  "recordatorio", "importante", "aviso", "informacion", "nuevo", "nueva",
  // Catalán
  "els", "les", "uns", "unes", "dels", "als", "i", "amb", "per",
  "recordatori", "informacio", "nou", "nova",
]);

/**
 * Clave estable derivada del contenido, no de la posición del ítem en la
 * respuesta del modelo. Un reintento de extracción reconoce así sus propios
 * ítems aunque vengan en otro orden.
 */
export function buildDedupeKey(params: {
  type: string;
  normalizedTitle: string;
  date: string | null;
}): string {
  return [params.type, params.date ?? "sin-fecha", params.normalizedTitle].join(
    "|",
  );
}

/**
 * Similitud de Dice sobre bigramas. Devuelve 0..1. Tolera reordenamientos y
 * cambios de una palabra, que es exactamente lo que pasa entre "Reunión de
 * padres 2º B" y "Reunión padres 2n B".
 */
export function titleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (text: string) => {
    const result = new Map<string, number>();
    for (let i = 0; i < text.length - 1; i++) {
      const pair = text.slice(i, i + 2);
      result.set(pair, (result.get(pair) ?? 0) + 1);
    }
    return result;
  };

  const first = bigrams(a);
  const second = bigrams(b);
  let shared = 0;
  let total = 0;

  for (const count of first.values()) total += count;
  for (const [pair, count] of second) {
    total += count;
    const inFirst = first.get(pair) ?? 0;
    shared += Math.min(inFirst, count);
  }

  return total === 0 ? 0 : (2 * shared) / total;
}

export interface CandidateItem {
  type: string;
  normalizedTitle: string;
  dedupeKey: string;
  /** AAAA-MM-DD del evento o de la fecha límite. */
  date: string | null;
  threadId: string;
}

export interface ExistingItem extends Pick<
  Item,
  | "id"
  | "type"
  | "normalized_title"
  | "dedupe_key"
  | "status"
  | "starts_at"
  | "due_date"
  | "google_event_id"
  | "title"
  | "description"
  | "location"
  | "all_day"
> {
  gmail_thread_id: string;
}

const SIMILARITY_THRESHOLD = 0.72;
const DATE_WINDOW_DAYS = 14;

/**
 * Busca, entre los ítems ya guardados del espacio, el que representa el mismo
 * compromiso que el candidato.
 *
 * Esto es lo que distingue "el cole cambió la hora de la reunión" de "hay una
 * reunión nueva". El constraint de base de datos no lo puede hacer: el aviso de
 * cambio llega en OTRO correo, con otro gmail_message_id.
 *
 * Dos señales, en orden de fiabilidad:
 *   1. Mismo hilo de Gmail y título parecido. Cuando el colegio responde sobre
 *      la misma convocatoria, es la señal más fuerte que hay.
 *   2. Título muy parecido dentro de una ventana de fechas. Cubre el caso de
 *      que el aviso llegue como correo suelto.
 *
 * Devuelve null cuando no hay match: ante la duda, un ítem nuevo que se revisa
 * es mucho menos dañino que machacar un compromiso que no era el mismo.
 */
export function findMatchingItem<T extends ExistingItem>(
  candidate: CandidateItem,
  existing: T[],
): T | null {
  // Un ítem descartado a mano no se resucita: si el correo vuelve a mencionarlo,
  // se queda descartado.
  const live = existing.filter((item) => item.status !== "dismissed");

  // El tipo se comprueba aparte de la clave. La clave ya lo incluye, pero un
  // evento y una acción nunca son el mismo compromiso, y no conviene que esa
  // garantía dependa del formato de una cadena.
  const sameType = live.filter((item) => item.type === candidate.type);

  const sameKey = sameType.find(
    (item) => item.dedupe_key === candidate.dedupeKey,
  );
  if (sameKey) return sameKey;

  const scored = sameType
    .map((item) => ({
      item,
      similarity: titleSimilarity(candidate.normalizedTitle, item.normalized_title),
      sameThread: item.gmail_thread_id === candidate.threadId,
      dayGap: dayGap(candidate.date, existingDate(item)),
    }))
    .filter(({ similarity, sameThread, dayGap: gap }) => {
      if (similarity < SIMILARITY_THRESHOLD) return false;
      if (sameThread) return true;
      return gap !== null && gap <= DATE_WINDOW_DAYS;
    })
    .sort((a, b) => {
      if (a.sameThread !== b.sameThread) return a.sameThread ? -1 : 1;
      return b.similarity - a.similarity;
    });

  return scored[0]?.item ?? null;
}

function existingDate(item: Pick<ExistingItem, "starts_at" | "due_date">): string | null {
  if (item.starts_at) return item.starts_at.slice(0, 10);
  return item.due_date;
}

function dayGap(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const diff = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(diff)) return null;
  return Math.abs(diff) / 86_400_000;
}

/**
 * Qué ha cambiado respecto al ítem anterior. Vacío significa que el correo
 * repite lo mismo y no hay nada que revisar.
 */
export function diffItems(
  previous: ExistingItem,
  next: {
    title: string;
    description: string | null;
    startsAt: Date | null;
    dueDate: string | null;
    location: string | null;
  },
): ChangedFields {
  const changes: ChangedFields = {};

  const compare = (
    field: string,
    before: string | null,
    after: string | null,
  ) => {
    const a = before?.trim() || null;
    const b = after?.trim() || null;
    if (a !== b) changes[field] = { before: a, after: b };
  };

  compare("title", previous.title, next.title);
  compare("description", previous.description, next.description);
  compare("location", previous.location, next.location);
  compare(
    "starts_at",
    previous.starts_at ? new Date(previous.starts_at).toISOString() : null,
    next.startsAt ? next.startsAt.toISOString() : null,
  );
  compare("due_date", previous.due_date, next.dueDate);

  return changes;
}
