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
export interface Sintesis {
  id: string;
  markdown: string;
  createdAt: string;
  emails: number;
}

export interface FeedVista {
  /** Las tablas del Feed no existen todavía. */
  sinMontar?: boolean;
  seguidos: { fromEmail: string; name: string | null }[];
  /** La que se está leyendo: la última, o la que se haya pedido. */
  ultima: Sintesis | null;
  /**
   * Las anteriores, de la más nueva a la más vieja.
   *
   * Nunca se han borrado —cada síntesis se guardó entera desde el primer día—
   * pero la pantalla solo enseñaba la última, y lo que no se puede abrir da
   * igual que esté guardado. Lo que costó dinero no se tira: se lee cuando se
   * quiere, y sirve para ver lo que se repite semana tras semana, que es
   * justo lo que una síntesis suelta no puede decirte.
   */
  historial: { id: string; createdAt: string; emails: number; titulo: string }[];
  error?: string;
}

/** Cuántas síntesis se ofrecen para releer. Un trimestre largo de semanas. */
const HISTORIAL = 20;

/**
 * Nunca lanza: una pantalla entera y media vacía vale más que un 500.
 *
 * `pedida` es el id de una síntesis vieja. Sin ella se lee la última, que es
 * lo que quieres el 95% de las veces.
 */
export async function getFeed(pedida?: string): Promise<FeedVista> {
  const vacio: FeedVista = { seguidos: [], ultima: null, historial: [] };

  try {
    const admin = createAdminClient();

    const [feeds, digests] = await Promise.all([
      admin.from("feeds").select("from_email, name").order("from_email"),
      admin
        .from("feed_digests")
        .select("id, markdown, created_at, emails")
        .order("created_at", { ascending: false })
        .limit(HISTORIAL),
    ]);

    if (feeds.error) throw feeds.error;
    if (digests.error) throw digests.error;

    type Fila = {
      id: string;
      markdown: string;
      created_at: string;
      emails: number;
    };
    const filas = (digests.data ?? []) as Fila[];

    // Una síntesis pedida que ya no está en las últimas veinte no es un error:
    // se enseña la última y el historial dice qué hay. Un 404 por un enlace
    // viejo sería castigar al que guardó el enlace.
    const elegida = filas.find((fila) => fila.id === pedida) ?? filas[0] ?? null;

    return {
      seguidos: ((feeds.data ?? []) as { from_email: string; name: string | null }[]).map(
        (f) => ({ fromEmail: f.from_email, name: f.name }),
      ),
      ultima: elegida
        ? {
            id: elegida.id,
            markdown: elegida.markdown,
            createdAt: elegida.created_at,
            emails: elegida.emails,
          }
        : null,
      historial: filas.map((fila) => ({
        id: fila.id,
        createdAt: fila.created_at,
        emails: fila.emails,
        titulo: primerTitular(fila.markdown),
      })),
    };
  } catch (error) {
    const texto = describeError(error);
    if (FALTA_LA_TABLA.test(texto)) {
      return { ...vacio, sinMontar: true };
    }
    return { ...vacio, error: texto };
  }
}

/**
 * Con qué se reconoce una síntesis vieja en una lista.
 *
 * Una fecha sola no basta: "12 de septiembre" no le dice a nadie si esa fue la
 * del Registro Único o la de los anuncios de Airbnb. El primer titular sí, y
 * ya está escrito.
 */
function primerTitular(markdown: string): string {
  const marca = /\*\*([^*]+)\*\*/.exec(markdown);
  if (marca) return marca[1].trim();
  return markdown.replace(/[*#]/g, "").trim().slice(0, 80);
}

