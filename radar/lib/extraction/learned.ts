import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lo que has descartado en un espacio, para que la extracción deje de traerlo.
 *
 * Sale de los ítems con estado `dismissed`: no hace falta una lista aparte,
 * porque descartar algo YA es decir que no te interesa. La señal está en los
 * datos que la app genera al usarse.
 *
 * Se pasan al modelo como ejemplos y no como una lista de palabras prohibidas,
 * a propósito: así generaliza. Quien descarta "Entrada del huésped en Balmes"
 * tampoco quiere "Salida del huésped en Consell de Cent", y un filtro por
 * texto no lo vería.
 */

import {
  buildLearnedSection,
  type DismissedExample,
} from "@/lib/extraction/learned-prompt";

export { buildLearnedSection, type DismissedExample };

/** Suficientes para que se vea el patrón, pocos para que el prompt no engorde. */
const MAX_EXAMPLES = 20;

export async function getDismissedExamples(
  spaceId: string,
): Promise<DismissedExample[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("items")
    .select("title, type, normalized_title")
    .eq("space_id", spaceId)
    .eq("status", "dismissed")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as {
    title: string;
    type: string;
    normalized_title: string;
  }[];

  // Agrupa por título normalizado: descartar diez veces lo mismo es una señal
  // más fuerte que descartar diez cosas distintas, y se lo decimos al modelo.
  const groups = new Map<string, DismissedExample>();
  for (const row of rows) {
    const existing = groups.get(row.normalized_title);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(row.normalized_title, {
        title: row.title,
        type: row.type,
        count: 1,
      });
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_EXAMPLES);
}
