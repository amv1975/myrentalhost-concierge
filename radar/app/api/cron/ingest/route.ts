import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { getAllSpaces } from "@/lib/spaces";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const spaces = await getAllSpaces();
  const result = await runPipeline(spaces);

  return NextResponse.json(result, {
    status: result.errors.length > 0 ? 207 : 200,
  });
}
