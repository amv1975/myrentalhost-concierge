import { redirect } from "next/navigation";
import { getVisibleSpaces } from "@/lib/spaces";
import { SLUG_BY_SPACE } from "@/lib/types";

export default async function HomePage() {
  const spaces = await getVisibleSpaces();
  if (spaces.length === 0) redirect("/login");

  // Familia primero si está disponible; si no, el único espacio que haya.
  const first =
    spaces.find((s) => s.key === "family") ?? spaces[0];
  redirect(`/${SLUG_BY_SPACE[first.key]}`);
}
