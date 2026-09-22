import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError, FALTA_LA_TABLA } from "@/lib/errors";
import {
  sumar,
  VACIO,
  type FilaFeed,
  type FilaRun,
  type Gasto,
} from "@/lib/gasto-cuentas";

export type { Gasto } from "@/lib/gasto-cuentas";

export async function getGasto(): Promise<Gasto> {
  try {
    const admin = createAdminClient();
    const haceUnMes = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    const [runs, feed] = await Promise.all([
      leerRuns(admin, haceUnMes),
      admin
        .from("feed_digests")
        .select("cost_usd, created_at")
        .gte("created_at", haceUnMes),
    ]);

    if (runs.error) throw runs.error;
    // El Feed es opcional: si su tabla no está montada, el gasto del ciclo
    // normal se sigue pudiendo enseñar. Solo se calla lo que falta.
    if (feed.error && !FALTA_LA_TABLA.test(describeError(feed.error))) {
      throw feed.error;
    }

    return sumar((runs.data ?? []) as FilaRun[], (feed.data ?? []) as FilaFeed[]);
  } catch (error) {
    return { ...VACIO, error: describeError(error) };
  }
}

/**
 * Las pasadas del mes, con desglose si la columna existe.
 *
 * `desglose` llegó después que la pantalla, y entre un despliegue y el SQL hay
 * un rato en que la columna no está. Sin esto, faltar el reparto tiraba también
 * los totales —que sí se podían enseñar— y la pantalla salía entera en rojo por
 * un detalle opcional. Se pide lo mejor, y si no está, se pide lo que hay.
 */
async function leerRuns(
  admin: ReturnType<typeof createAdminClient>,
  desde: string,
): Promise<{ data: FilaRun[] | null; error: unknown }> {
  const conDesglose = await admin
    .from("sync_runs")
    .select("cost_usd, desglose, started_at")
    .gte("started_at", desde);

  if (!conDesglose.error) {
    return { data: conDesglose.data as FilaRun[], error: null };
  }
  if (!FALTA_LA_TABLA.test(describeError(conDesglose.error))) {
    return { data: null, error: conDesglose.error };
  }

  const sinDesglose = await admin
    .from("sync_runs")
    .select("cost_usd, started_at")
    .gte("started_at", desde);

  if (sinDesglose.error) return { data: null, error: sinDesglose.error };
  return {
    data: (sinDesglose.data as Omit<FilaRun, "desglose">[]).map((fila) => ({
      ...fila,
      desglose: null,
    })),
    error: null,
  };
}
