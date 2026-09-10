import { notFound } from "next/navigation";
import { SpaceBoard } from "@/components/space-board";
import { SpaceTabs } from "@/components/space-tabs";
import { SAMPLE_FAMILY, SAMPLE_WORK } from "@/lib/preview/sample";
import { SAMPLE_AGENDA, SAMPLE_PARTE } from "@/lib/preview/parte-sample";
import { ParteBoard } from "@/components/parte-board";
import type { Space } from "@/lib/types";

/** Los dos espacios como los devolvería la base de datos. */
const PREVIEW_SPACES: Space[] = (["family", "work"] as const).map((key) => ({
  id: key,
  key,
  name: key,
  description: null,
  timezone: "Europe/Madrid",
  default_location: null,
  google_calendar_id: "primary",
  auto_confirm_enabled: false,
  auto_confirm_threshold: 0.9,
  lookback_days: 14,
}));

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
  searchParams: Promise<{ espacio?: string; vista?: string }>;
}) {
  if (process.env.RADAR_PREVIEW !== "1") notFound();

  const { espacio, vista } = await searchParams;

  // ?vista=parte abre la pantalla principal con datos fijos. Sirve sobre todo
  // para mirarla en claro y en oscuro sin desplegar y sin buzón.
  if (vista === "parte") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <ParteBoard
          parte={SAMPLE_PARTE}
          agenda={SAMPLE_AGENDA}
          espacios={["family", "work"]}
        />
      </main>
    );
  }

  const slug = espacio === "trabajo" ? "trabajo" : "familia";
  const view = slug === "trabajo" ? SAMPLE_WORK : SAMPLE_FAMILY;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <SpaceTabs
        spaces={PREVIEW_SPACES}
        userEmail="previsualización"
        activeSlug={slug}
      />

      <main
        className="flex-1 px-4 pb-24 pt-4 sm:px-6"
        data-space={slug === "trabajo" ? "work" : "family"}
      >
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
