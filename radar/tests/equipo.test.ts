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
  it("cada línea lleva el enlace al correo original", () => {
    // Llega suelto a un grupo, entre otras veinte cosas, y a quien lo lee no
    // le sirve un resumen sin forma de abrir el correo: el buzón no es suyo.
    const texto = textoParaElEquipo([entrada({ id: "1" })]);

    expect(texto).toContain("Una huésped pide la factura");
    expect(texto).toContain("Booking.com");
    expect(texto).toContain("mail.google.com");
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
