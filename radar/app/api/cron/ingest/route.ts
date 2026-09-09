import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { getAllSpaces } from "@/lib/spaces";
import { ingestSpace } from "@/lib/ingest/ingest";
import { extractPending } from "@/lib/extraction/run";
import { syncSpace } from "@/lib/calendar/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const spaces = await getAllSpaces();
  const ingested = [];
  const extracted = [];
  const synced = [];

  for (const space of spaces) {
    // Un espacio que falla (token caducado, cuota) no debe impedir que el otro
    // se procese: cada función captura su propio error y lo devuelve.
    ingested.push(await ingestSpace(space));
    extracted.push(await extractPending(space));
    // Recoge también lo que confirmaste desde el móvil y no se pudo sincronizar
    // en su momento, y los eventos cuya hora cambió.
    synced.push(await syncSpace(space));
  }

  const failed = [...ingested, ...extracted, ...synced].some((r) => r.error);
  return NextResponse.json(
    { ingested, extracted, synced },
    { status: failed ? 207 : 200 },
  );
}
