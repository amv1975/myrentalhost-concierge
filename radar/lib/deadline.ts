/**
 * Cuánto tiempo le queda a esta petición.
 *
 * Una función de Vercel en el plan gratuito vive 60 segundos. Cuando se pasa,
 * la matan a mitad: lo que estaba a medias se queda a medias y el usuario ve
 * un 500 sin explicación. Y una petición larga desde un móvil se muere antes
 * incluso —"Failed to fetch"—, así que tampoco vale apurar los 60.
 *
 * Contar correos no basta para repartir el tiempo: veinte cortos tardan diez
 * segundos y veinte largos noventa. Lo que hay que mirar es el reloj.
 *
 * Y hay que repartirlo. Con un solo plazo para toda la pasada, la primera
 * etapa se lo come entero y las siguientes no llegan a correr nunca: es
 * exactamente lo que pasaba —la descarga agotaba el tiempo y la lectura no
 * leía ni un correo, pasada tras pasada—. Por eso cada etapa recibe su
 * porción y ninguna puede dejar a las demás sin nada.
 */

/**
 * Margen para guardar lo hecho y contestar antes de que corten.
 *
 * Cuatro segundos, no doce. Con doce sobre un presupuesto de veinticinco, lo
 * aprovechable eran trece — y repartidos entre cuatro etapas, ninguna llegaba
 * a hacer nada. El margen tiene que cubrir el último guardado y la respuesta,
 * no un tercio de la pasada.
 */
const RESERVE_MS = 4_000;

export interface Deadline {
  /** Si queda tiempo para empezar otra tanda. */
  ok(): boolean;
  /** Segundos restantes, para contarlo cuando se corta por tiempo. */
  left(): number;
  /** Cuándo se acaba, en milisegundos desde época. */
  endsAt: number;
}

function hasta(fin: number): Deadline {
  return {
    ok: () => Date.now() < fin,
    left: () => Math.max(0, Math.round((fin - Date.now()) / 1000)),
    endsAt: fin,
  };
}

export function deadlineIn(totalMs: number): Deadline {
  return hasta(Date.now() + totalMs - RESERVE_MS);
}

/**
 * Un trozo del plazo para una etapa concreta.
 *
 * Nunca dura más de lo que quede del plazo entero: una etapa puede terminar
 * antes y regalarle su sobra a la siguiente, pero jamás pasarse.
 */
export function porcion(plazo: Deadline, ms: number): Deadline {
  return hasta(Math.min(Date.now() + ms, plazo.endsAt));
}

/** Un plazo que nunca vence, para lo que no corre contra reloj (los tests). */
export const SIN_PLAZO: Deadline = {
  ok: () => true,
  left: () => 999,
  endsAt: Number.MAX_SAFE_INTEGER,
};
