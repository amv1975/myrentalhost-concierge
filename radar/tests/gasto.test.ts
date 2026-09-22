import { describe, expect, it } from "vitest";
import { sumar, type FilaFeed, type FilaRun } from "@/lib/gasto-cuentas";

// Un miércoles cualquiera a mediodía en Madrid.
const AHORA = Date.parse("2026-09-23T10:00:00Z");
const hoy = (h: string) => `2026-09-23T${h}:00Z`;

function run(cost: unknown, iso: string, desglose: FilaRun["desglose"] = null): FilaRun {
  return { cost_usd: cost, desglose, started_at: iso };
}

describe("sumar", () => {
  it("suma numeric aunque llegue como texto", () => {
    // Postgres manda `numeric` como string. Con `+` daban "00.0010.002".
    const g = sumar([run("0.001", hoy("09")), run("0.002", hoy("08"))], [], AHORA);
    expect(g.hoy).toBeCloseTo(0.003, 9);
    expect(g.mes).toBeCloseTo(0.003, 9);
  });

  it("cuenta las pasadas que no costaron nada", () => {
    const g = sumar(
      [run(0, hoy("09")), run(0, hoy("08")), run("0.004", hoy("07"))],
      [],
      AHORA,
    );
    expect(g.pasadas).toBe(3);
    expect(g.gratis).toBe(2);
  });

  it("reparte por concepto y suma el feed aparte", () => {
    const g = sumar(
      [run("0.005", hoy("09"), { filtro: 0.002, lectura: 0.003 })],
      [{ cost_usd: "0.02", created_at: hoy("09") } satisfies FilaFeed],
      AHORA,
    );
    expect(g.mes).toBeCloseTo(0.025, 9);
    // Ordenado de más a menos: el Feed es siempre el caro.
    expect(g.conceptos.map((c) => c.nombre)).toEqual(["feed", "lectura", "filtro"]);
    expect(g.feedVeces).toBe(1);
  });

  it("no inventa reparto para las pasadas anteriores al desglose", () => {
    const g = sumar([run("0.004", hoy("09"))], [], AHORA);
    expect(g.conceptos).toEqual([{ nombre: "sin desglosar", usd: 0.004 }]);
  });

  it("el desglose nunca suma más que el total de la pasada", () => {
    const g = sumar(
      [run("0.005", hoy("09"), { filtro: 0.002, lectura: 0.003 })],
      [],
      AHORA,
    );
    const repartido = g.conceptos.reduce((a, c) => a + c.usd, 0);
    expect(repartido).toBeCloseTo(g.mes, 9);
    expect(g.conceptos.some((c) => c.nombre === "sin desglosar")).toBe(false);
  });

  it("separa hoy de la semana y del mes", () => {
    const g = sumar(
      [
        run("0.001", hoy("09")),
        run("0.002", "2026-09-20T10:00:00Z"), // hace 3 días
        run("0.004", "2026-09-05T10:00:00Z"), // hace 18
      ],
      [],
      AHORA,
    );
    expect(g.hoy).toBeCloseTo(0.001, 9);
    expect(g.semana).toBeCloseTo(0.003, 9);
    expect(g.mes).toBeCloseTo(0.007, 9);
  });

  it("lo de anoche a las 23:30 de Madrid no cuenta como hoy", () => {
    // 21:30Z de ayer son las 23:30 en Madrid en septiembre: ayer, no hoy.
    const g = sumar([run("0.009", "2026-09-22T21:30:00Z")], [], AHORA);
    expect(g.hoy).toBe(0);
    expect(g.semana).toBeCloseTo(0.009, 9);
  });

  it("encuentra el día más caro", () => {
    const g = sumar(
      [
        run("0.001", hoy("09")),
        run("0.030", "2026-09-15T10:00:00Z"),
        run("0.002", "2026-09-15T18:00:00Z"),
      ],
      [],
      AHORA,
    );
    expect(g.peorDia).toEqual({ dia: "2026-09-15", usd: 0.032 });
  });

  it("sin datos no revienta ni inventa un día caro", () => {
    const g = sumar([], [], AHORA);
    expect(g.mes).toBe(0);
    expect(g.peorDia).toBeNull();
    expect(g.conceptos).toEqual([]);
  });
});
