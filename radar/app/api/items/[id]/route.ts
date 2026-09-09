import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember } from "@/lib/spaces";
import type { ItemStatus } from "@/lib/types";

/** Lo único que la UI puede hacerle a un ítem. */
const ALLOWED: Record<string, ItemStatus> = {
  confirmar: "confirmed",
  descartar: "dismissed",
  hecho: "done",
  reabrir: "pending",
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  const status = body.action ? ALLOWED[body.action] : undefined;

  if (!status) {
    return NextResponse.json(
      { error: `Acción no permitida: ${body.action ?? "(vacía)"}` },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: item, error } = await admin
    .from("items")
    .select("id, space_id, status, supersedes_item_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!item) {
    return NextResponse.json({ error: "No existe" }, { status: 404 });
  }

  // La barrera de verdad: a partir de aquí se escribe con service role, que no
  // pasa por RLS. Sin esta comprobación, cualquiera con sesión podría tocar un
  // ítem de un espacio al que no pertenece.
  await assertSpaceMember(user.id, item.space_id);

  const { error: updateError } = await admin
    .from("items")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;

  // Al aceptar una actualización, el compromiso anterior deja de estar vivo:
  // ya no debe aparecer en la lista ni volver a emparejarse con nada.
  if (status === "confirmed" && item.supersedes_item_id) {
    await admin
      .from("items")
      .update({ status: "dismissed" })
      .eq("id", item.supersedes_item_id);
  }

  return NextResponse.json({ ok: true, status });
}
