import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey, spaceLabel, type Source } from "@/lib/types";
import { SourcesEditor } from "@/components/sources-editor";
import { AutoConfirmToggle } from "@/components/auto-confirm-toggle";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ espacio: string }>;
}) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) notFound();

  const space = await getSpaceByKey(key);
  if (!space) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("sources")
    .select("*")
    .eq("space_id", space.id)
    .order("kind")
    .order("value");

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
        <h2 className="text-sm font-semibold">Remitentes</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Solo se leen los correos que vengan de estos dominios o direcciones.
          Un dominio cubre también sus subdominios.
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
