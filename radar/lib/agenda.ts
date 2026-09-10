import "server-only";
import { listEvents, type CalendarEntry } from "@/lib/google/calendar";
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

    return {
      slots: events.filter((e) => !e.allDay).map(toSlot).filter(isSlot),
      blocks: events.filter((e) => e.allDay).length,
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
    time: new Intl.DateTimeFormat("es-ES", {
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

function startOfToday(): Date {
  return new Date(`${ymd(new Date())}T00:00:00Z`);
}
