/**
 * Cómo es el día, no qué hay en él.
 *
 * La agenda enseñaba los eventos en fila —"HOY 17:30 tutoría", "MAÑANA 09:00
 * check-in"— y eso es una lista, no una respuesta. La pregunta de las siete de
 * la mañana no es "qué tengo apuntado"; es "¿cuándo puedo trabajar hoy?" y
 * "¿hay algo que se me va a pisar?".
 *
 * Las dos se contestan con aritmética sobre las mismas fechas que ya están
 * descargadas: ni una llamada más, ni un token. Y las dos cambian lo que haces
 * con el resto del parte — cinco cosas pendientes con la mañana libre no es lo
 * mismo que cinco con la mañana partida en tres.
 */

export interface Bloque {
  /** Cuándo empieza, en milisegundos. */
  start: number;
  /** Cuándo acaba. Si el evento no lo dice, una hora por defecto. */
  end: number;
  title: string;
  when: "hoy" | "mañana";
}

export interface Choque {
  a: string;
  b: string;
  when: "hoy" | "mañana";
}

export interface Hueco {
  /** En minutos. */
  minutos: number;
  desde: number;
  hasta: number;
}

/**
 * Dos cosas que se pisan.
 *
 * No hace falta que se solapen entero: quince minutos de solape ya significa
 * que a una de las dos vas a llegar tarde. Lo que se ignora es el empalme
 * exacto —una acaba a las 12:00 y la otra empieza a las 12:00—, que es normal
 * y no es un problema.
 */
export function choques(bloques: Bloque[]): Choque[] {
  const orden = [...bloques].sort((x, y) => x.start - y.start);
  const salida: Choque[] = [];

  for (let i = 0; i < orden.length; i += 1) {
    for (let j = i + 1; j < orden.length; j += 1) {
      if (orden[j].start >= orden[i].end) break;
      // Dos días distintos no se pisan aunque las horas coincidan. Con fechas
      // de verdad no llega a pasar, pero una comparación que depende de que
      // los datos vengan bien es una comparación que algún día se equivoca.
      if (orden[j].when !== orden[i].when) continue;
      salida.push({
        a: orden[i].title,
        b: orden[j].title,
        when: orden[i].when,
      });
    }
  }

  return salida;
}

/** Cuánto hay seguido, contando solo lo que todavía no ha pasado. */
export function huecos(
  bloques: Bloque[],
  ahora: number,
  finDelDia: number,
): Hueco[] {
  const hoy = bloques
    .filter((b) => b.when === "hoy" && b.end > ahora)
    .sort((x, y) => x.start - y.start);

  const salida: Hueco[] = [];
  let cursor = ahora;

  for (const bloque of hoy) {
    if (bloque.start > cursor) {
      salida.push({
        minutos: Math.round((bloque.start - cursor) / 60_000),
        desde: cursor,
        hasta: bloque.start,
      });
    }
    cursor = Math.max(cursor, bloque.end);
  }

  if (finDelDia > cursor) {
    salida.push({
      minutos: Math.round((finDelDia - cursor) / 60_000),
      desde: cursor,
      hasta: finDelDia,
    });
  }

  // Menos de media hora no es una ventana de trabajo, es el hueco entre dos
  // cosas. Prometerla como tiempo libre sería mentir.
  return salida.filter((h) => h.minutos >= 30);
}

/** El más largo, que es el que contesta "¿cuándo trabajo hoy?". */
export function mejorHueco(lista: Hueco[]): Hueco | null {
  return lista.reduce<Hueco | null>(
    (mejor, h) => (mejor === null || h.minutos > mejor.minutos ? h : mejor),
    null,
  );
}

export function duracion(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return horas === 1 ? "1 hora" : `${horas} horas`;
  return `${horas} h ${resto} min`;
}
