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
      admin
        .from("sync_runs")
        .select("cost_usd, desglose, started_at")
        .gte("started_at", haceUnMes),
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
