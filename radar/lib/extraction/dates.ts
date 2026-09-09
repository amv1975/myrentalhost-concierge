/**
 * Conversión de hora local con zona a instante UTC, sin dependencias.
 *
 * El modelo devuelve "2026-03-05" y "17:30" como hora local de Barcelona. Si
 * eso se guardara interpretándolo como UTC, en verano todos los eventos
 * saldrían dos horas antes. Y usar el offset de hoy tampoco vale: un evento de
 * julio guardado en enero necesita el offset de julio, no el de enero.
 *
 * El método: interpretar la hora como si fuera UTC, preguntarle a Intl qué hora
 * local sería ese instante en la zona, y corregir por la diferencia. Se itera
 * una vez porque en el salto de horario la primera corrección puede caer al
 * otro lado del cambio.
 */
export function zonedTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let utc = target;
  for (let i = 0; i < 2; i++) {
    const offset = zoneOffsetMs(new Date(utc), timeZone);
    const corrected = target - offset;
    if (corrected === utc) break;
    utc = corrected;
  }

  return new Date(utc);
}

/** Cuánto va la zona por delante de UTC en ese instante concreto, en ms. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  // Intl da 24 para medianoche con hour12:false en algunos entornos.
  const hour = get("hour") % 24;

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );

  return asUtc - instant.getTime();
}

/** La fecha del día siguiente, en formato AAAA-MM-DD. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Duración por defecto de un evento sin hora de fin. Una hora: suficiente para
 * que ocupe hueco en el calendario sin bloquear la tarde entera.
 */
export const DEFAULT_EVENT_MINUTES = 60;

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}
