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

/**
 * Cuándo empieza y acaba una cita, y si ocupa el día entero.
 *
 * Aparte de guardarla para poder probarlo sin base de datos, porque aquí está
 * la decisión que más se nota: **sin hora, el día entero**. El modelo tiene
 * prohibido inventarse la hora, así que "no la sé" llega hasta aquí intacto y
 * se convierte en un evento de día completo en vez de en una tarde bloqueada a
 * las doce de la noche. Un evento a una hora falsa es peor que uno sin hora.
 */
export function horarioDeCita(
  cita: { fecha: string; hora: string | null; hora_fin: string | null },
  timezone: string,
): { inicio: Date; fin: Date | null; todoElDia: boolean } | null {
  // El modelo puede devolver cualquier cosa aquí, y lo que llegue viene de un
  // correo que no es de fiar. Sin esta comprobación, una fecha mal formada no
  // daba una cita mala: reventaba la lectura del correo entera y el resumen
  // —lo único que se va a leer por la mañana— se perdía con ella.
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cita.fecha);
  if (!dia) return null;
  const [, a, m, d] = dia.map(Number);
  // Se reconstruye y se compara: así "2026-02-31" queda fuera, que con una
  // comprobación de rangos a ojo se colaría como 3 de marzo.
  const prueba = new Date(Date.UTC(a, m - 1, d));
  if (
    prueba.getUTCFullYear() !== a ||
    prueba.getUTCMonth() !== m - 1 ||
    prueba.getUTCDate() !== d
  ) {
    return null;
  }
  if (cita.hora !== null && !esHora(cita.hora)) return null;
  if (cita.hora_fin !== null && !esHora(cita.hora_fin)) return null;

  const inicio = zonedTimeToUtc(cita.fecha, cita.hora ?? "00:00", timezone);
  if (Number.isNaN(inicio.getTime())) return null;

  if (!cita.hora) return { inicio, fin: null, todoElDia: true };

  const fin = cita.hora_fin
    ? zonedTimeToUtc(cita.fecha, cita.hora_fin, timezone)
    : new Date(inicio.getTime() + DURACION_MS);

  // Un fin anterior al inicio es un error del modelo, no una cita de duración
  // negativa: se deja sin fin y el calendario le pone la duración por defecto.
  if (Number.isNaN(fin.getTime()) || fin.getTime() <= inicio.getTime()) {
    return { inicio, fin: new Date(inicio.getTime() + DURACION_MS), todoElDia: false };
  }

  return { inicio, fin, todoElDia: false };
}

/**
 * Una hora de reloj de verdad.
 *
 * El formato por sí solo no basta: "25:00" tiene la forma correcta y
 * Date.UTC lo acepta encantado, pasándolo a la una de la madrugada del día
 * siguiente. Una cita en el día equivocado es peor que ninguna cita.
 */
function esHora(valor: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(valor);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/** Lo que dura una cita cuando el correo no dice cuándo acaba. */
const DURACION_MS = 60 * 60_000;
