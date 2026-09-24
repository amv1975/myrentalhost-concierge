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
  describirDia,
  sinLoOculto,
  type Agenda,
  type AgendaSlot,
  type Bloque,
} from "@/lib/dia";

export type { Agenda, AgendaSlot } from "@/lib/dia";
export { sinLoOculto } from "@/lib/dia";

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

const TZ = "Europe/Madrid";

/** El calendario se consulta como mucho una vez cada cinco minutos. Refrescar
 *  la página tras despachar una línea no puede costar una llamada a Google. */
const TTL_MS = 5 * 60_000;

let cached: { at: number; agenda: Agenda } | null = null;

export async function getAgenda(spaces: Space[]): Promise<Agenda> {
  const fresca =
    cached && Date.now() - cached.at < TTL_MS
      ? cached.agenda
      : await load(spaces);

  if (!cached || cached.agenda !== fresca) {
    cached = { at: Date.now(), agenda: fresca };
  }

  // Lo oculto se aplica DESPUÉS del caché, no dentro. Si entrara en la parte
  // cacheada, despachar una cita no se vería hasta cinco minutos después, y
  // un botón que tarda cinco minutos en hacer efecto es un botón roto.
  return sinLoOculto(fresca, await leerOcultos());
}

async function leerOcultos(): Promise<Set<string>> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createAdminClient()
      .from("agenda_ocultos")
      .select("google_event_id");
    if (error) throw error;
    return new Set(
      ((data ?? []) as { google_event_id: string }[]).map(
        (f) => f.google_event_id,
      ),
    );
  } catch {
    // La tabla puede no estar creada todavía. Que falte algo opcional no
    // puede dejar sin agenda a nadie.
    return new Set();
  }
}

async function load(spaces: Space[]): Promise<Agenda> {
  const empty: Agenda = {
    slots: [],
    marco: null,
    pisados: [],
    bloques: [],
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
      bloques,
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
    id: event.id,
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
    id: event.id,
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
