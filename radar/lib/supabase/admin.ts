import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import "server-only";

/**
 * Cliente con service role: salta RLS. Solo para la ingesta, la extracción y
 * las mutaciones de ítems, y siempre después de comprobar a mano que el usuario
 * pertenece al espacio (ver assertSpaceMember en lib/spaces.ts).
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
