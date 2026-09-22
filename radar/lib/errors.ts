/**
 * Cómo contar un fallo, venga de donde venga.
 *
 * Esto existe por un mensaje que llegó al móvil diciendo literalmente
 * "[object Object]". La causa: los errores de Supabase no son instancias de
 * Error, son objetos planos con `message`, `details`, `hint` y `code`. El
 * `String(error)` que valía para todo lo demás los convertía en nada.
 *
 * Un error que no se puede leer es un error que no se puede arreglar, y en una
 * app que corre sola de madrugada es la diferencia entre enterarse y no.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const shape = error as Record<string, unknown>;
    // El orden importa: `message` dice qué pasó, `details` dice dónde, y
    // `hint` es lo que Postgres sugiere hacer. Los tres juntos suelen bastar.
    const parts = [shape.message, shape.details, shape.hint].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) {
      const code = typeof shape.code === "string" ? ` (${shape.code})` : "";
      return `${parts.join(" · ")}${code}`;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Error sin descripción";
    }
  }

  return String(error);
}

/**
 * Cuando lo que falta es la tabla, no la conexión.
 *
 * PostgREST contesta "Could not find the table 'public.feeds' in the schema
 * cache · Perhaps you meant the table 'public.items' (PGRST205)", y eso en
 * una pantalla se lee como que algo se ha roto. No se ha roto nada: una parte
 * opcional no está montada todavía, y lo que hace falta es decir qué falta en
 * vez de enseñar el código de error.
 *
 * Deliberadamente estrecho: si se tragara cualquier fallo como "no está
 * montado", un problema de verdad se escondería detrás de unas instrucciones
 * que no vienen a cuento.
 */
export const FALTA_LA_TABLA = /PGRST205|schema cache|does not exist/i;
