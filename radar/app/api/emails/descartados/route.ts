import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceLabel } from "@/lib/source-label";
import { describeError } from "@/lib/errors";

/**
 * Buscar entre lo que el filtro tiró.
 *
 * La lista de descartados enseñaba los sesenta más recientes de seiscientos
 * setenta y siete, que para comprobar que no se perdió nada sirve, y para
 * encontrar un correo concreto no sirve de nada. El gesto real es el otro: veo
 * algo en Gmail que Radar no me subió, y quiero decirle que eso sí me importa.
 * Para eso hay que poder buscarlo por lo poco que uno recuerda — quién lo
 * manda o dos palabras del asunto.
 *
 * Va contra service role y no contra RLS porque un correo clasificado como
 * ruido no pertenece a ningún espacio, así que RLS —con razón— no lo devuelve.
 * Eso obliga a comprobar a mano quién pregunta: solo el dueño del buzón. Sin
 * esa comprobación, cualquier miembro de cualquier espacio podría leer los
 * asuntos de toda la bandeja.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("google_accounts")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) {
    // Victoria ve el recuento de descartados, nunca la lista ni su contenido.
    return NextResponse.json({ results: [] });
  }

  try {
    const patron = `%${escaparLike(q)}%`;

    const { data, error } = await admin
      .from("emails")
      .select("id, from_email, from_name, subject, received_at")
      .eq("triage_category", "none")
      // Lo que descartaste tú no vuelve a ofrecerse: ya lo decidiste.
      .is("dismissed_at", null)
      .or(
        `subject.ilike.${patron},from_email.ilike.${patron},from_name.ilike.${patron}`,
      )
      .order("received_at", { ascending: false })
      .limit(LIMITE);
    if (error) throw error;

    const results = ((data ?? []) as {
      id: string;
      from_email: string;
      from_name: string | null;
      subject: string | null;
      received_at: string;
    }[]).map((row) => ({
      id: row.id,
      who: sourceLabel(row.from_email, row.from_name) ?? row.from_email,
      subject: row.subject ?? "(sin asunto)",
      at: row.received_at,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

/** Bastantes para encontrarlo, pocos para no volver a la lista infinita. */
const LIMITE = 30;

/**
 * Lo que escribe el usuario entra en un patrón LIKE, así que sus comodines
 * tienen que dejar de serlo: buscar "100%" no puede significar "lo que sea".
 * Y la coma cierra el filtro .or() de PostgREST, que es el que de verdad
 * importa aquí.
 */
function escaparLike(texto: string): string {
  return texto.replace(/[%_\\,()]/g, " ").slice(0, 80);
}
