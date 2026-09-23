import { describe, expect, it } from "vitest";
import {
  desdeCuando,
  estadoDelHilo,
  type MensajeDelHilo,
} from "@/lib/google/hilo-parse";

const T = (iso: string) => Date.parse(iso);

function suyo(iso: string, from = "huesped@ejemplo.com"): MensajeDelHilo {
  return { labelIds: ["INBOX"], internalDate: T(iso), fromEmail: from };
}

function mio(iso: string): MensajeDelHilo {
  return {
    labelIds: ["SENT"],
    internalDate: T(iso),
    fromEmail: "agus@myrentalhost.com",
  };
}

describe("estadoDelHilo", () => {
  it("dos mensajes seguidos suyos son dos sin responder", () => {
    // El caso del brief: François escribió anoche y otra vez esta mañana.
    const estado = estadoDelHilo([
      mio("2026-09-21T10:00:00Z"),
      suyo("2026-09-22T21:00:00Z"),
      suyo("2026-09-23T08:00:00Z"),
    ]);
    expect(estado.sinResponder).toBe(2);
    // Espera desde el primero sin contestar, no desde el último.
    expect(estado.esperandoDesde?.toISOString()).toBe("2026-09-22T21:00:00.000Z");
  });

  it("si contestaste el último, nadie espera", () => {
    const estado = estadoDelHilo([
      suyo("2026-09-22T21:00:00Z"),
      mio("2026-09-23T08:00:00Z"),
    ]);
    expect(estado).toEqual({ esperandoDesde: null, sinResponder: 0 });
  });

  it("un correo tuyo desde otra cuenta tuya no te está esperando", () => {
    // Redirige victoria@ e info@ a su Gmail: llegan sin la etiqueta SENT.
    const estado = estadoDelHilo(
      [
        suyo("2026-09-22T10:00:00Z"),
        suyo("2026-09-23T08:00:00Z", "victoria@myrentalhost.com"),
      ],
      ["victoria@myrentalhost.com"],
    );
    expect(estado.sinResponder).toBe(0);
  });

  it("el orden en que Gmail los devuelva da igual", () => {
    const desordenado = estadoDelHilo([
      suyo("2026-09-23T08:00:00Z"),
      mio("2026-09-21T10:00:00Z"),
      suyo("2026-09-22T21:00:00Z"),
    ]);
    expect(desordenado.sinResponder).toBe(2);
  });

  it("un hilo de un solo correo suyo cuenta como uno esperando", () => {
    expect(estadoDelHilo([suyo("2026-09-23T08:00:00Z")]).sinResponder).toBe(1);
  });

  it("un hilo vacío no inventa a nadie esperando", () => {
    expect(estadoDelHilo([])).toEqual({ esperandoDesde: null, sinResponder: 0 });
  });

  it("mayúsculas y espacios en la dirección no lo despistan", () => {
    const estado = estadoDelHilo(
      [suyo("2026-09-23T08:00:00Z", " Victoria@MyRentalHost.com ")],
      ["victoria@myrentalhost.com"],
    );
    expect(estado.sinResponder).toBe(0);
  });
});

describe("desdeCuando", () => {
  const ahora = new Date("2026-09-23T10:00:00Z");

  it("lo dice como lo diría alguien, no en horas", () => {
    expect(desdeCuando(new Date("2026-09-23T09:00:00Z"), ahora)).toBe("hace un rato");
    expect(desdeCuando(new Date("2026-09-23T02:00:00Z"), ahora)).toBe("desde esta mañana");
    expect(desdeCuando(new Date("2026-09-22T12:00:00Z"), ahora)).toBe("desde ayer");
    expect(desdeCuando(new Date("2026-09-20T10:00:00Z"), ahora)).toBe("desde hace 3 días");
  });
});
