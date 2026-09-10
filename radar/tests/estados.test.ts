import { describe, expect, it } from "vitest";
import {
  CRITERIO_ACTUAL,
  MARCA_USUARIO,
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
    triage_model: CRITERIO_ACTUAL,
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

  it("el ruido del criterio vigente está terminado", () => {
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

  it("el ruido de un criterio retirado vuelve al filtro", () => {
    // El fallo que obliga a esto: un filtro demasiado severo marcó ruido 525
    // de 525 correos. Sin una forma de revisarlos, arreglar el filtro no
    // cambiaba nada — la bandeja seguía vacía para siempre.
    const tirado = correo({
      triaged_at: AYER,
      triage_category: "none",
      triage_status: "done",
      triage_model: "haiku-4.5/v2",
    });
    expect(tocaFiltro(tirado)).toBe(true);
    expect(estaTerminado(tirado)).toBe(false);
  });

  it("y el que nunca llevó sello, también", () => {
    const antiguo = correo({
      triaged_at: AYER,
      triage_category: "none",
      triage_status: "done",
      triage_model: null,
    });
    expect(tocaFiltro(antiguo)).toBe(true);
  });

  it("lo que descartaste tú no vuelve aunque cambien las reglas", () => {
    // La línea que no se cruza. Un criterio nuevo puede reabrir lo que la app
    // tiró sola; lo que pasó por tus manos, jamás.
    for (const modelo of ["haiku-4.5/v2", null, MARCA_USUARIO]) {
      const tuyo = correo({
        triaged_at: AYER,
        triage_category: "none",
        dismissed_at: AYER,
        triage_model: modelo,
      });
      expect(tocaFiltro(tuyo)).toBe(false);
      expect(estaTerminado(tuyo)).toBe(true);
    }
  });

  it("lo que marcaste tú tampoco se reabre", () => {
    const marcado = correo({
      triaged_at: AYER,
      triage_category: "none",
      triage_status: "done",
      triage_model: MARCA_USUARIO,
    });
    expect(estaTerminado(marcado)).toBe(true);
  });

  it("un criterio viejo no reabre lo que sí se quedó", () => {
    // Solo vuelve la basura. Un correo que la app te enseñó sigue enseñado,
    // con resumen y todo, aunque lo juzgara una versión anterior.
    const suyo = correo({
      triaged_at: AYER,
      triage_category: "family",
      triage_status: "done",
      summary: "El cole cambia la hora de la salida.",
      triage_model: "haiku-4.5/v2",
    });
    expect(tocaFiltro(suyo)).toBe(false);
    expect(estaTerminado(suyo)).toBe(true);
  });

  it("ningún estado posible se queda sin dueño", () => {
    // La garantía de verdad: se recorren TODAS las combinaciones y se exige
    // que cada correo caiga en exactamente una situación. Si alguien añade un
    // estado nuevo y se olvida de una etapa, este test lo caza.
    const fechas = [null, AYER];
    const estados = ["pending", "processing", "done", "failed"];
    const categorias = [null, "family", "work", "none"];
    const resumenes = [null, "algo"];
    const sellos = [null, "haiku-4.5/v2", CRITERIO_ACTUAL, MARCA_USUARIO];

    for (const triaged_at of fechas) {
      for (const triage_status of estados) {
        for (const triage_category of categorias) {
          for (const summary of resumenes) {
            for (const dismissed_at of fechas) {
              for (const triage_model of sellos) {
                const caso = correo({
                  triaged_at,
                  triage_status,
                  triage_category,
                  summary,
                  dismissed_at,
                  triage_model,
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
    }
  });

  it("nada de lo que tocaste vuelve al filtro, en ninguna combinación", () => {
    // La garantía en forma de barrido: con dismissed_at puesto o con tu sello,
    // ningún cruce de estados puede devolver un correo a la cola.
    for (const triage_status of ["pending", "processing", "done", "failed"]) {
      for (const triage_category of [null, "family", "work", "none"]) {
        for (const triage_model of [null, "haiku-4.5/v2", CRITERIO_ACTUAL, MARCA_USUARIO]) {
          expect(
            tocaFiltro(
              correo({ triaged_at: AYER, dismissed_at: AYER, triage_status, triage_category, triage_model }),
            ),
          ).toBe(false);

          expect(
            tocaFiltro(
              correo({ triaged_at: AYER, triage_status, triage_category, triage_model: MARCA_USUARIO }),
            ),
          ).toBe(false);
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
