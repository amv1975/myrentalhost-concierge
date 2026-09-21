import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, textoParaElEquipo } from "@/lib/equipo";
import type { ParteEntry } from "@/lib/parte";

function entrada(over: Partial<ParteEntry> & { id: string }): ParteEntry {
  return {
    kind: "email",
    life: "work",
    urgent: false,
    at: "2026-09-21T08:00:00Z",
    who: "Booking.com",
    headline: "Una huésped pide la factura de su reserva",
    detail: null,
    when: null,
    fromEmail: "noreply@booking.com",
    subject: "Invoice request",
    actionable: true,
    link: null,
    reading: false,
    gmailMessageId: "abc123",
    starred: false,
    agenda: null,
    ...over,
  };
}

describe("lo que le llega al equipo", () => {
  it("nunca lleva un enlace al buzón de Agustín", () => {
    // El equipo no tiene acceso a su Gmail, así que ese enlace no abría nada:
    // era ocupar la mitad del mensaje con algo inservible.
    const texto = textoParaElEquipo([entrada({ id: "1" })]);
    expect(texto).not.toContain("mail.google.com");
  });

  it("lleva con qué buscarlo en el sitio de ellos", () => {
    // Entran por Airbnb, por Booking o por el programa de facturación. Sin el
    // nombre del huésped o el código de reserva no pueden abrir nada.
    const texto = textoParaElEquipo([
      entrada({
        id: "1",
        detail:
          "Reserva 4782913 a nombre de Marta Ruiz, piso Gràcia 4. Pide la factura desde el lunes.",
      }),
    ]);

    expect(texto).toContain("Una huésped pide la factura");
    expect(texto).toContain("4782913");
    expect(texto).toContain("Marta Ruiz");
    expect(texto).toContain("Gràcia 4");
    expect(texto).toContain("Booking.com");
  });

  it("sin detalle, el mensaje sigue teniendo sentido", () => {
    const texto = textoParaElEquipo([entrada({ id: "1", detail: null })]);
    expect(texto).toContain("Una huésped pide la factura");
    expect(texto).toContain("Booking.com");
    expect(texto).not.toContain("null");
  });

  it("numera y dice cuántas son", () => {
    const texto = textoParaElEquipo([
      entrada({ id: "1" }),
      entrada({ id: "2", headline: "Factura del piso de Entença lista" }),
    ]);

    expect(texto).toContain("2 cosas para mirar:");
    expect(texto).toContain("1.");
    expect(texto).toContain("2.");
  });

  it("con una sola, no dice '1 cosas'", () => {
    expect(textoParaElEquipo([entrada({ id: "1" })])).toContain("Una cosa");
  });

  it("sin nada seleccionado no hay mensaje", () => {
    expect(textoParaElEquipo([])).toBe("");
  });

  it("incluye el vencimiento cuando lo hay", () => {
    const texto = textoParaElEquipo([entrada({ id: "1", when: "vie 25 sept" })]);
    expect(texto).toContain("(vie 25 sept)");
  });

  it("el enlace de WhatsApp escapa el texto entero", () => {
    // Un asunto con & o # partiría la URL y el equipo recibiría media frase.
    const texto = textoParaElEquipo([
      entrada({ id: "1", headline: "Luz & agua: #1234 pendiente" }),
    ]);
    const url = enlaceWhatsApp(texto);

    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).not.toContain("#1234");
    expect(decodeURIComponent(url.split("text=")[1])).toContain("Luz & agua: #1234");
  });
});
