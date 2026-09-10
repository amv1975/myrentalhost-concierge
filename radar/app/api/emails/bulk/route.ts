import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVisibleSpaces } from "@/lib/spaces";
import { MARCA_USUARIO } from "@/lib/triage/estados";
import { describeError } from "@/lib/errors";
import type { SpaceKey } from "@/lib/types";

export const maxDuration = 60;

/**
 * Descartar de una vez los que aún no se han leído.
 *
 * La app no borra nada por su cuenta —lo que ya te enseñó se queda hasta que
 * tú digas— pero eso no puede significar tener que despachar doscientos
 * avisos automáticos de uno en uno. Esto es la misma decisión de siempre,
 * "esto no es para mí", tomada sobre un montón entero.
 *
 * Solo alcanza a los que todavía no tienen resumen. Lo que ya se leyó y estás
 * mirando no se toca: para eso está el Descartar de cada línea, que además te
 * deja deshacerlo.
 *
 * Como cualquier descarte, enseña: estos correos pasan a ser ejemplos de lo
 * que el filtro no debe volver a subir.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { life?: string };

    // Los espacios visibles pasan por RLS, así que Victoria no puede descartar
    // en bloque nada de Trabajo aunque llame a esta ruta a mano.
    const spaces = await getVisibleSpaces();
    const alcance = body.life
      ? spaces.filter((space) => space.key === (body.life as SpaceKey))
      : spaces;

    if (alcance.length === 0) {
      return NextResponse.json({ error: "Espacio desconocido" }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("emails")
      .update({
        dismissed_at: new Date().toISOString(),
        triage_category: "none",
        triage_model: MARCA_USUARIO,
        extraction_status: "skipped",
      })
      .in(
        "space_id",
        alcance.map((space) => space.id),
      )
      .is("summary", null)
      .is("dismissed_at", null)
      .select("id");
    if (error) throw error;

    return NextResponse.json({ dismissed: (data ?? []).length });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
