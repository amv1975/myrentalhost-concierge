import { describe, expect, it } from "vitest";
import { buildLearnedSection } from "@/lib/extraction/learned-prompt";

/**
 * El bloque que enseña al modelo qué descartar. Importa que no se cuele vacío
 * y que transmita frecuencia: descartar diez veces lo mismo es una señal más
 * fuerte que descartar diez cosas distintas una vez.
 */
describe("buildLearnedSection", () => {
  it("no añade nada al prompt cuando no se ha descartado nada", () => {
    // Un bloque vacío con encabezado gastaría tokens en cada correo y podría
    // hacer que el modelo se invente qué evitar.
    expect(buildLearnedSection([])).toBe("");
  });

  it("incluye los títulos descartados", () => {
    const section = buildLearnedSection([
      { title: "Entrada del huésped en Balmes", type: "event", count: 1 },
    ]);
    expect(section).toContain("Entrada del huésped en Balmes");
    expect(section).toContain("ya ha descartado");
  });

  it("dice cuántas veces se descartó cuando pasó más de una", () => {
    const section = buildLearnedSection([
      { title: "Entrada del huésped", type: "event", count: 4 },
    ]);
    expect(section).toContain("descartado 4 veces");
  });

  it("no repite el recuento cuando solo pasó una vez", () => {
    const section = buildLearnedSection([
      { title: "Pagar la excursión", type: "action", count: 1 },
    ]);
    expect(section).not.toContain("veces");
  });

  it("pide generalizar, no comparar textos", () => {
    // Es lo que distingue esto de una lista de palabras prohibidas: quien
    // descarta las entradas de huéspedes tampoco quiere las salidas.
    const section = buildLearnedSection([
      { title: "Entrada del huésped en Balmes", type: "event", count: 2 },
    ]);
    expect(section).toMatch(/no en las palabras exactas/i);
  });
});
