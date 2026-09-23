/**
 * Desde cuándo mirar los correos de cada boletín.
 *
 * Aquí había un fallo que solo aparece el día que sigues uno nuevo: la ventana
 * era una sola para todos —desde la última síntesis— así que un boletín que
 * acabas de añadir empezaba a contar desde ese momento. Sus correos de esta
 * semana, ya descargados y esperando, quedaban del lado de antes y no los
 * miraba nadie. Sincronizabas y no traía nada, que es exactamente lo que
 * parece un producto roto.
 *
 * La ventana es de cada remitente, no de la pasada:
 *
 *  - **Boletín que ya seguías**: desde la última síntesis. Lo anterior ya se
 *    leyó y pagarlo otra vez sería pagar dos veces por el mismo texto.
 *  - **Boletín recién añadido**: desde donde llegue el buzón. Nunca se ha
 *    mirado, así que no hay nada que repetir, y lo que quieres al añadirlo es
 *    ver qué cuenta — no esperar a la semana que viene.
 */
export interface Seguido {
  fromEmail: string;
  /** Cuándo lo empezaste a seguir. */
  createdAt: string;
}

export function desdeParaCada(
  seguidos: Seguido[],
  ultimaSintesis: string | null,
  tope: Date,
): Map<string, Date> {
  const ultima = ultimaSintesis ? new Date(Date.parse(ultimaSintesis)) : null;

  return new Map(
    seguidos.map((seguido) => {
      // Añadido después de la última síntesis: nunca se ha mirado.
      const nuevo =
        ultima === null || Date.parse(seguido.createdAt) >= ultima.getTime();
      if (nuevo) return [seguido.fromEmail, tope] as const;
      // Y nunca más atrás del tope: el buzón tampoco guarda más.
      return [
        seguido.fromEmail,
        new Date(Math.max(ultima.getTime(), tope.getTime())),
      ] as const;
    }),
  );
}

/** Los que entran en esta síntesis, ya filtrados por su propia ventana. */
export function dentroDeVentana<T extends { from_email: string; received_at: string }>(
  correos: T[],
  ventanas: Map<string, Date>,
): T[] {
  return correos.filter((correo) => {
    const desde = ventanas.get(correo.from_email);
    if (!desde) return false;
    return Date.parse(correo.received_at) >= desde.getTime();
  });
}

/**
 * De quién no ha llegado nada.
 *
 * Decirlo por su nombre en vez de "no hay boletines nuevos" es la diferencia
 * entre saber que Hosteltur no te escribe a ti —lo citan otros— y pensar que
 * la app no funciona.
 */
export function sinNoticias(
  seguidos: { fromEmail: string; name?: string | null }[],
  correos: { from_email: string }[],
): string[] {
  const conCorreo = new Set(correos.map((c) => c.from_email));
  return seguidos
    .filter((s) => !conCorreo.has(s.fromEmail))
    .map((s) => s.name ?? s.fromEmail);
}
