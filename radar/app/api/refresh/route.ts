import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVisibleSpaces } from "@/lib/spaces";
import { ingestSpace } from "@/lib/ingest/ingest";
import { extractPending } from "@/lib/extraction/run";
import { syncSpace } from "@/lib/calendar/sync";

export const maxDuration = 300;

/**
 * Todo el ciclo, en todos los espacios del usuario, de una vez.
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

  const spaces = await getVisibleSpaces();

  let messagesNew = 0;
  let created = 0;
  let updated = 0;
  const problems: string[] = [];

  for (const space of spaces) {
    // Cada espacio captura su propio error: que Trabajo choque con la cuota de
    // Gmail no puede impedir que Familia se actualice.
    const ingested = await ingestSpace(space);
    messagesNew += ingested.messagesNew;
    if (ingested.error) problems.push(ingested.error);

    const extracted = await extractPending(space);
    created += extracted.created;
    updated += extracted.updated;
    if (extracted.error) problems.push(extracted.error);

    const synced = await syncSpace(space);
    if (synced.error) problems.push(synced.error);
  }

  return NextResponse.json({
    spaces: spaces.length,
    messagesNew,
    created,
    updated,
    // Un solo mensaje: repetir el mismo problema por cada espacio no informa.
    error: problems.length > 0 ? [...new Set(problems)][0] : null,
  });
}
