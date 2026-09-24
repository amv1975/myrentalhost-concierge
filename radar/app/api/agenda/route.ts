import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError, FALTA_LA_TABLA } from "@/lib/errors";

/**
 * Quitar de la vista una cita ya despachada, y devolverla si te arrepientes.
 *
 * **No toca el evento en Google.** Es la regla de toda la app: Radar solo
 * escribe en el calendario los eventos que creó ella misma. Un evento que
 * puso él a mano, o que puso otra persona, no se modifica ni se borra por
 * haberlo despachado en una pantalla — se guarda aquí que ya no hace falta
 * enseñarlo, y nada más.
 *
 * Como los descartados y el Feed, la tabla no pertenece a ningún espacio, así
 * que RLS no puede decidir por pertenencia y hay que comprobar a mano quién
 * pregunta: solo el dueño del buzón.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    eventId?: string;
  };

  const eventId = (body.eventId ?? "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "Falta el evento" }, { status: 400 });
  }
  if (body.action !== "ocultar" && body.action !== "mostrar") {
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
  const { data: cuenta } = await admin
    .from("google_accounts")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cuenta) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    if (body.action === "ocultar") {
      const { error } = await admin
        .from("agenda_ocultos")
        .upsert(
          { google_event_id: eventId, ocultado_at: new Date().toISOString() },
          { onConflict: "google_event_id" },
        );
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("agenda_ocultos")
        .delete()
        .eq("google_event_id", eventId);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const texto = describeError(error);
    if (FALTA_LA_TABLA.test(texto)) {
      return NextResponse.json(
        {
          error:
            "Falta la tabla agenda_ocultos en la base de datos. No es un fallo de la app: hay que crearla.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: texto }, { status: 500 });
  }
}
