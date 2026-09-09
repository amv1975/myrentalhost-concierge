import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSpaceByKey, assertSpaceMember } from "@/lib/spaces";
import { ingestSpace } from "@/lib/ingest/ingest";
import { slugToSpaceKey } from "@/lib/types";

export const maxDuration = 300;

/** Disparo manual de la ingesta desde la UI, para el espacio que se está viendo. */
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

  const result = await ingestSpace(space);
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
