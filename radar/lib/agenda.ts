import "server-only";
import { listEvents } from "@/lib/google/calendar";
import {
  IGNORED_KINDS,
  isRealAppointment,
  type CalendarEntry,
} from "@/lib/google/calendar-parse";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import type { Space } from "@/lib/types";
import {
  choques,
  duracion,
  huecos,
  mejorHueco,
  type Bloque,
  type Choque,
} from "@/lib/dia";

/**
 * Qué tienes hoy y mañana.
 *
 * Es lo primero del parte porque cambia cómo se lee todo lo demás: cinco cosas
 * pendientes con la mañana libre no es lo mismo que cinco con dos reuniones
 * encima. "Hoy no tienes nada" también es información, y de la que más
 * tranquiliza.
 *
 * Las citas y los bloqueos se separan porque no son lo mismo aunque compartan
 * calendario: una estancia de un huésped ocupa cuatro días enteros y no te pide
 * que estés en ningún sitio; una reunión a las 11:00, sí.
 */

export interface AgendaSlot {
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
  /** Estancias y demás bloques de día completo, que solo se cuentan. */
  blocks: number;
  /** Null si no se pudo mirar: mejor no decir nada que decir "no tienes nada". */
  ok: boolean;
}

const TZ = "Europe/Madrid";

/** El calendario se consulta como mucho una vez cada cinco minutos. Refrescar
 *  la página tras despachar una línea no puede costar una llamada a Google. */
const TTL_MS = 5 * 60_000;

let cached: { at: number; agenda: Agenda } | null = null;

export async function getAgenda(spaces: Space[]): Promise<Agenda> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.agenda;

  const agenda = await load(spaces);
  cached = { at: Date.now(), agenda };
  return agenda;
}

async function load(spaces: Space[]): Promise<Agenda> {
  const empty: Agenda = {
    slots: [],
    marco: null,
    pisados: [],
    blocks: 0,
    ok: false,
  };
  if (spaces.length === 0) return empty;

  try {
    const userId = await getIngestUserId(spaces[0].id);
    if (!userId) return empty;
    const accessToken = await getAccessToken(userId);

    const from = startOfToday();
    const to = new Date(from.getTime() + 2 * 86_400_000);

    // Normalmente los dos espacios apuntan al mismo calendario; si algún día no,
    // se miran los dos y se juntan.
    const calendars = [...new Set(spaces.map((s) => s.google_calendar_id))];
    const events = (
      await Promise.all(
        calendars.map((id) => listEvents(accessToken, id, from, to)),
      )
    ).flat();

    const real = events.filter(isRealAppointment);

    const bloques = real.map(toBloque).filter(isBloque);

    return {
      slots: real.map(toSlot).filter(isSlot),
      marco: describirDia(bloques),
      pisados: choques(bloques),
      // Solo lo que Google puso solo. Antes contaba también los cumpleaños y
      // cualquier cosa de día completo, así que "3 bloques de estancias" podía
      // no tener ninguna estancia dentro.
      blocks: events.filter((e) => e.allDay && IGNORED_KINDS.has(e.kind)).length,
      ok: true,
    };
  } catch {
    // Un fallo de Google no puede tumbar el parte entero: se queda sin la línea
    // de agenda y el resto se ve igual.
    return empty;
  }
}



/**
 * El día contado como lo contaría alguien.
 *
 * Solo dice algo cuando hay algo que decir: con la agenda vacía, la frase
 * sobra —el parte ya se lee como un día libre— y con el día acabado, prometer
 * una ventana de trabajo sería mentir.
 */
function describirDia(bloques: Bloque[]): string | null {
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

function hhmm(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Una hora por defecto: un evento sin fin no ocupa cero. */
const DURACION_POR_DEFECTO_MS = 3_600_000;

function toBloque(event: CalendarEntry): Bloque | null {
  if (!event.start || event.allDay) return null;
  const day = ymd(event.start);
  const when =
    day === ymd(new Date())
      ? "hoy"
      : day === ymd(new Date(Date.now() + 86_400_000))
        ? "mañana"
        : null;
  if (!when) return null;

  return {
    start: event.start.getTime(),
    end:
      event.end && event.end > event.start
        ? event.end.getTime()
        : event.start.getTime() + DURACION_POR_DEFECTO_MS,
    title: event.summary,
    when,
  };
}

function isBloque(bloque: Bloque | null): bloque is Bloque {
  return bloque !== null;
}

function toSlot(event: CalendarEntry): AgendaSlot | null {
  if (!event.start) return null;

  const day = ymd(event.start);
  const when =
    day === ymd(new Date())
      ? "hoy"
      : day === ymd(new Date(Date.now() + 86_400_000))
        ? "mañana"
        : null;
  if (!when) return null;

  return {
    when,
    time: event.allDay
      ? "todo el día"
      : new Intl.DateTimeFormat("es-ES", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(event.start),
    title: event.summary,
    location: event.location,
  };
}

function isSlot(slot: AgendaSlot | null): slot is AgendaSlot {
  return slot !== null;
}

function ymd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Medianoche de hoy en Madrid, no en UTC.
 *
 * El día se calcula en Madrid pero se montaba con una Z al final, así que la
 * ventana empezaba a las 00:00 UTC: en verano, las dos de la madrugada de
 * aquí. Lo que cayera entre medias no existía para el parte.
 */
function startOfToday(): Date {
  const hoy = ymd(new Date());
  // Se prueban los desfases posibles y se queda el que, formateado en Madrid,
  // vuelve a dar el mismo día a las 00:00. Más aburrido que una librería de
  // zonas horarias, y no se equivoca el fin de semana que cambia la hora.
  for (let desfase = -14; desfase <= 14; desfase += 1) {
    const candidato = new Date(
      Date.parse(`${hoy}T00:00:00Z`) - desfase * 3_600_000,
    );
    if (ymd(candidato) === hoy && horaEnMadrid(candidato) === 0) {
      return candidato;
    }
  }
  return new Date(`${hoy}T00:00:00Z`);
}

function horaEnMadrid(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
}
