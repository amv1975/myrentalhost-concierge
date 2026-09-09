import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Space, SpaceKey } from "@/lib/types";

/**
 * Los espacios visibles para el usuario de la petición. Filtrado por RLS: si no
 * es miembro de Trabajo, Trabajo no sale de la base de datos.
 */
export async function getVisibleSpaces(): Promise<Space[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .order("key");
  if (error) throw error;
  return (data ?? []) as Space[];
}

export async function getSpaceByKey(key: SpaceKey): Promise<Space | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as Space) ?? null;
}

/**
 * Comprobación explícita de pertenencia para las rutas que escriben con service
 * role. RLS no protege al service role, así que esta llamada es la única
 * barrera: nunca escribas en un espacio sin pasar por aquí.
 */
export async function assertSpaceMember(
  userId: string,
  spaceId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("El usuario no pertenece a este espacio.");
  }
}

/** Todos los espacios, sin filtrar por usuario. Solo para el cron. */
export async function getAllSpaces(): Promise<Space[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("spaces").select("*").order("key");
  if (error) throw error;
  return (data ?? []) as Space[];
}
