import { describe, expect, it } from "vitest";
import {
  buildIgnoredSection,
  subjectShape,
} from "@/lib/triage/learned-prompt";

describe("lo que la app aprende a no traer", () => {
  it("sin nada descartado no añade nada al prompt", () => {
    // Un encabezado sin ejemplos gasta tokens en cada lote y puede hacer que el
    // modelo se invente qué evitar.
    expect(buildIgnoredSection([])).toBe("");
  });

  it("enseña a generalizar por tipo de aviso, no por remitente", () => {
    const section = buildIgnoredSection([
      { who: "Airbnb", subject: "Entrada del huésped en Balmes", count: 4 },
    ]);
    expect(section).toContain("Entrada del huésped en Balmes");
    expect(section).toContain("descartado 4 veces");
    expect(section).toContain("no en las palabras ni en quién lo manda");
  });

  it("un remitente descartado no queda vetado para siempre", () => {
    // Es el fallo que arruinaría esto: bloquear a Airbnb porque molestan sus
    // avisos de entrada, y perderse el día que mandan una incidencia.
    const section = buildIgnoredSection([
      { who: "Airbnb", subject: "Entrada del huésped", count: 9 },
    ]);
    expect(section).toContain("NO lo convierte en ruido para siempre");
  });
});

describe("agrupar lo descartado", () => {
  it("el mismo aviso con otro huésped es el mismo aviso", () => {
    // Sin esto, cada correo sería un ejemplo suelto con cuenta 1 y nunca se
    // vería que ese tipo de aviso se descarta siempre.
    expect(subjectShape("Reservation confirmed - Alma Oetoyo arrives Sep 25")).toBe(
      subjectShape("Reservation confirmed - Alma Oetoyo arrives Sep 30"),
    );
  });

  it("los números se borran, las palabras no", () => {
    expect(subjectShape("Factura M005-26 por 6.995,35 €")).toBe(
      "factura m# # por # # #",
    );
  });

  it("dos avisos distintos siguen siendo distintos", () => {
    expect(subjectShape("Reservation confirmed")).not.toBe(
      subjectShape("Reservation cancelled"),
    );
  });
});
