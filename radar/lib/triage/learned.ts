import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceLabel } from "@/lib/source-label";
import {
  buildIgnoredSection,
  buildStarredSection,
  subjectShape,
  type IgnoredExample,
  type StarredExample,
} from "@/lib/triage/learned-prompt";

export {
  buildIgnoredSection,
  buildStarredSection,
  type IgnoredExample,
  type StarredExample,
};

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

/**
 * Lo que ha marcado como importante a mano.
 *
 * Se reconocen por `triage_model = 'usuario'`: ese campo dice quién clasificó
 * el correo, y cuando la persona corrige al modelo pasa a ser ella. Sin esa
 * marca no habría forma de distinguir un "alta" que puso ella de uno que puso
 * el modelo, y el filtro acabaría aprendiendo de sus propias decisiones.
 */
export async function getStarredExamples(): Promise<StarredExample[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("emails")
    .select("from_email, from_name, subject")
    .eq("triage_model", USER_MARK)
    .eq("importance", "alta")
    .order("received_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  return group(
    (data ?? []) as {
      from_email: string;
      from_name: string | null;
      subject: string | null;
    }[],
  );
}

/** Quién clasificó el correo, cuando deja de ser el modelo. */
export const USER_MARK = "usuario";

function group(
  rows: { from_email: string; from_name: string | null; subject: string | null }[],
): StarredExample[] {
  const groups = new Map<string, StarredExample>();

  for (const row of rows) {
    const who = sourceLabel(row.from_email, row.from_name) ?? row.from_email;
    const subject = row.subject ?? "(sin asunto)";
    const key = `${who}::${subjectShape(subject)}`;

    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { who, subject, count: 1 });
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_EXAMPLES);
}
