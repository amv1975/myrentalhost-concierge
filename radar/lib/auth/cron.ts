import "server-only";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Autoriza las rutas de cron. Acepta el header que envía Vercel Cron y también
 * un header propio, para poder dispararlas desde GitHub Actions (el plan Hobby
 * de Vercel no ejecuta cada hora).
 *
 * Comparación en tiempo constante para no filtrar el secreto por timing.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const expected = env.cronSecret;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const custom = request.headers.get("x-cron-secret") ?? "";

  return timingSafeEqual(bearer, expected) || timingSafeEqual(custom, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
