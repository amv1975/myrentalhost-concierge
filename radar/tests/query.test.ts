import { describe, expect, it } from "vitest";
import { buildGmailQuery, matchesSource } from "@/lib/ingest/query";
import type { Source } from "@/lib/types";

function source(overrides: Partial<Source>): Source {
  return {
    id: "s1",
    space_id: "sp",
    kind: "domain",
    value: "lestonnacbcn.org",
    enabled: true,
    ...overrides,
  };
}

describe("buildGmailQuery", () => {
  it("sin fuentes no construye query", () => {
    // Una query vacía se llevaría la bandeja entera.
    expect(buildGmailQuery([], 14)).toBeNull();
  });

  it("busca por remitente y por destinatario", () => {
    const query = buildGmailQuery(
      [
        source({ kind: "domain", value: "airbnb.com" }),
        source({ kind: "to_email", value: "administracion@myrentalhost.com" }),
      ],
      14,
    );
    expect(query).toContain("from:airbnb.com");
    expect(query).toContain("to:administracion@myrentalhost.com");
    expect(query).toContain("newer_than:14d");
  });
});

describe("matchesSource", () => {
  const gestoria = source({
    kind: "to_email",
    value: "administracion@myrentalhost.com",
  });

  it("acepta un remitente desconocido si escribe al buzón vigilado", () => {
    // El caso real: una gestoría externa manda una factura. Su dominio nunca
    // estará en una lista blanca, pero la dirección a la que escribe sí.
    expect(
      matchesSource("anavajas@connectandenjoy.com", [gestoria], [
        "administracion@myrentalhost.com",
      ]),
    ).toBe(true);
  });

  it("cuenta también cuando el buzón va en copia", () => {
    expect(
      matchesSource("otro@ejemplo.com", [gestoria], [
        "alguien@ejemplo.com",
        "administracion@myrentalhost.com",
      ]),
    ).toBe(true);
  });

  it("rechaza lo que no va a ninguna dirección vigilada", () => {
    expect(
      matchesSource("spam@ejemplo.com", [gestoria], ["otra@cosa.com"]),
    ).toBe(false);
  });

  it("un dominio de destino cubre cualquier buzón de la empresa", () => {
    const empresa = source({ kind: "to_domain", value: "myrentalhost.com" });
    expect(
      matchesSource("quien@sea.com", [empresa], ["agus@myrentalhost.com"]),
    ).toBe(true);
  });

  it("sigue funcionando por remitente, sin destinatarios", () => {
    expect(matchesSource("avisos@lestonnacbcn.org", [source({})])).toBe(true);
    expect(matchesSource("otro@ejemplo.com", [source({})])).toBe(false);
  });

  it("un dominio de remitente cubre sus subdominios", () => {
    const booking = source({ kind: "domain", value: "booking.com" });
    expect(matchesSource("noreply@guest.booking.com", [booking])).toBe(true);
  });
});
