import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { extractPending } from "@/lib/extraction/run";
import { slugToSpaceKey } from "@/lib/types";

export const maxDuration = 300;

/** Disparo manual de la extracción sobre los correos ya almacenados. */
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

  const space = await getSpaceByKey(key);
  if (!space) {
    return NextResponse.json({ error: "Espacio desconocido" }, { status: 404 });
  }
  await assertSpaceMember(user.id, space.id);

  const result = await extractPending(space);
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
