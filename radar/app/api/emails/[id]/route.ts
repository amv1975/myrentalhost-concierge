import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember } from "@/lib/spaces";

/**
 * Quitar del parte un correo que solo se resume.
 *
 * Un correo resumido no es un compromiso: no tiene estado que confirmar ni
 * fecha que sincronizar. Lo único que se puede hacer con él es decir "ya lo he
 * visto", y entonces deja de aparecer. El correo sigue intacto en Gmail — aquí
 * no se borra, ni se archiva, ni se toca nada de tu buzón.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { action?: string };

  if (body.action !== "descartar" && body.action !== "reabrir") {
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
  const { data: email, error } = await admin
    .from("emails")
    .select("id, space_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!email) {
    return NextResponse.json({ error: "No existe" }, { status: 404 });
  }

  // A partir de aquí se escribe con service role, que no pasa por RLS: esta
  // comprobación es la única barrera. Un correo sin espacio es ruido y no
  // aparece en ningún parte, así que tampoco se puede descartar.
  const spaceId = (email as { space_id: string | null }).space_id;
  if (!spaceId) {
    return NextResponse.json({ error: "No existe" }, { status: 404 });
  }
  await assertSpaceMember(user.id, spaceId);

  const { error: updateError } = await admin
    .from("emails")
    .update({
      dismissed_at: body.action === "descartar" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (updateError) throw updateError;

  return NextResponse.json({ ok: true });
}
