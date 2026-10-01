/**
 * Cuándo llegó un correo, dicho como lo diría alguien.
 *
 * Antes era una columna fija a la izquierda con la hora —"10:12"— en cada
 * fila. Costaba sesenta píxeles de cada línea en un móvil, y esos sesenta
 * píxeles eran los que le faltaban al titular para no partirse en tres
 * renglones. Y la hora sola no decía de qué día era: "18:40" puede ser hace un
 * rato o el martes.
 *
 * Relativa cuando está cerca, con fecha cuando no: "hace 20 min", "ayer
 * 18:40", "lun 18:40", "28 sept".
 */
const TZ = "Europe/Madrid";

function dia(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

function hora(fecha: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

export function llegada(iso: string, ahora = new Date()): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";

  const minutos = Math.round((ahora.getTime() - fecha.getTime()) / 60_000);
  // Un reloj del servidor un poco adelantado no puede dar "hace -2 min".
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;

  const hoy = dia(ahora);
  const ayer = dia(new Date(ahora.getTime() - 86_400_000));
  const suDia = dia(fecha);

  if (suDia === hoy) {
    const horas = Math.round(minutos / 60);
    return horas < 6 ? `hace ${horas} h` : hora(fecha);
  }
  if (suDia === ayer) return `ayer ${hora(fecha)}`;

  // Dentro de la semana, el día de la semana dice más que la fecha.
  if (minutos < 6 * 24 * 60) {
    const semana = new Intl.DateTimeFormat("es-ES", {
      timeZone: TZ,
      weekday: "short",
    })
      .format(fecha)
      .replace(".", "");
    return `${semana} ${hora(fecha)}`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  })
    .format(fecha)
    .replace(".", "");
}
