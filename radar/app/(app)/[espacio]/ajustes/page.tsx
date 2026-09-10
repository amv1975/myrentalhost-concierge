import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey, spaceLabel, type Source } from "@/lib/types";
import { SourcesEditor } from "@/components/sources-editor";
import { AutoConfirmToggle } from "@/components/auto-confirm-toggle";
import { ReanalyzeButton } from "@/components/reanalyze-button";
import { LearnedList, type LearnedEntry } from "@/components/learned-list";
import { getMonthSpend } from "@/lib/spend";
import { formatUsd } from "@/lib/usage";
import { PantallaRota } from "@/components/pantalla-rota";
import { describeError } from "@/lib/errors";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ espacio: string }>;
}) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) notFound();

  // El gasto del mes es un extra: si su consulta falla, Ajustes tiene que
  // seguir abriéndose, porque es desde donde se arreglan las cosas.
  let spend = { usd: 0, runs: 0, screened: 0 };
  let spendError: string | null = null;
  try {
    spend = await getMonthSpend();
  } catch (error) {
    spendError = describeError(error);
  }

  const space = await getSpaceByKey(key);
  if (!space) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("sources")
    .select("*")
    .eq("space_id", space.id)
    .order("kind")
    .order("value");

  // Lo que la app ha aprendido a ignorar sale de lo que has descartado: no hay
  // una lista aparte que mantener, la señal está en el propio uso.
  const { data: dismissed } = await supabase
    .from("items")
    .select("title, normalized_title")
    .eq("space_id", space.id)
    .eq("status", "dismissed")
    .order("updated_at", { ascending: false })
    .limit(200);

  const learned = Object.values(
    ((dismissed ?? []) as { title: string; normalized_title: string }[]).reduce<
      Record<string, LearnedEntry>
    >((acc, row) => {
      const existing = acc[row.normalized_title];
      if (existing) existing.count += 1;
      else
        acc[row.normalized_title] = {
          title: row.title,
          normalizedTitle: row.normalized_title,
          count: 1,
        };
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Ajustes de {spaceLabel(space.key)}</h1>
        <Link
          href={`/${espacio}`}
          className="text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          ← Volver
        </Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold">Gasto de este mes</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Lo que llevan costando las llamadas al modelo. Radar mira el asunto de
          todo lo que entra con el modelo más barato y solo lee entero lo que
          parece tuyo, que es de donde sale que esto valga céntimos y no euros.
        </p>
        {spendError ? (
          <p className="mt-3 text-xs text-[var(--color-danger)]">
            No se pudo calcular: {spendError}
          </p>
        ) : (
          <>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {formatUsd(spend.usd)}
            </p>
            <p className="text-xs text-[var(--color-muted)]">
              {spend.screened} correos mirados en {spend.runs}{" "}
              {spend.runs === 1 ? "actualización" : "actualizaciones"}
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Remitentes de confianza</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Radar lee toda la bandeja y decide por el contenido de qué va cada
          correo. Estos remitentes se saltan esa decisión: lo que venga de
          ellos entra siempre en este espacio. Un dominio cubre también sus
          subdominios.
        </p>
        <div className="mt-3">
          <SourcesEditor espacio={espacio} sources={(data ?? []) as Source[]} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Confirmación automática</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Con esto activado, los compromisos que Claude extraiga con mucha
          seguridad se confirman solos y van al calendario sin que los revises.
          Déjalo apagado hasta que confíes en la extracción.
        </p>
        <div className="mt-3">
          <AutoConfirmToggle
            espacio={espacio}
            enabled={space.auto_confirm_enabled}
            threshold={space.auto_confirm_threshold}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Lo que ha aprendido a ignorar</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Cada cosa que descartas se convierte en un ejemplo de lo que no te
          interesa, y deja de traerte también las que se le parezcan. Si alguna
          resulta importante después, quítala de aquí.
        </p>
        <div className="mt-3">
          <LearnedList espacio={espacio} entries={learned} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Reanalizar</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Los correos se analizan una sola vez, que es lo que impide que los
          compromisos se dupliquen. Si cambian las reglas de extracción, esto
          rehace los que aún no has confirmado.
        </p>
        <div className="mt-3">
          <ReanalyzeButton espacio={espacio} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Calendario destino</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Los eventos confirmados van a{" "}
          <code className="rounded bg-[var(--color-ground)] px-1">
            {space.google_calendar_id}
          </code>
          {space.google_calendar_id === "primary"
            ? " (tu calendario principal)."
            : "."}
        </p>
      </section>
    </div>
  );
}
