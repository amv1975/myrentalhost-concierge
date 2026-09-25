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

/**
 * El mismo plazo, guardando un trozo del final para lo que venga después.
 *
 * Existe por una etapa que no llegaba a correr nunca. La lectura va con el
 * plazo entero a propósito —es la que produce lo que se ve— pero eso deja a
 * cero lo que va detrás: el día que hay correos de sobra, la lectura agota el
 * reloj y la etapa siguiente empieza con el plazo ya vencido y se corta en la
 * primera vuelta. Así, pasada tras pasada.
 *
 * Con esto la lectura sigue teniendo casi todo, pero no todo.
 */
export function reservando(plazo: Deadline, ms: number): Deadline {
  return hasta(Math.max(Date.now(), plazo.endsAt - ms));
}

/**
 * Lo que hay que pasarle a una llamada al modelo para que no se pase del plazo.
 *
 * El plazo se comprueba ENTRE llamadas, así que una sola llamada lenta se lo
 * salta entero: la etapa mira el reloj, ve que le queda tiempo, empieza una
 * petición que tarda cuarenta segundos y para cuando vuelve hace rato que
 * Vercel cortó la función. Eso es lo que llegaba al móvil como "Gateway
 * Timeout", sin una línea en ningún sitio que dijera por qué.
 *
 * `maxRetries: 0` no es tacañería: el SDK reintenta dos veces por defecto, así
 * que el reloj real de una llamada puede ser el triple del timeout que se le
 * pide. Aquí los reintentos ya existen a otro nivel —la tanda que falla vuelve
 * a la cola y la siguiente pasada la recoge—, y esos sí caben en el plazo.
 *
 * El suelo existe para no pedir una petición de doscientos milisegundos que
 * nace muerta: si no cabe ni eso, la etapa no debería haber empezado.
 */
export function limites(plazo: Deadline): { timeout: number; maxRetries: 0 } {
  const queda = plazo.endsAt - Date.now();
  const timeout = Math.min(MAX_LLAMADA_MS, Math.max(MIN_LLAMADA_MS, queda));
  return { timeout, maxRetries: 0 };
}

/** Por debajo de esto una llamada no llega ni a empezar. */
const MIN_LLAMADA_MS = 3_000;

/** Techo para SIN_PLAZO, que no tiene fin y pediría un timeout absurdo. */
const MAX_LLAMADA_MS = 10 * 60_000;

/** Un plazo que nunca vence, para lo que no corre contra reloj (los tests). */
export const SIN_PLAZO: Deadline = {
  ok: () => true,
  left: () => 999,
  endsAt: Number.MAX_SAFE_INTEGER,
};
