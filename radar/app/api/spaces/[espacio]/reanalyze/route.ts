import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { extractPending } from "@/lib/extraction/run";
import { slugToSpaceKey, type Item } from "@/lib/types";

export const maxDuration = 300;

/**
 * Vuelve a analizar los correos del espacio.
 *
 * Sirve para cuando cambian las reglas de extracción: sin esto, los ítems
 * viejos se quedan como los dejó el prompt anterior, porque un correo ya
 * analizado nunca se reprocesa.
 *
 * Deja en paz lo que ya has decidido. Solo se reanaliza un correo si NINGUNO
 * de sus ítems está confirmado o hecho: si un compromiso ya está en tu
 * calendario, reanalizarlo podría duplicarlo o dejar el evento huérfano.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ espacio: string }> },
) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) {
    return NextResponse.json({ error: "Espacio desconocido" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const space = await getSpaceByKey(key);
  if (!space) {
    return NextResponse.json({ error: "Espacio desconocido" }, { status: 404 });
  }
  await assertSpaceMember(user.id, space.id);

  const admin = createAdminClient();

  const { data: itemRows, error: itemsError } = await admin
    .from("items")
    .select("id, email_id, status")
    .eq("space_id", space.id);
  if (itemsError) throw itemsError;

  const items = (itemRows ?? []) as Pick<Item, "id" | "email_id" | "status">[];

  // Correos que tocaron el calendario o que ya cerraste: intocables.
  const locked = new Set(
    items
      .filter((i) => i.status === "confirmed" || i.status === "done")
      .map((i) => i.email_id),
  );

  const removable = items.filter(
    (i) => !locked.has(i.email_id) && i.status !== "confirmed" && i.status !== "done",
  );

  if (removable.length > 0) {
    // supersedes_item_id se limpia solo: la clave externa está en ON DELETE SET NULL.
    const { error } = await admin
      .from("items")
      .delete()
      .in(
        "id",
        removable.map((i) => i.id),
      );
    if (error) throw error;
  }

  // Solo los que el clasificador marcó como que piden algo. Reanalizar los
  // demás sería pagarle al modelo caro por lo que ya se descartó por barato.
  const { data: emailRows, error: emailsError } = await admin
    .from("emails")
    .select("id")
    .eq("space_id", space.id)
    .eq("actionable", true);
  if (emailsError) throw emailsError;

  const toReprocess = ((emailRows ?? []) as { id: string }[])
    .map((e) => e.id)
    .filter((id) => !locked.has(id));

  if (toReprocess.length > 0) {
    const { error } = await admin
      .from("emails")
      .update({
        extraction_status: "pending",
        extraction_attempts: 0,
        extraction_error: null,
      })
      .in("id", toReprocess);
    if (error) throw error;
  }

  const result = await extractPending(space, toReprocess.length || 1);

  return NextResponse.json(
    {
      reanalyzed: toReprocess.length,
      kept: locked.size,
      created: result.created,
      failed: result.failed,
      error: result.error,
    },
    { status: result.error ? 500 : 200 },
  );
}
