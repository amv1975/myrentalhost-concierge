import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThreadMessages } from "@/lib/google/gmail";
import { estadoDelHilo } from "@/lib/google/hilo-parse";
import { describeError } from "@/lib/errors";
import { VENTANA_MS } from "@/lib/ventana";
import type { Deadline } from "@/lib/deadline";

/**
 * Quién sigue esperando respuesta.
 *
 * Se recalcula en cada pasada y no una sola vez al leer el correo, y esa
 * decisión es la que hace que sirva: un "lleva dos días sin respuesta" que
 * sigue ahí después de que contestaras es peor que no tenerlo, porque te
 * enseña a desconfiar de la línea entera. En cuanto contestás, desaparece
 * solo en la siguiente actualización.
 *
 * Cuesta una llamada de metadatos por hilo —sin cuerpos, sin modelo— y solo
 * de lo que está en el parte ahora mismo, que son unas pocas líneas.
 */

/** Tope por pasada: el parte no tiene más líneas que esto, y si las tuviera,
 *  el problema sería otro. */
const MAX_HILOS = 40;

export interface HilosResult {
  revisados: number;
  cambiados: number;
  error?: string;
}

export async function refrescarHilos(
  accessToken: string,
  propias: string[],
  plazo: Deadline,
): Promise<HilosResult> {
  const result: HilosResult = { revisados: 0, cambiados: 0 };
  const admin = createAdminClient();

  try {
    const desde = new Date(Date.now() - VENTANA_MS).toISOString();

    // Lo que está en el parte: ya clasificado como tuyo y sin despachar.
    const { data, error } = await admin
      .from("emails")
      .select("id, gmail_thread_id, esperando_desde, sin_responder")
      .gte("received_at", desde)
      .not("space_id", "is", null)
      .is("dismissed_at", null)
      .order("received_at", { ascending: false })
      .limit(MAX_HILOS);
    if (error) throw error;

    const filas = (data ?? []) as {
      id: string;
      gmail_thread_id: string;
      esperando_desde: string | null;
      sin_responder: number;
    }[];

    // Un hilo puede traer varios correos del parte. Se mira una vez.
    const porHilo = new Map<string, typeof filas>();
    for (const fila of filas) {
      const lista = porHilo.get(fila.gmail_thread_id) ?? [];
      lista.push(fila);
      porHilo.set(fila.gmail_thread_id, lista);
    }

    for (const [threadId, delHilo] of porHilo) {
      if (!plazo.ok()) {
        result.error =
          "Se acabó el tiempo mirando hilos; los que falten se miran en la siguiente actualización.";
        break;
      }

      let estado;
      try {
        estado = estadoDelHilo(
          await getThreadMessages(accessToken, threadId),
          propias,
        );
      } catch {
        // Un hilo que Gmail no devuelve —borrado, movido— no puede tumbar los
        // demás ni la pasada entera.
        continue;
      }
      result.revisados += 1;

      const esperando = estado.esperandoDesde?.toISOString() ?? null;
      for (const fila of delHilo) {
        if (
          fila.esperando_desde === esperando &&
          fila.sin_responder === estado.sinResponder
        ) {
          continue;
        }
        await admin
          .from("emails")
          .update({
            esperando_desde: esperando,
            sin_responder: estado.sinResponder,
          })
          .eq("id", fila.id);
        result.cambiados += 1;
      }
    }
  } catch (error) {
    result.error = describeError(error);
  }

  return result;
}
