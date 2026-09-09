import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "@/lib/extraction/dates";

const TZ = "Europe/Madrid";

describe("zonedTimeToUtc", () => {
  it("interpreta la hora en horario de invierno (UTC+1)", () => {
    // 5 de marzo de 2026, 17:30 en Barcelona = 16:30 UTC.
    expect(zonedTimeToUtc("2026-03-05", "17:30", TZ).toISOString()).toBe(
      "2026-03-05T16:30:00.000Z",
    );
  });

  it("interpreta la hora en horario de verano (UTC+2)", () => {
    // 5 de junio, mismo reloj local, una hora menos en UTC.
    expect(zonedTimeToUtc("2026-06-05", "17:30", TZ).toISOString()).toBe(
      "2026-06-05T15:30:00.000Z",
    );
  });

  it("usa el offset de la fecha del evento, no el de hoy", () => {
    // Este es el fallo que haría que un evento de julio guardado en enero
    // apareciera una hora corrido en el calendario.
    const invierno = zonedTimeToUtc("2026-01-15", "09:00", TZ);
    const verano = zonedTimeToUtc("2026-07-15", "09:00", TZ);
    expect(invierno.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(verano.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("resuelve la medianoche sin irse al día anterior", () => {
    expect(zonedTimeToUtc("2026-03-05", "00:00", TZ).toISOString()).toBe(
      "2026-03-04T23:00:00.000Z",
    );
  });

  it("resuelve una hora justo después del cambio de horario", () => {
    // En 2026 el cambio a horario de verano en España es el 29 de marzo a las
    // 02:00, que pasan a ser las 03:00. Las 03:30 de ese día ya son UTC+2.
    expect(zonedTimeToUtc("2026-03-29", "03:30", TZ).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });
});
