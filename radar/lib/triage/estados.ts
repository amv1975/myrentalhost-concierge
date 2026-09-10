/**
 * En qué estado está un correo y quién tiene que ocuparse de él.
 *
 * Esto existe porque un correo se quedó en tierra de nadie: la ingesta vieja lo
 * marcaba como 'done' al entrar, el filtro por asunto solo miraba los
 * 'pending', y la lectura solo miraba los que ya tenían categoría. Ninguna de
 * las dos etapas lo reclamaba, así que se quedaba en "leyéndolo" para siempre y
 * el contador de pendientes no bajaba nunca.
 *
 * La regla que evita que vuelva a pasar es sencilla y está probada abajo: todo
 * correo pertenece a exactamente una de tres situaciones — le toca el filtro,
 * le toca la lectura, o está terminado. Nunca a ninguna.
 */

/** Los estados desde los que se puede volver a intentar leer un correo. */
export const ESTADOS_LEIBLES = ["pending", "failed"] as const;

/** Las categorías que llevan a leer el correo entero. "none" es ruido. */
export const CATEGORIAS_PROPIAS = ["family", "work"] as const;

export interface EstadoCorreo {
  /** Cuándo lo juzgó un modelo por primera vez. Null = nunca lo ha mirado. */
  triaged_at: string | null;
  triage_status: string;
  triage_category: string | null;
  summary: string | null;
  dismissed_at: string | null;
}

/** Le toca el filtro por asunto: nadie lo ha mirado todavía. */
export function tocaFiltro(email: EstadoCorreo): boolean {
  return email.triaged_at === null;
}

/** Le toca la lectura: ya se sabe que es tuyo y aún no se ha resumido. */
export function tocaLeer(email: EstadoCorreo): boolean {
  if (email.triaged_at === null) return false;
  if (email.dismissed_at !== null) return false;
  if (email.summary !== null) return false;
  if (!CATEGORIAS_PROPIAS.includes(email.triage_category as "family")) {
    return false;
  }
  return ESTADOS_LEIBLES.includes(email.triage_status as "pending");
}

/** Ni una cosa ni la otra: no hay nada pendiente que hacerle. */
export function estaTerminado(email: EstadoCorreo): boolean {
  return !tocaFiltro(email) && !tocaLeer(email);
}
