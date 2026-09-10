import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { extractPending } from "@/lib/extraction/run";
import { triagePending } from "@/lib/triage/run";
import { buildTriageContext } from "@/lib/triage/context";
import { getVisibleSpaces } from "@/lib/spaces";
import { Spend } from "@/lib/usage";
import { slugToSpaceKey, type Item } from "@/lib/types";

export const maxDuration = 60;

/**
 * Vuelve a analizar los correos del espacio.
 *
 * Sirve para cuando cambian las reglas: sin esto, los correos viejos se quedan
 * como los dejó el prompt anterior, porque uno ya analizado nunca se reprocesa.
 *
 * Lo único que hace es poner la cola: marca los correos para que se vuelvan a
 * resumir y borra los compromisos que puedan rehacerse. El trabajo de verdad
 * lo hace Actualizar después, en tandas. No vuelve a pedirle nada a Gmail —el
 * cuerpo ya está guardado— ni vuelve a pasar por el filtro por asunto, porque
 * de qué vida es cada uno ya se sabe.
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
  // Los resúmenes se rehacen todos, hayan dado compromisos o no: el detalle
  // que se ve al desplegar una línea sale de aquí.
  const { error: triageError } = await admin
    .from("emails")
    .update({ triage_status: "pending" })
    .eq("space_id", space.id)
    .in("triage_category", ["family", "work"])
    .not("body_text", "is", null);
  if (triageError) throw triageError;

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

  // Aquí NO se llama al modelo. Releer veinte correos enteros tarda más de lo
  // que una función de Vercel puede vivir, y cuando se cortaba a mitad dejaba
  // los correos en cola y los compromisos ya borrados: el parte se quedaba
  // vacío. Ahora esto solo pone la cola, que es instantáneo, y el trabajo lo
  // hace Actualizar en tandas que sí caben en su tiempo.
  return NextResponse.json({
    queued: toReprocess.length,
    kept: locked.size,
  });
}
