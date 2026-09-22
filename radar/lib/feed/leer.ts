import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError, FALTA_LA_TABLA } from "@/lib/errors";

/**
 * Si el Feed está montado o no.
 *
 * Es opcional y necesita dos tablas que pueden no existir. Cuando faltan,
 * PostgREST contesta con su código y su "perhaps you meant the table items",
 * que en la pantalla se lee como que algo se ha roto. No se ha roto nada:
 * simplemente no está montado, y lo que hace falta es decir qué falta.
 */
export interface FeedVista {
  /** Las tablas del Feed no existen todavía. */
  sinMontar?: boolean;
  seguidos: { fromEmail: string; name: string | null }[];
  ultima: {
    markdown: string;
    createdAt: string;
    emails: number;
  } | null;
  error?: string;
}

/** Nunca lanza: es una pantalla entera y media vacía vale más que un 500. */
export async function getFeed(): Promise<FeedVista> {
  try {
    const admin = createAdminClient();

    const [feeds, digest] = await Promise.all([
      admin.from("feeds").select("from_email, name").order("from_email"),
      admin
        .from("feed_digests")
        .select("markdown, created_at, emails")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (feeds.error) throw feeds.error;

    const ultima = digest.data as {
      markdown: string;
      created_at: string;
      emails: number;
    } | null;

    return {
      seguidos: ((feeds.data ?? []) as { from_email: string; name: string | null }[]).map(
        (f) => ({ fromEmail: f.from_email, name: f.name }),
      ),
      ultima: ultima
        ? {
            markdown: ultima.markdown,
            createdAt: ultima.created_at,
            emails: ultima.emails,
          }
        : null,
    };
  } catch (error) {
    const texto = describeError(error);
    if (FALTA_LA_TABLA.test(texto)) {
      return { seguidos: [], ultima: null, sinMontar: true };
    }
    return { seguidos: [], ultima: null, error: texto };
  }
}

