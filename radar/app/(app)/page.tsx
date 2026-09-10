import { redirect } from "next/navigation";
import { getVisibleSpaces } from "@/lib/spaces";
import { getParte } from "@/lib/parte";
import { getAgenda } from "@/lib/agenda";
import { ParteBoard } from "@/components/parte-board";

/**
 * La pantalla de inicio: el parte de la mañana.
 *
 * Antes esto redirigía a una de las dos pestañas y te obligaba a elegir un
 * espacio antes de saber qué pasaba. Ahora abre directo en la única pregunta
 * que se hace uno con el café: qué hay hoy.
 */
export default async function HomePage() {
  const spaces = await getVisibleSpaces();
  if (spaces.length === 0) redirect("/login");

  const [parte, agenda] = await Promise.all([getParte(), getAgenda(spaces)]);

  return <ParteBoard parte={parte} agenda={agenda} />;
}
