import { notFound } from "next/navigation";
import { getSpaceByKey } from "@/lib/spaces";
import { getSpaceView } from "@/lib/items";
import { slugToSpaceKey, spaceLabel } from "@/lib/types";
import { SpaceBoard } from "@/components/space-board";
import { PantallaRota } from "@/components/pantalla-rota";
import { describeError } from "@/lib/errors";
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

  let view;
  try {
    view = await getSpaceView(space.id);
  } catch (error) {
    return (
      <PantallaRota
        titulo={spaceLabel(space.key)}
        error={describeError(error)}
      />
    );
  }

  return (
    // data-space tiñe los acentos con el color del espacio, para que se note en
    // qué mitad de la vida estás sin tener que leer la pestaña.
    <div data-space={space.key}>
      <h1 className="sr-only">{spaceLabel(space.key)}</h1>
      <SpaceBoard espacio={espacio} view={view}>
        <RefreshButton />
      </SpaceBoard>
    </div>
  );
}
