import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/auth/cron";
import { getAllSpaces } from "@/lib/spaces";
import { runPipeline } from "@/lib/pipeline";
import { describeError } from "@/lib/errors";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await runPipeline(await getAllSpaces());
    return NextResponse.json(result, {
      status: result.errors.length > 0 ? 207 : 200,
    });
  } catch (error) {
    // El cron corre solo de madrugada: si revienta sin decir qué, nadie se
    // entera hasta que el parte aparece vacío por la mañana.
    return NextResponse.json(
      { error: describeError(error) },
      { status: 500 },
    );
  }
}
