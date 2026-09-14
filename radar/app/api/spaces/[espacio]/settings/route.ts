import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey } from "@/lib/types";

/**
 * Ajustes del espacio: la descripción de qué entra en esta vida, la
 * auto-confirmación y su umbral.
 *
 * La descripción no es decorativa: es literalmente lo que lee el filtro para
 * decidir si un correo es tuyo. Estaba en la base de datos y no en el código
 * justo para poder cambiarla sin desplegar, pero no había forma de editarla, y
 * "Familia" seguía queriendo decir solo "el colegio". Un correo de la comunidad
 * de vecinos no encaja ahí, así que el filtro lo tira con toda lógica.
 */
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
    description?: string;
    auto_confirm_enabled?: boolean;
    auto_confirm_threshold?: number;
  };

  const update: Record<string, unknown> = {};
  if (typeof body.description === "string") {
    const texto = body.description.trim();
    // Va dentro del prompt del filtro, así que tiene techo: una descripción
    // larguísima se paga en cada lote y además diluye las reglas que vienen
    // después.
    if (texto.length > 1200) {
      return NextResponse.json(
        { error: "La descripción no puede pasar de 1200 caracteres" },
        { status: 400 },
      );
    }
    update.description = texto.length > 0 ? texto : null;
  }
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
