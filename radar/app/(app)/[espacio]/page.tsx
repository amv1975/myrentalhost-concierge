import { notFound } from "next/navigation";
import { getSpaceByKey } from "@/lib/spaces";
import { getSpaceView } from "@/lib/items";
import { slugToSpaceKey, spaceLabel } from "@/lib/types";
import { SpaceBoard } from "@/components/space-board";
import { RefreshButton } from "@/components/refresh-button";

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

  const view = await getSpaceView(space.id);

  return (
    <>
      <h1 className="sr-only">{spaceLabel(space.key)}</h1>
      <SpaceBoard espacio={espacio} view={view}>
        <RefreshButton />
      </SpaceBoard>
    </>
  );
}
