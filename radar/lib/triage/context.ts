import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TriageContext } from "@/lib/triage/prompt";
import type { Space } from "@/lib/types";

/**
 * Qué necesita saber el clasificador antes de leer nada.
 *
 * Las descripciones viven en `spaces.description` y no en el código porque son
 * lo único que hay que ajustar cuando clasifica mal: se editan en un sitio y el
 * comportamiento cambia sin tocar el prompt.
 */
export async function buildTriageContext(
  spaces: Space[],
): Promise<TriageContext> {
  const admin = createAdminClient();

  const byKey = new Map(spaces.map((s) => [s.key, s]));

  const { data: accounts } = await admin.from("google_accounts").select("email");
  const { data: allowed } = await admin.from("allowed_members").select("email");

  const own = new Set<string>();
  for (const row of [...(accounts ?? []), ...(allowed ?? [])] as {
    email: string;
  }[]) {
    if (row.email) own.add(row.email.trim().toLowerCase());
  }

  return {
    familyDescription:
      byKey.get("family")?.description ??
      "La vida familiar: colegio, salud, casa y administración doméstica.",
    workDescription:
      byKey.get("work")?.description ??
      "El negocio: clientes, proveedores, facturación y normativa.",
    ownAddresses: [...own],
  };
}
