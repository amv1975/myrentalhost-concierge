import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember } from "@/lib/spaces";
import { syncItemById } from "@/lib/calendar/sync";
import type { ItemStatus } from "@/lib/types";
import { describeError } from "@/lib/errors";

/** Lo único que la UI puede hacerle a un ítem. */
const ALLOWED: Record<string, ItemStatus> = {
  confirmar: "confirmed",
  descartar: "dismissed",
  hecho: "done",
  reabrir: "pending",
};

/** Fijar no cambia el estado: es una marca aparte sobre el mismo ítem. */
const PIN_ACTIONS: Record<string, boolean> = {
  fijar: true,
  soltar: false,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  const action = body.action ?? "";
  const status = ALLOWED[action];
  const pinned = PIN_ACTIONS[action];

  if (status === undefined && pinned === undefined) {
    return NextResponse.json(
      { error: `Acción no permitida: ${action || "(vacía)"}` },
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

  // Fijar solo mueve la marca: no toca el estado ni el calendario.
  if (pinned !== undefined) {
    const { error } = await admin
      .from("items")
      .update({ pinned })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, pinned });
  }

  const { error: updateError } = await admin
    .from("items")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;

  // Al aceptar una actualización, el compromiso anterior deja de estar vivo:
  // ya no debe aparecer en la lista ni volver a emparejarse con nada. No se
  // sincroniza su baja porque el evento de Google lo hereda el ítem nuevo, que
  // lo actualiza en su sitio en lugar de borrarlo y crear otro.
  if (status === "confirmed" && item.supersedes_item_id) {
    await admin
      .from("items")
      .update({ status: "dismissed", google_event_id: null })
      .eq("id", item.supersedes_item_id);
  }

  // El calendario se actualiza en el momento, no en la siguiente pasada del
  // cron: confirmar algo y no verlo aparecer haría dudar de si funcionó. Si
  // falla, la confirmación se mantiene y el error queda en sync_error para que
  // el cron lo reintente.
  let syncError: string | null = null;
  if (status === "confirmed" || status === "dismissed") {
    try {
      await syncItemById(id);
    } catch (error) {
      syncError = describeError(error);
    }
  }

  return NextResponse.json({ ok: true, status, syncError });
}
