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
  /** Con qué reglas se juzgó. MARCA_USUARIO si lo decidiste tú. */
  triage_model?: string | null;
}

/**
 * Le toca el filtro por asunto.
 *
 * Dos casos, y el segundo importa: nadie lo ha mirado todavía, o lo miró un
 * criterio que ya no está vigente y lo tiró a la basura.
 *
 * Esa segunda parte es deliberadamente estrecha. Solo vuelve lo que la app
 * descartó sola —categoría "none"— y nunca lo que tú tocaste. Un filtro roto
 * puede tirar quinientos correos buenos a la basura, y si no hay forma de
 * revisarlos, arreglar el filtro no sirve de nada: la bandeja sigue vacía. Lo
 * que no vuelve jamás es lo que ya te enseñó y decidiste: si lo descartaste
 * tú, se queda descartado aunque cambien las reglas diez veces.
 */
export function tocaFiltro(email: EstadoCorreo): boolean {
  // Tu descarte va antes que todo lo demás, incluso antes de "nadie lo ha
  // mirado". Es un estado que no debería darse —solo se descarta lo que se ha
  // visto—, pero si se da, la respuesta correcta es respetarte a ti.
  if (email.dismissed_at !== null) return false;
  if (email.triaged_at === null) return true;
  return esRuidoCaducado(email);
}

/** Ruido de la máquina, juzgado con reglas que ya no son las de ahora. */
function esRuidoCaducado(email: EstadoCorreo): boolean {
  if (email.triage_category !== "none") return false;
  if (email.dismissed_at !== null) return false;
  const sello = email.triage_model ?? null;
  if (sello === MARCA_USUARIO) return false;
  return sello !== CRITERIO_ACTUAL;
}

/** Le toca la lectura: ya se sabe que es tuyo y aún no se ha resumido. */
export function tocaLeer(email: EstadoCorreo): boolean {
  if (tocaFiltro(email)) return false;
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

/**
 * El sello del criterio con el que se juzgó un correo.
 *
 * Queda guardado para saber con qué reglas se decidió cada cosa, y sirve para
 * una cosa más: cuando el criterio cambia, lo que el criterio viejo tiró a la
 * basura vuelve a mirarse una vez. Sin eso, un filtro demasiado severo deja la
 * bandeja vacía para siempre y arreglarlo no cambia nada.
 *
 * Lo que NO reabre nunca es lo que ya te enseñó y decidiste. Una aplicación
 * que rehace sola lo que pasó por tus manos te quita lo único que era tuyo:
 * decidir qué se queda y qué se va. Por eso solo vuelve la categoría "none", y
 * solo si no lleva tu sello ni tu descarte.
 */
export const CRITERIO_ACTUAL = "haiku-4.5/v3";

/** El sello de lo que decidiste tú. Este no caduca nunca. */
export const MARCA_USUARIO = "usuario";
