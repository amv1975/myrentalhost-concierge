import { describe, expect, it } from "vitest";
import {
  estaTerminado,
  tocaFiltro,
  tocaLeer,
  type EstadoCorreo,
} from "@/lib/triage/estados";

function correo(overrides: Partial<EstadoCorreo> = {}): EstadoCorreo {
  return {
    triaged_at: null,
    triage_status: "pending",
    triage_category: null,
    summary: null,
    dismissed_at: null,
    ...overrides,
  };
}

const AYER = "2026-09-09T10:00:00Z";

/**
 * El fallo que motiva estos tests: un correo que la ingesta vieja marcaba como
 * 'done' al entrar no lo reclamaba ninguna etapa. Se quedaba en "leyéndolo"
 * para siempre y el contador de pendientes no bajaba nunca de ahí.
 */
describe("de quién es cada correo", () => {
  it("recién llegado, le toca el filtro", () => {
    const nuevo = correo();
    expect(tocaFiltro(nuevo)).toBe(true);
    expect(tocaLeer(nuevo)).toBe(false);
  });

  it("el que la ingesta vieja marcaba 'done' al entrar sigue siendo del filtro", () => {
    // Este es el correo que se quedaba en tierra de nadie. Lo que decide es
    // que nunca lo miró un modelo, no en qué estado lo dejó la ingesta.
    const huerfano = correo({ triage_status: "done", triage_category: "work" });
    expect(tocaFiltro(huerfano)).toBe(true);
    expect(estaTerminado(huerfano)).toBe(false);
  });

  it("filtrado como tuyo y sin resumen, le toca la lectura", () => {
    const suyo = correo({
      triaged_at: AYER,
      triage_category: "family",
      triage_status: "pending",
    });
    expect(tocaFiltro(suyo)).toBe(false);
    expect(tocaLeer(suyo)).toBe(true);
  });

  it("el ruido está terminado en cuanto se descarta", () => {
    const ruido = correo({
      triaged_at: AYER,
      triage_category: "none",
      triage_status: "done",
    });
    expect(estaTerminado(ruido)).toBe(true);
  });

  it("con resumen ya está leído", () => {
    const leido = correo({
      triaged_at: AYER,
      triage_category: "work",
      triage_status: "done",
      summary: "La gestoría pide justificantes.",
    });
    expect(estaTerminado(leido)).toBe(true);
  });

  it("lo despachado a mano no vuelve a la cola aunque no tenga resumen", () => {
    const despachado = correo({
      triaged_at: AYER,
      triage_category: "work",
      dismissed_at: AYER,
    });
    expect(estaTerminado(despachado)).toBe(true);
  });

  it("un fallo de lectura se reintenta, no se pierde", () => {
    const fallido = correo({
      triaged_at: AYER,
      triage_category: "work",
      triage_status: "failed",
    });
    expect(tocaLeer(fallido)).toBe(true);
  });

  it("ningún estado posible se queda sin dueño", () => {
    // La garantía de verdad: se recorren TODAS las combinaciones y se exige
    // que cada correo caiga en exactamente una situación. Si alguien añade un
    // estado nuevo y se olvida de una etapa, este test lo caza.
    const fechas = [null, AYER];
    const estados = ["pending", "processing", "done", "failed"];
    const categorias = [null, "family", "work", "none"];
    const resumenes = [null, "algo"];

    for (const triaged_at of fechas) {
      for (const triage_status of estados) {
        for (const triage_category of categorias) {
          for (const summary of resumenes) {
            for (const dismissed_at of fechas) {
              const caso = correo({
                triaged_at,
                triage_status,
                triage_category,
                summary,
                dismissed_at,
              });

              const situaciones = [
                tocaFiltro(caso),
                tocaLeer(caso),
                estaTerminado(caso),
              ].filter(Boolean);

              expect(situaciones).toHaveLength(1);
            }
          }
        }
      }
    }
  });
});

describe("el sello del criterio", () => {
  it("lo que decidiste tú lleva un sello distinto del de la máquina", async () => {
    // El sello dice con qué reglas se juzgó cada correo, y nada más: la app no
    // reabre por su cuenta lo que ya te enseñó. Volver atrás sobre lo
    // clasificado es decisión tuya, y por eso lo que corregiste a mano tiene
    // que ser distinguible de lo que decidió el modelo.
    const { CRITERIO_ACTUAL, MARCA_USUARIO } = await import(
      "@/lib/triage/estados"
    );
    expect(MARCA_USUARIO).not.toBe(CRITERIO_ACTUAL);
    expect(CRITERIO_ACTUAL).toMatch(/\/v\d+$/);
  });
});
