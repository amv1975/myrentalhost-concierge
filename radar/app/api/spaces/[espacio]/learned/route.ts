import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey } from "@/lib/types";

/**
 * Olvida un patrón aprendido.
 *
 * Borra los ítems descartados con ese título normalizado, que es de donde sale
 * la señal: sin ellos, la extracción deja de tratarlo como algo que no
 * interesa. Se borran en vez de marcarlos de otro modo porque un ítem
 * descartado no tiene más valor que el de servir de ejemplo.
 */
export async function DELETE(
  request: Request,
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

  const { searchParams } = new URL(request.url);
  const normalized = searchParams.get("titulo");
  if (!normalized) {
    return NextResponse.json({ error: "Falta el título" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("items")
    .delete()
    .eq("space_id", space.id)
    .eq("status", "dismissed")
    .eq("normalized_title", normalized);
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
