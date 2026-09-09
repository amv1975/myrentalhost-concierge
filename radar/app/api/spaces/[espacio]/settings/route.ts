import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey } from "@/lib/types";

/** Ajustes del espacio. Por ahora, la auto-confirmación y su umbral. */
export async function PATCH(
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

  const body = (await request.json()) as {
    auto_confirm_enabled?: boolean;
    auto_confirm_threshold?: number;
  };

  const update: Record<string, unknown> = {};
  if (typeof body.auto_confirm_enabled === "boolean") {
    update.auto_confirm_enabled = body.auto_confirm_enabled;
  }
  if (typeof body.auto_confirm_threshold === "number") {
    const threshold = body.auto_confirm_threshold;
    if (threshold < 0 || threshold > 1) {
      return NextResponse.json(
        { error: "El umbral va de 0 a 1" },
        { status: 400 },
      );
    }
    update.auto_confirm_threshold = threshold;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("spaces").update(update).eq("id", space.id);
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
