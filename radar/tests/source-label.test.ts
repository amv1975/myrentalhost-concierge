import { describe, expect, it } from "vitest";
import { sourceLabel } from "@/lib/source-label";

describe("sourceLabel", () => {
  it("prefiere el nombre del remitente cuando es reconocible", () => {
    expect(sourceLabel("noreply@apartur.com", "Apartur")).toBe("Apartur");
  });

  it("se queda con la marca y descarta el subdominio del envío", () => {
    // guest.booking.com y express.airbnb.com son el mismo sitio de siempre.
    expect(sourceLabel("noreply@guest.booking.com")).toBe("booking.com");
    expect(sourceLabel("express@airbnb.com")).toBe("airbnb.com");
  });

  it("usa el dominio si el nombre no aporta", () => {
    expect(sourceLabel("avisos@lestonnacbcn.org", "avisos@lestonnacbcn.org")).toBe(
      "lestonnacbcn.org",
    );
  });

  it("conserva la etiqueta que da sentido a un .co.uk", () => {
    expect(sourceLabel("hola@mail.ejemplo.co.uk")).toBe("ejemplo.co.uk");
  });

  it("descarta nombres larguísimos de sistema", () => {
    const largo = "Sistema automatizado de notificaciones del centro";
    expect(sourceLabel("noreply@maileducamos.com", largo)).toBe(
      "maileducamos.com",
    );
  });

  it("no rompe si no hay remitente", () => {
    expect(sourceLabel(null, null)).toBeNull();
  });
});
