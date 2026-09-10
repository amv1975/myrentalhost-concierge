import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceLabel } from "@/lib/source-label";
import {
  buildIgnoredSection,
  subjectShape,
  type IgnoredExample,
} from "@/lib/triage/learned-prompt";

export { buildIgnoredSection, type IgnoredExample };

/** Bastantes para que se vea el patrón, pocos para que el lote no engorde. */
const MAX_EXAMPLES = 20;

/**
 * Lo que ha descartado desde el parte.
 *
 * La señal está en los datos que la app genera al usarse: descartar un correo
 * es reclasificarlo como "esto no es mío", así que se reconocen por llevar
 * fecha de descarte y haber acabado en `none`. Un correo que el modelo ya
 * clasificó como ruido nunca llegó a enseñarse, así que nunca tiene esa fecha:
 * no hay forma de confundir la corrección de la persona con la del modelo.
 */
export async function getIgnoredExamples(): Promise<IgnoredExample[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("emails")
    .select("from_email, from_name, subject")
    .not("dismissed_at", "is", null)
    .eq("triage_category", "none")
    .order("dismissed_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as {
    from_email: string;
    from_name: string | null;
    subject: string | null;
  }[];

  // Agrupa por remitente y forma del asunto: descartar diez veces el mismo tipo
  // de aviso es una señal más fuerte que diez cosas distintas, y hay que
  // decírselo al modelo.
  const groups = new Map<string, IgnoredExample>();
  for (const row of rows) {
    const who = sourceLabel(row.from_email, row.from_name) ?? row.from_email;
    const subject = row.subject ?? "(sin asunto)";
    const key = `${who}::${subjectShape(subject)}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { who, subject, count: 1 });
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_EXAMPLES);
}
