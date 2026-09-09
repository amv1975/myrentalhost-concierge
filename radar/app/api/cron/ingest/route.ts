import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { getAllSpaces } from "@/lib/spaces";
import { ingestSpace } from "@/lib/ingest/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const spaces = await getAllSpaces();
  const results = [];
  for (const space of spaces) {
    // Un espacio que falla (token caducado, cuota) no debe impedir que el otro
    // se ingiera: ingestSpace captura su propio error y lo devuelve.
    results.push(await ingestSpace(space));
  }

  const failed = results.some((r) => r.error);
  return NextResponse.json(
    { results },
    { status: failed ? 207 : 200 },
  );
}
