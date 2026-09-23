import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Volver a conceder el permiso de Google, sin salir a buscar dónde.
 *
 * El permiso caduca —en modo Testing, cada siete días— y cuando caduca la app
 * decía "cierra sesión y vuelve a entrar" sin que hubiera en ninguna pantalla
 * una forma de cerrar sesión. La instrucción era correcta y no se podía
 * seguir, que es la peor clase de mensaje de error.
 *
 * Cierra la sesión y manda al login, que ya pide el consentimiento con
 * `prompt=consent` y devuelve un refresh token nuevo.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?next=/");
}
