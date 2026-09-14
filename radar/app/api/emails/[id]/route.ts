import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSpaceMember, getSpaceByKey } from "@/lib/spaces";
import { MARCA_USUARIO } from "@/lib/triage/estados";

/**
 * Quitar del parte un correo que solo se resume.
 *
 * Dos gestos distintos, y la diferencia importa:
 *
 * - **visto** — ya me he ocupado. Desaparece del parte y nada más.
 * - **descartar** — esto no era mío. Además de desaparecer, reclasifica el
 *   correo como ruido, y de ahí sale lo que el filtro aprende: la próxima vez
 *   que llegue un aviso del mismo tipo no sube al parte.
 * - **destacar** — esto sí me importa. Sube arriba, deja de caducar con la
 *   ventana de dos días, y le enseña al filtro qué no puede volver a dejarse
 *   fuera. Es la mitad que más pesa: un correo que no subió y tenía que subir
 *   no deja rastro en ninguna parte salvo aquí.
 * - **rescatar** — el filtro lo tiró y no debía. Es el único gesto que se hace
 *   sobre un correo que nunca llegó a enseñarse, y por eso no se parece a los
 *   demás: hay que decirle a qué vida pertenece, porque el filtro decidió que
 *   a ninguna. Vuelve a la cola de lectura y queda marcado como tuyo y como
 *   importante, que es lo que lee el filtro la próxima vez.
 *
 * Sin rescatar, la lista de descartados era un escaparate: enseñaba el error
 * sin dejar corregirlo, y lo único que el filtro podía aprender era de los
 * aciertos.
 *
 * Descartar es una corrección al modelo, no una papelera. El correo sigue
 * intacto en Gmail: aquí no se borra, ni se archiva, ni se toca el buzón.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { action?: string; espacio?: string };

  const ACCIONES = [
    "visto",
    "descartar",
    "reabrir",
    "destacar",
    "quitar-destacado",
    "rescatar",
  ];

  if (!ACCIONES.includes(body.action ?? "")) {
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

  // Rescatar va por su camino: el correo que se rescata es ruido, no tiene
  // espacio, y comprobar la pertenencia al espacio que no tiene sería
  // imposible. Lo que se comprueba es el espacio de destino.
  if (body.action === "rescatar") {
    return rescatar(id, body.espacio, user.id);
  }

  const admin = createAdminClient();
  const { data: email, error } = await admin
    .from("emails")
    .select("id, space_id, spaces(key)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!email) {
    return NextResponse.json({ error: "No existe" }, { status: 404 });
  }

  // A partir de aquí se escribe con service role, que no pasa por RLS: esta
  // comprobación es la única barrera. Un correo sin espacio es ruido y no
  // aparece en ningún parte, así que tampoco se puede descartar.
  // El join de PostgREST llega tipado como lista aunque la relación sea a uno.
  const row = email as unknown as {
    space_id: string | null;
    spaces: { key: string } | { key: string }[] | null;
  };
  const spaceKey = Array.isArray(row.spaces)
    ? (row.spaces[0]?.key ?? null)
    : (row.spaces?.key ?? null);
  if (!row.space_id) {
    return NextResponse.json({ error: "No existe" }, { status: 404 });
  }
  await assertSpaceMember(user.id, row.space_id);

  const now = new Date().toISOString();

  // Descartar reclasifica: el correo pasa a ruido. Esa fila, con fecha de
  // descarte y categoría "none", es el ejemplo que lee el filtro la próxima
  // vez. Un correo que el modelo ya dio por ruido nunca llegó a enseñarse, así
  // que nunca tiene fecha: no se confunde su criterio con el tuyo.
  //
  // El espacio se conserva aunque la categoría cambie, y por eso deshacer
  // funciona: sin él no habría a qué vida devolverlo.
  // `triage_model` dice quién clasificó el correo. Cuando la persona corrige al
  // modelo pasa a ser ella, y esa marca es la que permite aprender de sus
  // decisiones sin aprender de las propias.
  const change =
    body.action === "descartar"
      ? { dismissed_at: now, triage_category: "none", triage_model: MARCA_USUARIO }
      : body.action === "visto"
        ? { dismissed_at: now }
        : body.action === "destacar"
          ? { importance: "alta", triage_model: MARCA_USUARIO, dismissed_at: null }
          : body.action === "quitar-destacado"
            ? { importance: "normal", triage_model: MARCA_USUARIO }
            : { dismissed_at: null, triage_category: spaceKey };

  const { error: updateError } = await admin
    .from("emails")
    .update(change)
    .eq("id", id);
  if (updateError) throw updateError;

  return NextResponse.json({ ok: true });
}

/**
 * Devolver a la cola un correo que el filtro tiró por error.
 *
 * Deja tres marcas, y las tres hacen falta:
 *
 * - La categoría y el espacio, que es lo que el filtro no supo decidir.
 * - `summary` a null, que es lo que lo vuelve a poner en la cola de lectura:
 *   rescatarlo sin eso lo enseñaría en el parte como una línea sin contenido.
 * - `triage_model = usuario` e `importance = alta`, que es de donde salen los
 *   ejemplos que lee el filtro la próxima vez. Sin ellas, corregirlo hoy no
 *   evitaría que mañana volviera a tirar el mismo correo.
 */
async function rescatar(
  id: string,
  espacio: string | undefined,
  userId: string,
) {
  const key = espacio === "family" || espacio === "work" ? espacio : null;
  if (!key) {
    return NextResponse.json(
      { error: "Hay que decir si es de Familia o de Trabajo" },
      { status: 400 },
    );
  }

  const space = await getSpaceByKey(key);
  if (!space) {
    return NextResponse.json({ error: "Espacio desconocido" }, { status: 404 });
  }
  await assertSpaceMember(userId, space.id);

  const admin = createAdminClient();
  const { error } = await admin
    .from("emails")
    .update({
      triage_category: key,
      space_id: space.id,
      triage_status: "pending",
      triage_model: MARCA_USUARIO,
      importance: "alta",
      triaged_at: new Date().toISOString(),
      dismissed_at: null,
      // Vuelve a la cola de lectura: todavía nadie le ha bajado el cuerpo.
      summary: null,
      detail: null,
      extraction_status: "pending",
    })
    .eq("id", id);
  if (error) throw error;

  return NextResponse.json({ ok: true });
}
