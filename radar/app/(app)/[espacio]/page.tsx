import { notFound } from "next/navigation";
import { getSpaceByKey } from "@/lib/spaces";
import { slugToSpaceKey } from "@/lib/types";

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
    <div className="py-12 text-center">
      <p className="text-sm text-[var(--color-muted)]">
        {space.name}: todavía no hay nada. La ingesta de correo llega en el
        siguiente paso.
      </p>
    </div>
  );
}
