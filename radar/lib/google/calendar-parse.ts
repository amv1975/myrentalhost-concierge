/**
 * De lo que devuelve Google a lo que entiende el parte.
 *
 * Vive aparte de la llamada, sin "server-only", para poder probarlo: el fallo
 * que motivó estos tests —un evento de día completo llegando sin fecha— estaba
 * en dos líneas de aquí que solo miraban `dateTime`, y no había forma de verlo
 * sin un calendario de verdad delante.
 */

export interface CalendarEntry {
  id: string;
  summary: string;
  /** Medianoche UTC del día, en los eventos de día completo. */
  start: Date | null;
  end: Date | null;
  /** Los bloqueos de estancias son de día completo; las citas, no. */
  allDay: boolean;
  location: string | null;
  /** Cómo nació el evento. "fromGmail" es un evento que Google se inventó
   *  leyendo un correo, no algo que nadie haya puesto en la agenda. */
  kind: string;
}

/** La fecha de un evento, venga con hora o sea de día completo. */
function fecha(
  campo: { dateTime?: string; date?: string } | undefined,
): Date | null {
  if (campo?.dateTime) return new Date(campo.dateTime);
  if (campo?.date) return new Date(`${campo.date}T00:00:00Z`);
  return null;
}

/**
 * De lo que devuelve Google a lo que entiende el parte.
 *
 * Separado de la llamada para poder probarlo: el fallo que motivó estos tests
 * —un evento de día completo llegando sin fecha— vivía justo aquí, en dos
 * líneas que solo miraban `dateTime`, y no había forma de verlo sin un
 * calendario de verdad delante.
 */
export function parseEvents(
  eventos: {
    id: string;
    summary?: string;
    status?: string;
    eventType?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }[],
): CalendarEntry[] {
  return eventos
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({
      id: event.id,
      summary: event.summary?.trim() || "(sin título)",
      // Un evento de día completo no trae `dateTime`, trae `date`. Leer solo
      // `dateTime` los dejaba sin fecha ninguna, así que aunque alguien
      // quisiera enseñarlos no habría podido: no había con qué saber si eran
      // de hoy. Se colocan a medianoche UTC, que en Madrid cae ese mismo día.
      start: fecha(event.start),
      end: fecha(event.end),
      allDay: !event.start?.dateTime,
      location: event.location ?? null,
      kind: event.eventType ?? "default",
    }));
}

/**
 * Qué es una cita de verdad.
 *
 * Google mete en el calendario cosas que nadie ha puesto ahí: eventos que se
 * inventa leyendo tu correo (un tren, una estancia, un paquete), cumpleaños y
 * marcadores de dónde trabajas. En una agenda que dice "esto es tu día" eso no
 * son citas, son ruido — y ver a las once de la mañana un webinar de las dos
 * de la madrugada como si fuera lo primero del día quita toda la credibilidad.
 *
 * Lo que decide NO es si dura todo el día. Esa regla estaba escrita pensando
 * en las estancias de los huéspedes —cuatro días en el calendario que no te
 * piden estar en ningún sitio— y se tragaba de paso todo lo que uno pone a día
 * completo a propósito: una reunión sin hora cerrada, un vencimiento, un viaje.
 * Un lunes con algo puesto en la agenda salía como "el día es tuyo", que es la
 * peor mentira que puede decir esta pantalla.
 *
 * Lo que de verdad separa una cosa de la otra es quién la puso: las estancias y
 * los trenes los crea Google leyendo el correo y vienen marcados como tales.
 * Lo que pusiste tú, cuenta, dure una hora o el día entero.
 *
 * Lo pasado se va igual: una cita que ya terminó no organiza nada.
 */
export function isRealAppointment(event: CalendarEntry): boolean {
  if (IGNORED_KINDS.has(event.kind)) return false;
  if (event.end && event.end.getTime() < Date.now()) return false;
  return true;
}

export const IGNORED_KINDS = new Set([
  "fromGmail",
  "birthday",
  "workingLocation",
]);
