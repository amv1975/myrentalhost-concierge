import { describe, expect, it } from "vitest";
import {
  buildIgnoredSection,
  buildStarredSection,
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

describe("lo que la app aprende a no perderse", () => {
  it("sin nada marcado no añade nada al prompt", () => {
    expect(buildStarredSection([])).toBe("");
  });

  it("pesa más que lo descartado, y lo dice", () => {
    // No es simetría bonita: equivocarse por exceso cuesta un toque para
    // quitarlo, y por defecto cuesta perderse un plazo de la Seguridad Social.
    const section = buildStarredSection([
      { who: "Seguridad Social", subject: "Aviso de notificación", count: 2 },
    ]);
    expect(section).toContain("pesa más");
    expect(section).toContain("sube aunque dudes");
    expect(section).toContain("marcado 2 veces");
  });

  it("las dos listas empujan en sentidos contrarios", () => {
    // Si dijeran lo mismo, una de las dos sobraría.
    const fuera = buildIgnoredSection([
      { who: "Airbnb", subject: "Entrada del huésped", count: 3 },
    ]);
    const dentro = buildStarredSection([
      { who: "Gestoría", subject: "Factura pendiente", count: 3 },
    ]);
    expect(fuera).toContain("none");
    expect(dentro).toContain("Sube al parte");
  });
});
