import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey, type SourceKind } from "@/lib/types";

/** Añadir un remitente al espacio. Las fuentes cambian; por eso no viven en el código. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ espacio: string }> },
) {
  const { space, error } = await resolveSpace(params);
  if (error) return error;

  const body = (await request.json()) as { value?: string; kind?: SourceKind };
  const value = body.value?.trim().toLowerCase();
  if (!value) {
    return NextResponse.json({ error: "Escribe un remitente" }, { status: 400 });
  }

  // Un dominio si no lleva arroba, un remitente concreto si la lleva.
  const kind: SourceKind = body.kind ?? (value.includes("@") ? "email" : "domain");

  if (!/^[a-z0-9._%+-]+@?[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) {
    return NextResponse.json(
      { error: "No parece un dominio ni un correo válido" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("sources")
    .insert({ space_id: space.id, kind, value });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya estaba en la lista" }, { status: 409 });
    }
    throw insertError;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ espacio: string }> },
) {
  const { space, error } = await resolveSpace(params);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("sources")
    .delete()
    .eq("id", id)
    .eq("space_id", space.id);
  if (deleteError) throw deleteError;

  return NextResponse.json({ ok: true });
}

async function resolveSpace(params: Promise<{ espacio: string }>) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) {
    return {
      space: null as never,
      error: NextResponse.json({ error: "Espacio desconocido" }, { status: 404 }),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      space: null as never,
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const space = await getSpaceByKey(key);
  if (!space) {
    return {
      space: null as never,
      error: NextResponse.json({ error: "Espacio desconocido" }, { status: 404 }),
    };
  }
  await assertSpaceMember(user.id, space.id);

  return { space, error: null };
}
