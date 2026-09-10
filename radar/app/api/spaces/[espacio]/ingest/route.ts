import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSpaceByKey, assertSpaceMember, getVisibleSpaces } from "@/lib/spaces";
import { runPipeline } from "@/lib/pipeline";
import { slugToSpaceKey } from "@/lib/types";

export const maxDuration = 300;

/**
 * Disparo manual desde la UI.
 *
 * El buzón es uno solo y la clasificación decide después a qué espacio va cada
 * correo, así que no se puede "actualizar solo Trabajo": se trae todo y se
 * reparte. El espacio de la URL sigue sirviendo para comprobar que quien pulsa
 * es miembro de algo.
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

  // getSpaceByKey pasa por RLS, así que ya devuelve null si no es miembro;
  // assertSpaceMember lo vuelve a comprobar porque a partir de aquí se escribe
  // con service role, que no está sujeto a RLS.
  const space = await getSpaceByKey(key);
  if (!space) {
    return NextResponse.json({ error: "Espacio desconocido" }, { status: 404 });
  }
  await assertSpaceMember(user.id, space.id);

  const result = await runPipeline(await getVisibleSpaces());
  return NextResponse.json(result, {
    status: result.errors.length > 0 ? 500 : 200,
  });
}
