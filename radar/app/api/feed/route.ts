import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarFeed } from "@/lib/feed/run";
import { describeError } from "@/lib/errors";

export const maxDuration = 60;

/**
 * El Feed: seguir un boletín, dejar de seguirlo, o pedir la síntesis.
 *
 * Todo pasa por service role, porque un boletín es ruido y no pertenece a
 * ningún espacio: RLS —con razón— no lo devolvería. Eso obliga a comprobar a
 * mano quién pregunta, y la comprobación es la misma que en los descartados:
 * solo el dueño del buzón. Victoria no tiene por qué ver de qué se informa él.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    fromEmail?: string;
    name?: string;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: cuenta } = await admin
    .from("google_accounts")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cuenta) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    if (body.action === "seguir") {
      const email = (body.fromEmail ?? "").trim().toLowerCase();
      if (!email.includes("@")) {
        return NextResponse.json(
          { error: "Hace falta el remitente" },
          { status: 400 },
        );
      }
      const { error } = await admin
        .from("feeds")
        .upsert(
          { from_email: email, name: body.name?.trim() || null },
          { onConflict: "from_email" },
        );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "dejar") {
      const email = (body.fromEmail ?? "").trim().toLowerCase();
      const { error } = await admin
        .from("feeds")
        .delete()
        .eq("from_email", email);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "sincronizar") {
      const resultado = await sincronizarFeed();
      return NextResponse.json(resultado);
    }

    return NextResponse.json(
      { error: `Acción no permitida: ${body.action ?? "(vacía)"}` },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
