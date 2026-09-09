const TZ = "Europe/Madrid";

const dateTimeFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dateWithYearFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatDate(value: string): string {
  // Las fechas límite son DATE (sin hora); tratarlas como UTC evita que un
  // "2026-03-05" se muestre como 4 de marzo por el desfase de zona.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return dateFormat.format(date);
}

export function formatDateWithYear(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return dateWithYearFormat.format(date);
}

/** "hace 3 días", "hoy", "en 2 días". */
export function relativeDays(value: string, now = new Date()): string {
  const days = daysBetween(value, now);
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  if (days > 1) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
}

/** Días de calendario en Europe/Madrid entre hoy y la fecha dada. */
export function daysBetween(value: string, now = new Date()): number {
  const target = startOfDayMadrid(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value),
  );
  const today = startOfDayMadrid(now);
  return Math.round((target - today) / 86_400_000);
}

function startOfDayMadrid(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Date.parse(`${parts}T00:00:00Z`);
}
