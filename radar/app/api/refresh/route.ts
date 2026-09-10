import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisibleSpaces } from "@/lib/spaces";
import { runPipeline } from "@/lib/pipeline";
import { describeError } from "@/lib/errors";

/**
 * Sesenta segundos es el techo del plan gratuito de Vercel. Pedir 300 no daba
 * 300: daba 60 y un corte seco a mitad de trabajo. Ahora el pipeline lleva su
 * propio reloj y para antes de que lo paren.
 */
export const maxDuration = 60;

/**
 * Todo el ciclo de una vez: traer del buzón, clasificar, extraer, sincronizar.
 *
 * Es lo primero que se pulsa al abrir la app, así que no tiene sentido pedir
 * que se repita una vez por pestaña: quien abre Radar quiere saber si hay algo
 * nuevo, no en qué espacio está.
 *
 * getVisibleSpaces pasa por RLS, así que Victoria solo actualiza Familia
 * aunque llame a esta misma ruta.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let result;
  try {
    result = await runPipeline(await getVisibleSpaces());
  } catch (error) {
    // Sin esto, cualquier fallo inesperado llegaba al móvil como "No se pudo
    // actualizar" y no había forma de saber qué había pasado sin los logs de
    // Vercel. Una app que esconde sus propios errores no se puede arreglar.
    return NextResponse.json(
      {
        error: describeError(error),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    messagesNew: result.messagesNew,
    screened: result.screened,
    discarded: result.discarded,
    read: result.read,
    family: result.family,
    work: result.work,
    created: result.created,
    updated: result.updated,
    costUsd: result.costUsd,
    remaining: result.remaining,
    pendingScreen: result.pendingScreen,
    // Un solo mensaje: repetir el mismo problema por cada etapa no informa.
    error: result.errors.length > 0 ? [...new Set(result.errors)][0] : null,
  });
}
