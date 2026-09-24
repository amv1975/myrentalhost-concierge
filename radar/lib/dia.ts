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
  /** El id del evento en Google, para poder ocultarlo. */
  id: string;
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


const TZ = "Europe/Madrid";

function ymd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hhmm(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export interface AgendaSlot {
  /** El id del evento en Google. Con él se oculta, y solo aquí. */
  id: string;
  when: "hoy" | "mañana";
  time: string;
  title: string;
  location: string | null;
}



export interface Agenda {
  slots: AgendaSlot[];
  /**
   * Cómo es el día, en una frase.
   *
   * Los eventos en fila son una lista; esto es la respuesta. "Tenés la mañana
   * libre hasta las 11:45" cambia lo que haces con el resto del parte, y
   * "HOY 11:45 médico" no.
   */
  marco: string | null;
  /** Lo que se pisa, hoy o mañana. Vacío casi siempre. */
  pisados: Choque[];
  /** Las citas con hora, en crudo: hacen falta para rehacer el marco al
   *  ocultar una. */
  bloques: Bloque[];
  /** Estancias y demás bloques de día completo, que solo se cuentan. */
  blocks: number;
  /** Null si no se pudo mirar: mejor no decir nada que decir "no tienes nada". */
  ok: boolean;
}



/**
 * Quita de la agenda lo ya despachado, y rehace lo que dependía de ello.
 *
 * El marco del día y los choques se recalculan sin lo oculto a propósito: si
 * despachaste la cita que te partía la mañana, la mañana ya no está partida.
 */
export function sinLoOculto(agenda: Agenda, ocultos: Set<string>): Agenda {
  if (ocultos.size === 0 || !agenda.ok) return agenda;

  const slots = agenda.slots.filter((slot) => !ocultos.has(slot.id));
  const bloques = agenda.bloques.filter((b) => !ocultos.has(b.id));

  return {
    ...agenda,
    slots,
    bloques,
    marco: describirDia(bloques),
    pisados: choques(bloques),
  };
}



/**
 * El día contado como lo contaría alguien.
 *
 * Solo dice algo cuando hay algo que decir: con la agenda vacía, la frase
 * sobra —el parte ya se lee como un día libre— y con el día acabado, prometer
 * una ventana de trabajo sería mentir.
 */
export function describirDia(bloques: Bloque[]): string | null {
  const ahora = Date.now();
  const hoy = bloques.filter((b) => b.when === "hoy");
  if (hoy.length === 0) return null;

  const fin = finDeJornada().getTime();
  const libres = huecos(hoy, ahora, fin);
  const mejor = mejorHueco(libres);
  if (!mejor) return "Hoy ya no queda hueco libre entre lo que tenés apuntado.";

  const hasta = hhmm(new Date(mejor.hasta));
  const desde = hhmm(new Date(mejor.desde));
  const cuanto = duracion(mejor.minutos);

  // Que el hueco llegue hasta el final de la jornada quiere decir que ya no
  // hay nada después: "hasta las 19:00" suena a tope y no lo es.
  const abierto = mejor.hasta >= fin;
  if (abierto) {
    return hoy.every((b) => b.end <= ahora)
      ? `El resto del día lo tenés libre: ${cuanto} desde las ${desde}.`
      : `Después de lo de hoy te quedan ${cuanto}, desde las ${desde}.`;
  }

  return `Tu hueco más largo de hoy son ${cuanto}, de ${desde} a ${hasta}.`;
}

/** Hasta qué hora cuenta el día como trabajable. */
function finDeJornada(): Date {
  const hoy = ymd(new Date());
  for (const desfase of ["+02:00", "+01:00"]) {
    const t = new Date(Date.parse(`${hoy}T19:00:00${desfase}`));
    if (ymd(t) === hoy) return t;
  }
  return new Date(`${hoy}T19:00:00Z`);
}


