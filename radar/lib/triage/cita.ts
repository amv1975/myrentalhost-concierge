import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { horarioDeCita } from "@/lib/fechas";
import type { Email, Space } from "@/lib/types";
import type { TriageResult } from "@/lib/triage/schema";

/**
 * La cita que salga de leer un correo, guardada para poder ponerla en la
 * agenda.
 *
 * Antes esto era una etapa entera: una segunda llamada al modelo caro sobre el
 * mismo correo que ya se había leído, y detrás mil trescientas líneas de
 * emparejar compromisos entre sí, detectar cuál sustituía a cuál, pintar el
 * diff de lo que había cambiado y decidir si autoconfirmar según una
 * confianza. Todo eso resolvía un problema que nunca llegó a darse —el colegio
 * moviendo la hora de algo ya metido en el calendario— y mientras tanto la
 * mitad que sí hacía falta, poner una reunión en la agenda, ni siquiera tenía
 * botón.
 *
 * Un correo, como mucho una cita. Si se vuelve a leer, actualiza la suya en vez
 * de crear otra, y eso lo garantiza la clave (gmail_message_id, item_index) que
 * ya estaba en la tabla.
 */
export async function guardarCita(
  email: Pick<Email, "id" | "space_id" | "gmail_message_id">,
  cita: NonNullable<TriageResult["cita"]>,
  space: Space,
): Promise<void> {
  const horario = horarioDeCita(cita, space.timezone);
  if (!horario) return;

  const admin = createAdminClient();
  await admin.from("items").upsert(
    {
      space_id: email.space_id,
      email_id: email.id,
      gmail_message_id: email.gmail_message_id,
      item_index: 0,
      type: "event",
      title: cita.titulo.trim(),
      // La columna existe porque el emparejamiento de antes la necesitaba.
      // Ya no hay emparejamiento; se rellena con el título y punto.
      normalized_title: cita.titulo.trim().toLowerCase(),
      description: null,
      starts_at: horario.inicio.toISOString(),
      ends_at: horario.fin?.toISOString() ?? null,
      all_day: horario.todoElDia,
      due_date: null,
      location: cita.lugar?.trim() || space.default_location || null,
      confidence: 1,
      dedupe_key: `${email.gmail_message_id}:0`,
    },
    { onConflict: "gmail_message_id,item_index" },
  );
}
