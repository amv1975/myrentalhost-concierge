/**
 * Enlace al evento en Google Calendar.
 *
 * No existe una forma pública y estable de abrir un evento concreto por su
 * identificador, así que se abre el día en el que cae. En el móvil eso lanza la
 * app de Calendar, que es lo que se quiere al pulsar desde una tarjeta.
 */
export function googleCalendarDayUrl(startsAt: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startsAt));

  const [year, month, day] = parts.split("-").map(Number);
  return `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;
}
