import "server-only";
import { listEvents } from "@/lib/google/calendar";
import {
  IGNORED_KINDS,
  isRealAppointment,
  type CalendarEntry,
} from "@/lib/google/calendar-parse";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import type { Space } from "@/lib/types";

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
  const empty: Agenda = { slots: [], blocks: 0, ok: false };
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

    return {
      slots: real.map(toSlot).filter(isSlot),
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
