import { describe, expect, it } from "vitest";
import { llegada } from "@/lib/llegada";

// Jueves 1 de octubre de 2026, 10:00 en Madrid (08:00 UTC).
const AHORA = new Date("2026-10-01T08:00:00Z");

describe("llegada", () => {
  it("lo reciente, en minutos", () => {
    expect(llegada("2026-10-01T07:40:00Z", AHORA)).toBe("hace 20 min");
  });

  it("lo de hace un rato, en horas", () => {
    expect(llegada("2026-10-01T05:00:00Z", AHORA)).toBe("hace 3 h");
  });

  it("de ayer, con la hora de Madrid", () => {
    // 16:40 UTC del 30 son las 18:40 en Madrid.
    expect(llegada("2026-09-30T16:40:00Z", AHORA)).toBe("ayer 18:40");
  });

  it("de esta semana, con el día", () => {
    expect(llegada("2026-09-28T16:40:00Z", AHORA)).toMatch(/^lun 18:40$/);
  });

  it("lo viejo, con la fecha", () => {
    expect(llegada("2026-09-10T10:00:00Z", AHORA)).toBe("10 sept");
  });

  it("un reloj adelantado no da tiempos negativos", () => {
    expect(llegada("2026-10-01T08:01:00Z", AHORA)).toBe("ahora");
  });

  it("la medianoche de Madrid, no la de UTC, separa hoy de ayer", () => {
    // 22:30 UTC del 30 son las 00:30 del 1 en Madrid: hoy, no ayer.
    expect(llegada("2026-09-30T22:30:00Z", AHORA)).toBe("00:30");
  });

  it("una fecha rota no rompe la fila", () => {
    expect(llegada("no es una fecha", AHORA)).toBe("");
  });
});
