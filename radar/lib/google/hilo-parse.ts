/**
 * Quién habló el último en un hilo.
 *
 * Es la señal más accionable que existe y la que faltaba entera: el parte leía
 * cada correo suelto, así que "el huésped pregunta por el check-in" salía
 * igual tanto si le contestaste hace una hora como si lleva dos mensajes y dos
 * días esperando. Y esas dos cosas no se parecen en nada.
 *
 * Sale de datos que Gmail ya da gratis —las etiquetas de cada mensaje del
 * hilo— sin leer un solo cuerpo y sin pasar por el modelo. El coste es una
 * llamada de metadatos por cada correo que ha pasado el filtro, que son unos
 * pocos al día.
 *
 * Vive fuera de `gmail.ts` porque aquel importa `server-only` y esto es
 * aritmética sobre una lista: justo lo que hay que poder probar.
 */

export interface MensajeDelHilo {
  /** Las etiquetas de Gmail. SENT significa que lo mandaste vos. */
  labelIds: string[];
  /** Milisegundos, como los da Gmail en internalDate. */
  internalDate: number;
  fromEmail: string;
}

export interface EstadoDelHilo {
  /**
   * Desde cuándo esperan. Null si el último mensaje es tuyo, o si el hilo
   * entero es tuyo.
   */
  esperandoDesde: Date | null;
  /** Cuántos han escrito sin que contestaras. Cero si no deben nada. */
  sinResponder: number;
}

const NADIE_ESPERA: EstadoDelHilo = { esperandoDesde: null, sinResponder: 0 };

/**
 * `propias` son las direcciones del usuario —la del buzón y los alias que
 * redirige—. Hacen falta porque la etiqueta SENT no basta: un correo que él
 * mismo manda desde otra cuenta suya y le llega reenviado aquí no lleva SENT,
 * y sin mirar el remitente contaría como alguien esperando respuesta.
 */
export function estadoDelHilo(
  mensajes: MensajeDelHilo[],
  propias: string[] = [],
): EstadoDelHilo {
  if (mensajes.length === 0) return NADIE_ESPERA;

  const mias = new Set(propias.map((p) => p.trim().toLowerCase()));
  const esMio = (m: MensajeDelHilo) =>
    m.labelIds.includes("SENT") || mias.has(m.fromEmail.trim().toLowerCase());

  const orden = [...mensajes].sort((a, b) => a.internalDate - b.internalDate);
  const ultimo = orden[orden.length - 1];
  if (esMio(ultimo)) return NADIE_ESPERA;

  // Contar hacia atrás hasta lo último que dijiste vos: eso es lo que está
  // esperando respuesta. Dos mensajes seguidos del huésped pesan más que uno,
  // y esa diferencia es justo la que hace que abras el correo.
  let sinResponder = 0;
  let esperandoDesde = ultimo.internalDate;
  for (let i = orden.length - 1; i >= 0; i -= 1) {
    if (esMio(orden[i])) break;
    sinResponder += 1;
    esperandoDesde = orden[i].internalDate;
  }

  return { esperandoDesde: new Date(esperandoDesde), sinResponder };
}

/** "desde anoche", "desde ayer", "desde hace 3 días". */
export function desdeCuando(desde: Date, ahora = new Date()): string {
  const horas = (ahora.getTime() - desde.getTime()) / 3_600_000;
  if (horas < 3) return "hace un rato";
  if (horas < 14) return "desde esta mañana";
  if (horas < 30) return "desde ayer";
  const dias = Math.round(horas / 24);
  return `desde hace ${dias} días`;
}
