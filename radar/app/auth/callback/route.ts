import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleAccount } from "@/lib/google/oauth";
import { GOOGLE_SCOPES } from "@/lib/google/scopes";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Google no devolvió código de autorización.")}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session?.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "No se pudo iniciar sesión.")}`,
    );
  }

  const { session } = data;

  // Google solo entrega el refresh token en el primer consentimiento (o con
  // prompt=consent). Guardarlo aquí es lo que permite al cron leer el buzón sin
  // que nadie tenga el navegador abierto. Si falta, el login sigue siendo
  // válido; la ingesta avisará cuando toque.
  if (session.provider_refresh_token) {
    await saveGoogleAccount({
      userId: session.user.id,
      email: session.user.email ?? "",
      refreshToken: session.provider_refresh_token,
      accessToken: session.provider_token ?? null,
      expiresInSeconds: 3600,
      scopes: [...GOOGLE_SCOPES],
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
