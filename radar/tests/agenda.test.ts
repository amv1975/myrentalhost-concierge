import { describe, expect, it } from "vitest";
import { isRealAppointment } from "@/lib/google/calendar-parse";

/**
 * El fallo: un lunes con una reunión puesta en el calendario, y el parte
 * diciendo "Sin citas hoy ni mañana. El día es tuyo."
 *
 * Eran dos cosas apiladas. La regla decía que un evento de día completo no es
 * una cita —escrita pensando en las estancias de los huéspedes, que ocupan
 * cuatro días y no te piden estar en ningún sitio— y de paso se tragaba todo
 * lo que uno pone a día completo a propósito. Y aunque no se la hubiera
 * tragado, tampoco habría podido enseñarla: el lector de Google solo miraba
 * `dateTime`, que los eventos de día completo no traen, así que llegaban sin
 * fecha ninguna.
 */
describe("qué cuenta como una cita en el parte", () => {
  it("lee la fecha de un evento de día completo", async () => {
    const { parseEvents } = await import("@/lib/google/calendar-parse");
    const [evento] = parseEvents([
      {
        id: "1",
        summary: "Preparar briefing normativa circulación",
        status: "confirmed",
        start: { date: "2026-09-14" },
        end: { date: "2026-09-15" },
      },
    ]);

    expect(evento.allDay).toBe(true);
    expect(evento.start).not.toBeNull();
    expect(evento.start?.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  it("una cita con hora conserva su hora", async () => {
    const { parseEvents } = await import("@/lib/google/calendar-parse");
    const [evento] = parseEvents([
      {
        id: "2",
        summary: "Tutoría",
        status: "confirmed",
        start: { dateTime: "2026-09-14T17:30:00+02:00" },
        end: { dateTime: "2026-09-14T18:00:00+02:00" },
      },
    ]);

    expect(evento.allDay).toBe(false);
    expect(evento.start?.toISOString()).toBe("2026-09-14T15:30:00.000Z");
  });
});


describe("lo que uno pone en su calendario cuenta, dure lo que dure", () => {
  function evento(over: Record<string, unknown> = {}) {
    return {
      id: "x",
      summary: "algo",
      start: new Date("2026-09-14T00:00:00Z"),
      end: new Date("2030-01-01T00:00:00Z"),
      allDay: false,
      location: null,
      kind: "default",
      ...over,
    };
  }

  it("un evento de día completo puesto por ti es una cita", () => {
    // El caso exacto: "Preparar briefing normativa circulación", un lunes, a
    // día completo. El parte decía "el día es tuyo".
    expect(isRealAppointment(evento({ allDay: true }))).toBe(true);
  });

  it("una estancia o un tren que Google sacó del correo, no", () => {
    // Esos son los que la regla vieja quería apartar, y son los únicos que
    // debía apartar: ocupan días enteros y no te piden estar en ningún sitio.
    expect(isRealAppointment(evento({ allDay: true, kind: "fromGmail" }))).toBe(false);
    expect(isRealAppointment(evento({ allDay: true, kind: "birthday" }))).toBe(false);
    expect(isRealAppointment(evento({ kind: "workingLocation" }))).toBe(false);
  });

  it("lo que ya terminó no organiza nada", () => {
    expect(
      isRealAppointment(evento({ end: new Date("2020-01-01T00:00:00Z") })),
    ).toBe(false);
  });
});
