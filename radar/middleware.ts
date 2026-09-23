import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /preview solo existe con RADAR_PREVIEW=1 y no lee datos de nadie.
// Privacidad y términos tienen que abrirse sin haber entrado: Google los pide
// para sacar la app del modo Testing, y una política de privacidad que te
// manda al login no es una política de privacidad.
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/preview",
  "/privacidad",
  "/terminos",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo menos estáticos, imágenes, el manifest y las rutas de cron (que se
    // autentican con CRON_SECRET, no con sesión de usuario).
    //
    // El manifest tiene que quedar fuera sí o sí: el navegador lo pide sin
    // cookies para saber si la web es instalable, y si le devolvemos una
    // redirección al login, la opción de instalarla en el móvil no aparece.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
