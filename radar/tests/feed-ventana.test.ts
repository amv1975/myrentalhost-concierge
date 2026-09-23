import { describe, expect, it } from "vitest";
import { dentroDeVentana, desdeParaCada, sinNoticias } from "@/lib/feed/ventana";

const TOPE = new Date("2026-09-16T12:00:00Z"); // hace 7 días
const ULTIMA = "2026-09-22T15:00:00Z"; // la síntesis de ayer

describe("desdeParaCada", () => {
  it("un boletín recién añadido mira toda la ventana del buzón", () => {
    // El fallo real: seguí a Hosteltur hoy, sincronicé, y no trajo nada
    // porque la ventana empezaba en la síntesis de ayer.
    const ventanas = desdeParaCada(
      [{ fromEmail: "nuevo@hosteltur.com", createdAt: "2026-09-23T10:00:00Z" }],
      ULTIMA,
      TOPE,
    );
    expect(ventanas.get("nuevo@hosteltur.com")).toEqual(TOPE);
  });

  it("uno que ya seguías arranca donde acabó la última síntesis", () => {
    const ventanas = desdeParaCada(
      [{ fromEmail: "viejo@apartur.com", createdAt: "2026-09-01T10:00:00Z" }],
      ULTIMA,
      TOPE,
    );
    expect(ventanas.get("viejo@apartur.com")?.getTime()).toBe(Date.parse(ULTIMA));
  });

  it("nunca mira más atrás de lo que guarda el buzón", () => {
    const ventanas = desdeParaCada(
      [{ fromEmail: "viejo@apartur.com", createdAt: "2026-01-01T00:00:00Z" }],
      "2026-09-10T00:00:00Z", // una síntesis más vieja que el tope
      TOPE,
    );
    expect(ventanas.get("viejo@apartur.com")).toEqual(TOPE);
  });

  it("sin ninguna síntesis previa, todos miran la ventana entera", () => {
    const ventanas = desdeParaCada(
      [{ fromEmail: "a@b.com", createdAt: "2026-09-01T00:00:00Z" }],
      null,
      TOPE,
    );
    expect(ventanas.get("a@b.com")).toEqual(TOPE);
  });
});

describe("dentroDeVentana", () => {
  const ventanas = desdeParaCada(
    [
      { fromEmail: "nuevo@hosteltur.com", createdAt: "2026-09-23T10:00:00Z" },
      { fromEmail: "viejo@apartur.com", createdAt: "2026-09-01T10:00:00Z" },
    ],
    ULTIMA,
    TOPE,
  );

  it("cada remitente se mide con su propia ventana", () => {
    const correos = [
      // De antes de la última síntesis: del nuevo entra, del viejo no.
      { from_email: "nuevo@hosteltur.com", received_at: "2026-09-18T08:00:00Z" },
      { from_email: "viejo@apartur.com", received_at: "2026-09-18T08:00:00Z" },
      // De después: entran los dos.
      { from_email: "viejo@apartur.com", received_at: "2026-09-23T08:00:00Z" },
    ];
    expect(dentroDeVentana(correos, ventanas)).toEqual([
      correos[0],
      correos[2],
    ]);
  });

  it("un remitente que ya no sigues no cuela por la puerta de atrás", () => {
    const correos = [
      { from_email: "dejado@otro.com", received_at: "2026-09-23T08:00:00Z" },
    ];
    expect(dentroDeVentana(correos, ventanas)).toEqual([]);
  });
});

describe("sinNoticias", () => {
  it("nombra a los que no han escrito, no solo que no hay nada", () => {
    const callados = sinNoticias(
      [
        { fromEmail: "a@hosteltur.com", name: "Hosteltur" },
        { fromEmail: "b@apartur.com", name: "Apartur" },
      ],
      [{ from_email: "b@apartur.com" }],
    );
    expect(callados).toEqual(["Hosteltur"]);
  });

  it("sin nombre, el correo sirve igual", () => {
    expect(
      sinNoticias([{ fromEmail: "x@y.com", name: null }], []),
    ).toEqual(["x@y.com"]);
  });
});
