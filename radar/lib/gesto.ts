/**
 * Qué está haciendo el pulgar.
 *
 * Vive fuera del componente por una razón: esto se equivocó en producción
 * —"moví una para la izquierda y me descartó pero no supe qué era"— y lo que
 * se ha equivocado una vez tiene que poder probarse. Son cuatro líneas y un
 * test; dentro del componente serían cuatro líneas y ningún test.
 *
 * Dos reglas, las dos asimétricas a propósito:
 *
 *  - **No decidir pronto.** Hasta que el dedo no se ha movido lo suficiente,
 *    no se sabe nada: los primeros píxeles de cualquier gesto son ruido.
 *  - **La duda va a scroll.** Un swipe que no se dispara se repite sin
 *    consecuencias; un descarte que se dispara solo cuesta un correo que
 *    quizá ni se llegó a leer. Por eso la horizontal tiene que ganar de
 *    calle, no por poco.
 */
export const DECIDIR_PX = 14;
export const RATIO = 1.5;

export function decidirEje(dx: number, dy: number): null | "x" | "y" {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDIR_PX) return null;
  return Math.abs(dx) > Math.abs(dy) * RATIO ? "x" : "y";
}

/**
 * Cuánto hay que arrastrar para que el gesto cuente.
 *
 * Eran 70 px, y 70 px en un móvil es un gesto que el pulgar hace sin darse
 * cuenta mientras baja por la lista. Media pulgada de pantalla solo se recorre
 * queriendo.
 */
export const SWIPE_PX = 130;

export function resultado(
  eje: null | "x" | "y",
  offset: number,
): null | "descartado" | "listo" {
  if (eje !== "x") return null;
  if (offset > SWIPE_PX) return "descartado";
  if (offset < -SWIPE_PX) return "listo";
  return null;
}
