import { notFound } from "next/navigation";
import Link from "next/link";
import { SpaceBoard } from "@/components/space-board";
import { SAMPLE_FAMILY, SAMPLE_WORK } from "@/lib/preview/sample";
import { SLUG_BY_SPACE } from "@/lib/types";

/**
 * Previsualización de la interfaz con datos de ejemplo, para poder verla y
 * tocarla antes de provisionar Supabase y Google.
 *
 * Solo existe con RADAR_PREVIEW=1. No lee ni escribe nada: son los componentes
 * reales alimentados con datos fijos, así que sirve para juzgar la interfaz,
 * no para comprobar que la extracción funciona.
 */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ espacio?: string }>;
}) {
  if (process.env.RADAR_PREVIEW !== "1") notFound();

  const { espacio } = await searchParams;
  const slug = espacio === "trabajo" ? "trabajo" : "familia";
  const view = slug === "trabajo" ? SAMPLE_WORK : SAMPLE_FAMILY;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-ground)]/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 pt-3 sm:px-6">
          <span className="text-base font-semibold tracking-tight">Radar</span>
          <span className="text-xs text-[var(--color-muted)]">
            previsualización
          </span>
        </div>
        <nav className="flex gap-1 px-4 pt-2 sm:px-6">
          {(["family", "work"] as const).map((key) => {
            const target = SLUG_BY_SPACE[key];
            const active = slug === target;
            return (
              <Link
                key={key}
                href={`/preview?espacio=${target}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-current"
                    : "border-transparent text-[var(--color-muted)]"
                }`}
                style={
                  active
                    ? {
                        color:
                          key === "family"
                            ? "var(--color-family)"
                            : "var(--color-work)",
                      }
                    : undefined
                }
              >
                {key === "family" ? "Familia" : "Trabajo"}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4 sm:px-6">
        <SpaceBoard espacio={slug} view={view} demo />

        <p className="mt-8 rounded-xl border border-dashed border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
          Datos de ejemplo. Confirmar y descartar aparta la tarjeta pero no
          guarda nada ni toca el calendario. En el móvil, desliza una tarjeta a
          derecha o izquierda.
        </p>
      </main>
    </div>
  );
}
