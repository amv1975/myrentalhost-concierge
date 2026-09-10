import { createClient } from "@/lib/supabase/server";

export interface MonthSpend {
  usd: number;
  runs: number;
  screened: number;
}

/**
 * Lo gastado en lo que va de mes.
 *
 * Es la respuesta a la única pregunta que importa cuando una app tuya llama a
 * un modelo por cada correo que te entra: ¿cuánto llevo? Tenerla en Ajustes
 * evita descubrirlo en la factura.
 */
export async function getMonthSpend(): Promise<MonthSpend> {
  const supabase = await createClient();

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { data, error } = await supabase
    .from("sync_runs")
    .select("cost_usd, messages_seen")
    .gte("started_at", from.toISOString());
  if (error) throw error;

  const rows = (data ?? []) as { cost_usd: number | null; messages_seen: number }[];

  return {
    usd: rows.reduce((total, row) => total + Number(row.cost_usd ?? 0), 0),
    runs: rows.length,
    screened: rows.reduce((total, row) => total + (row.messages_seen ?? 0), 0),
  };
}
