import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey } from "@/lib/types";
import { RunIngestButton } from "@/components/run-ingest-button";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ espacio: string }>;
}) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) notFound();

  // RLS: si no es miembro, la consulta no devuelve el espacio y aquí acaba.
  // Forzar la URL /trabajo desde una cuenta de Familia da 404, y lo decide la
  // base de datos, no el router.
  const space = await getSpaceByKey(key);
  if (!space) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{space.name}</h1>
        <RunIngestButton espacio={espacio} />
      </div>

      <p className="rounded-xl border border-[var(--color-line)] bg-white px-4 py-8 text-center text-sm text-[var(--color-muted)]">
        La extracción de compromisos llega en el siguiente paso. De momento
        puedes comprobar qué correos entran.
      </p>

      <Link
        href={`/${espacio}/correos`}
        className="inline-block text-sm underline underline-offset-4"
      >
        Ver correos recibidos →
      </Link>
    </div>
  );
}
