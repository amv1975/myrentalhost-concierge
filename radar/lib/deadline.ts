/**
 * Cuánto tiempo le queda a esta petición.
 *
 * Una función de Vercel en el plan gratuito vive 60 segundos y ni uno más.
 * Cuando se pasa, la matan a mitad: lo que estaba a medias se queda a medias,
 * el usuario ve un 500 sin explicación, y si esa tanda había borrado algo
 * antes de reconstruirlo, se queda sin ello.
 *
 * Contar correos no basta para evitarlo — veinte correos cortos tardan diez
 * segundos y veinte largos, noventa. Lo que hay que mirar es el reloj: cada
 * etapa comprueba si le queda tiempo antes de empezar otra tanda, y si no,
 * para y deja el resto en cola. Como todas las etapas son colas en la base de
 * datos, lo que no dio tiempo entra en la siguiente pasada sin repetir nada.
 */

/** Margen para guardar lo hecho y contestar antes de que corten. */
const RESERVE_MS = 12_000;

export interface Deadline {
  /** Si queda tiempo para empezar otra tanda. */
  ok(): boolean;
  /** Segundos restantes, para contarlo cuando se corta por tiempo. */
  left(): number;
}

export function deadlineIn(totalMs: number): Deadline {
  const end = Date.now() + totalMs - RESERVE_MS;
  return {
    ok: () => Date.now() < end,
    left: () => Math.max(0, Math.round((end - Date.now()) / 1000)),
  };
}

/** Un plazo que nunca vence, para lo que no corre contra reloj (los tests). */
export const SIN_PLAZO: Deadline = { ok: () => true, left: () => 999 };
