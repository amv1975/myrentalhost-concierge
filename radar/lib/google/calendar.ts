import "server-only";

/**
 * Cliente de Google Calendar. Cuatro operaciones: insertar, actualizar por id,
 * cancelar por id, y listar lo que hay en una ventana de fechas.
 *
 * Ojo con la diferencia respecto a Gmail: aquí sí hay escritura, porque el
 * propósito de la app es poner eventos en el calendario. Lo que no hay es
 * ninguna forma de tocar un evento que Radar no haya creado — las tres
 * operaciones de escritura exigen el eventId que se guardó en
 * items.google_event_id, y ese campo solo lo escribe la sincronización.
 *
 * La lectura se añadió a propósito y a petición: un parte que no sabe si hoy
 * tienes reuniones no te organiza el día, te lo describe a medias. Solo lee, en
 * una ventana de dos días, y nunca lista los calendarios de la cuenta ni toca
 * su configuración. tests/permissions.test.ts vigila exactamente eso.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";

export interface CalendarEventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  /** Inicio y fin como instantes. */
  start: Date;
  end: Date;
  timeZone: string;
  /** Correos a los que invitar. En Familia, siempre Victoria. */
  attendees?: string[];
}

export interface CalendarEvent {
  id: string;
  htmlLink?: string;
  status?: string;
}

async function calendarRequest<T>(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown; params?: Record<string, string> },
): Promise<T> {
  const url = new URL(`${CALENDAR_API}${path}`);
  for (const [key, value] of Object.entries(init.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(
      `Calendar ${response.status} en ${path}: ${detail}`,
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

function toResource(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    attendees: input.attendees?.length
      ? input.attendees.map((email) => ({ email }))
      : undefined,
  };
}

export async function createEvent(
  accessToken: string,
  calendarId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  return calendarRequest<CalendarEvent>(
    accessToken,
    `/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: toResource(input),
      // Que quien esté invitado se entere del evento nuevo.
      params: { sendUpdates: "all" },
    },
  );
}

/**
 * Actualiza un evento existente. Es la razón de guardar google_event_id: cuando
 * el colegio mueve la hora, el evento del calendario se corrige en su sitio en
 * vez de aparecer duplicado.
 */
export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  return calendarRequest<CalendarEvent>(
    accessToken,
    `/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: toResource(input),
      params: { sendUpdates: "all" },
    },
  );
}

/**
 * Cancela un evento que Radar creó. Solo se llama al descartar un ítem que ya
 * estaba sincronizado: si Radar se inventó una reunión y tú la descartas, dejarla
 * en el calendario sería peor que quitarla.
 *
 * Un 404 o un 410 significan que ya no está, y eso es el resultado buscado.
 */
export async function cancelEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await calendarRequest<void>(
      accessToken,
      `/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", params: { sendUpdates: "all" } },
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 410) return;
    throw error;
  }
}


export interface CalendarEntry {
  id: string;
  summary: string;
  /** Null en los eventos de día completo. */
  start: Date | null;
  end: Date | null;
  /** Los bloqueos de estancias son de día completo; las citas, no. */
  allDay: boolean;
  location: string | null;
  /** Cómo nació el evento. "fromGmail" es un evento que Google se inventó
   *  leyendo un correo, no algo que nadie haya puesto en la agenda. */
  kind: string;
}

/**
 * Lo que hay en el calendario entre dos instantes.
 *
 * `singleEvents` expande las series repetidas en sus ocurrencias: sin eso, una
 * reunión semanal aparecería como un único evento con su regla de repetición y
 * habría que resolverla a mano.
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEntry[]> {
  const data = await calendarRequest<{
    items?: {
      id: string;
      summary?: string;
      status?: string;
      eventType?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }[];
  }>(accessToken, `/${encodeURIComponent(calendarId)}/events`, {
    method: "GET",
    params: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    },
  });

  return (data.items ?? [])
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({
      id: event.id,
      summary: event.summary?.trim() || "(sin título)",
      start: event.start?.dateTime ? new Date(event.start.dateTime) : null,
      end: event.end?.dateTime ? new Date(event.end.dateTime) : null,
      allDay: !event.start?.dateTime,
      location: event.location ?? null,
      kind: event.eventType ?? "default",
    }));
}
