import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError } from "@/lib/errors";
import { tocaFiltro, tocaLeer } from "@/lib/triage/estados";

/**
 * Qué está haciendo la app por dentro.
 *
 * Existe por una tarde entera de arreglos a ciegas. La app no contaba nada de
 * sí misma, así que cada fallo se diagnosticaba deduciendo desde una captura
 * de pantalla, y cuando la deducción era mala se deducía otra vez encima. Los
 * datos estaban ahí todo el rato, en la base de datos, y no había forma de
 * mirarlos sin un ordenador delante.
 *
 * Esto no arregla nada. Solo enseña, en una pantalla que cabe en un móvil,
 * dónde está cada correo y qué pasó en las últimas pasadas. Con eso, un fallo
 * se ve en vez de adivinarse.
 */

export interface Pasada {
  kind: string;
  status: string;
  startedAt: string;
  segundos: number | null;
  vistos: number;
  nuevos: number;
  error: string | null;
}

export interface Diagnostico {
  /** Cuántos correos hay en cada punto del recorrido. */
  reparto: { estado: string; total: number }[];
  pasadas: Pasada[];
  /** Los últimos del colegio, que es el caso que más se ha mirado hoy. */
  colegio: {
    subject: string | null;
    receivedAt: string;
    estado: string;
    modelo: string | null;
  }[];
  error?: string;
}


export async function getDiagnostico(): Promise<Diagnostico> {
  const vacio: Diagnostico = { reparto: [], pasadas: [], colegio: [] };

  try {
    const admin = createAdminClient();

    const [correos, runs] = await Promise.all([
      admin
        .from("emails")
        .select("triaged_at, triage_status, triage_category, dismissed_at, summary, subject, received_at, triage_model, from_email")
        .order("received_at", { ascending: false })
        .limit(2000),
      admin
        .from("sync_runs")
        .select("kind, status, started_at, finished_at, messages_seen, messages_new, error")
        .order("started_at", { ascending: false })
        .limit(12),
    ]);

    if (correos.error) throw correos.error;
    if (runs.error) throw runs.error;

    type Fila = {
      triaged_at: string | null;
      triage_status: string;
      triage_category: string | null;
      dismissed_at: string | null;
      summary: string | null;
      subject: string | null;
      received_at: string;
      triage_model: string | null;
      from_email: string;
    };

    const filas = (correos.data ?? []) as Fila[];

    const cuenta = new Map<string, number>();
    for (const fila of filas) {
      const estado = estadoDe(fila);
      cuenta.set(estado, (cuenta.get(estado) ?? 0) + 1);
    }

    return {
      reparto: [...cuenta.entries()]
        .map(([estado, total]) => ({ estado, total }))
        .sort((a, b) => a.estado.localeCompare(b.estado)),

      pasadas: ((runs.data ?? []) as {
        kind: string;
        status: string;
        started_at: string;
        finished_at: string | null;
        messages_seen: number;
        messages_new: number;
        error: string | null;
      }[]).map((run) => ({
        kind: run.kind,
        status: run.status,
        startedAt: run.started_at,
        segundos: run.finished_at
          ? Math.round(
              (Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000,
            )
          : null,
        vistos: run.messages_seen,
        nuevos: run.messages_new,
        error: run.error,
      })),

      colegio: filas
        .filter(
          (fila) =>
            /lestonnac|berrly|maileducamos/i.test(fila.from_email),
        )
        .slice(0, 8)
        .map((fila) => ({
          subject: fila.subject,
          receivedAt: fila.received_at,
          estado: estadoDe(fila),
          modelo: fila.triage_model,
        })),
    };
  } catch (error) {
    return { ...vacio, error: describeError(error) };
  }
}

function estadoDe(fila: {
  triaged_at: string | null;
  triage_status: string;
  triage_category: string | null;
  dismissed_at: string | null;
  summary: string | null;
  triage_model: string | null;
}): string {
  // Pregunta a la máquina de estados en vez de repetir sus reglas. Cuando esta
  // pantalla tenía su propia copia, enseñaba quinientos correos como ruido
  // definitivo justo cuando estaban en cola para volver a mirarse.
  if (tocaFiltro(fila)) {
    return fila.triaged_at === null ? "1 · sin mirar" : "1 · a revisar de nuevo";
  }
  if (fila.triage_category === "none") return "2 · ruido";
  if (fila.dismissed_at !== null) return "3 · descartado por ti";
  if (tocaLeer(fila)) return "4 · sin leer";
  return "5 · leído";
}
