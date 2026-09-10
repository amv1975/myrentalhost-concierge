import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import "server-only";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Margen antes de la expiración para no usar un token que caduca a mitad de llamada. */
const EXPIRY_MARGIN_MS = 60_000;

export interface StoredGoogleAccount {
  user_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string[];
}

export async function saveGoogleAccount(params: {
  userId: string;
  email: string;
  refreshToken: string;
  accessToken?: string | null;
  expiresInSeconds?: number | null;
  scopes: string[];
}): Promise<void> {
  const admin = createAdminClient();
  const expiresAt = params.expiresInSeconds
    ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
    : null;

  const { error } = await admin.from("google_accounts").upsert(
    {
      user_id: params.userId,
      email: params.email,
      refresh_token: params.refreshToken,
      access_token: params.accessToken ?? null,
      access_token_expires_at: expiresAt,
      scopes: params.scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/**
 * Un access token válido para el usuario, refrescándolo si hace falta.
 * Lanza si nunca se guardó un refresh token: el usuario tiene que volver a
 * entrar concediendo acceso offline.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const account = data as StoredGoogleAccount | null;
  if (!account?.refresh_token) {
    throw new Error(
      "No hay refresh token de Google para este usuario. Vuelve a iniciar sesión para conceder acceso.",
    );
  }

  const expiresAt = account.access_token_expires_at
    ? Date.parse(account.access_token_expires_at)
    : 0;
  if (account.access_token && expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return account.access_token;
  }

  return refreshAccessToken(account);
}

async function refreshAccessToken(
  account: StoredGoogleAccount,
): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(explainTokenError(response.status, body));
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  const admin = createAdminClient();
  await admin
    .from("google_accounts")
    .update({
      access_token: token.access_token,
      access_token_expires_at: new Date(
        Date.now() + token.expires_in * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", account.user_id);

  return token.access_token;
}

/**
 * Google contesta a estos fallos con un JSON que acusa a la clave y no a la
 * causa. Traducirlos es la diferencia entre saber qué tocar y no saberlo.
 */
function explainTokenError(status: number, body: string): string {
  if (/invalid_client/.test(body)) {
    return (
      "Google no reconoce el cliente OAuth de la app. Revisa GOOGLE_CLIENT_ID y " +
      "GOOGLE_CLIENT_SECRET en Vercel: tienen que ser exactamente los del " +
      "cliente OAuth de Google Cloud, el mismo que está configurado en Supabase. " +
      "Después de cambiarlos hay que volver a desplegar."
    );
  }

  if (/invalid_grant/.test(body)) {
    return (
      "El permiso de Google ya no vale: o caducó, o lo revocaste, o la app usa " +
      "ahora un cliente OAuth distinto del que lo concedió. Cierra sesión y " +
      "vuelve a entrar aceptando el acceso."
    );
  }

  return `No se pudo refrescar el token de Google (${status}): ${body}`;
}

/**
 * El usuario cuya cuenta de Google usa el cron para leer el buzón. Es el
 * propietario del espacio; si hay varios, el primero que registró credenciales.
 */
export async function getIngestUserId(spaceId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("space_members")
    .select("user_id, role")
    .eq("space_id", spaceId);
  if (error) throw error;

  const members = (data ?? []) as { user_id: string; role: string }[];
  if (members.length === 0) return null;

  const { data: accounts, error: accountsError } = await admin
    .from("google_accounts")
    .select("user_id")
    .in(
      "user_id",
      members.map((m) => m.user_id),
    );
  if (accountsError) throw accountsError;

  const withCredentials = new Set(
    ((accounts ?? []) as { user_id: string }[]).map((a) => a.user_id),
  );
  const owner = members.find(
    (m) => m.role === "owner" && withCredentials.has(m.user_id),
  );
  return (
    owner?.user_id ??
    members.find((m) => withCredentials.has(m.user_id))?.user_id ??
    null
  );
}
