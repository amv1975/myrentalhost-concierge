import { describe, expect, it } from "vitest";
import { buildInboxQuery, knownSpaceFor } from "@/lib/ingest/query";
import type { Source } from "@/lib/types";

function source(overrides: Partial<Source & { space_key: string }>): Source & {
  space_key?: string;
} {
  return {
    id: "s1",
    space_id: "sp",
    kind: "domain",
    value: "lestonnacbcn.org",
    enabled: true,
    space_key: "family",
    ...overrides,
  };
}

describe("buildInboxQuery", () => {
  it("se lleva la bandeja entera dentro de la ventana", () => {
    // Ya no hay lista blanca: lo que importa suele venir de quien no esperas.
    const query = buildInboxQuery(14);
    expect(query).toContain("newer_than:14d");
    expect(query).not.toContain("from:");
  });

  it("deja fuera lo que Gmail ya ha apartado", () => {
    // Es la mayor parte del volumen y ahí no hay compromisos: leerlo con el
    // modelo sería pagar por ruido.
    const query = buildInboxQuery(7);
    for (const excluded of [
      "-category:promotions",
      "-category:social",
      "-category:forums",
      "-in:spam",
      "-in:trash",
      "-in:sent",
      "-in:draft",
    ]) {
      expect(query).toContain(excluded);
    }
  });
});

describe("knownSpaceFor", () => {
  it("un remitente conocido se salta la clasificación", () => {
    expect(
      knownSpaceFor("avisos@lestonnacbcn.org", [], [source({})]),
    ).toBe("family");
  });

  it("un dominio de remitente cubre sus subdominios", () => {
    const booking = source({
      kind: "domain",
      value: "booking.com",
      space_key: "work",
    });
    expect(knownSpaceFor("noreply@guest.booking.com", [], [booking])).toBe(
      "work",
    );
  });

  it("reconoce por el buzón al que escriben, no solo por quién escribe", () => {
    // El caso real: una gestoría externa manda una factura. Su dominio nunca
    // estará en la lista, pero la dirección a la que escribe sí.
    const buzon = source({
      kind: "to_email",
      value: "administracion@myrentalhost.com",
      space_key: "work",
    });
    expect(
      knownSpaceFor(
        "anavajas@connectandenjoy.com",
        ["administracion@myrentalhost.com"],
        [buzon],
      ),
    ).toBe("work");
  });

  it("cuenta también cuando el buzón va en copia", () => {
    const empresa = source({
      kind: "to_domain",
      value: "myrentalhost.com",
      space_key: "work",
    });
    expect(
      knownSpaceFor(
        "quien@sea.com",
        ["alguien@ejemplo.com", "agus@myrentalhost.com"],
        [empresa],
      ),
    ).toBe("work");
  });

  it("lo desconocido no se decide aquí: lo clasifica el modelo", () => {
    expect(knownSpaceFor("desconocido@ejemplo.com", [], [source({})])).toBeNull();
  });

  it("una fuente desactivada no cuenta", () => {
    expect(
      knownSpaceFor("avisos@lestonnacbcn.org", [], [source({ enabled: false })]),
    ).toBeNull();
  });
});
