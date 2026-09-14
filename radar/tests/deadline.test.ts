import { describe, expect, it, vi } from "vitest";
import { deadlineIn, porcion, SIN_PLAZO } from "@/lib/deadline";

/**
 * Este test existe por una tarde en la que reanalizar borró los compromisos,
 * se quedó sin tiempo antes de reconstruirlos, y dejó el parte vacío.
 */
describe("el reloj de una pasada", () => {
  it("el margen cubre la respuesta, no un tercio de la pasada", () => {
    // Con doce segundos de margen sobre un presupuesto de veinticinco, lo
    // aprovechable eran trece — repartidos entre cuatro etapas, ninguna
    // llegaba a hacer nada y el contador se quedaba clavado.
    const plazo = deadlineIn(35_000);
    expect(plazo.left()).toBeGreaterThanOrEqual(30);
  });

  it("se cierra cuando el margen se come el tiempo", () => {
    // Un plazo más corto que la reserva no da para nada: mejor no empezar.
    expect(deadlineIn(2_000).ok()).toBe(false);
  });

  it("una etapa recibe su porción y no puede pasarse del plazo entero", () => {
    // Sin reparto, la primera etapa se lo come todo y las siguientes no corren
    // nunca: la descarga agotaba el tiempo y la lectura no leía ni un correo.
    const plazo = deadlineIn(35_000);
    const trozo = porcion(plazo, 8_000);

    expect(trozo.left()).toBeLessThanOrEqual(8);
    expect(trozo.endsAt).toBeLessThan(plazo.endsAt);
  });

  it("una porción más larga que lo que queda se recorta al plazo", () => {
    const plazo = deadlineIn(10_000);
    expect(porcion(plazo, 60_000).endsAt).toBe(plazo.endsAt);
  });

  it("dice que no cuando el tiempo ya pasó", () => {
    vi.useFakeTimers();
    try {
      const plazo = deadlineIn(60_000);
      expect(plazo.ok()).toBe(true);
      vi.advanceTimersByTime(57_000);
      expect(plazo.ok()).toBe(false);
      expect(plazo.left()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lo que no corre contra reloj no se corta nunca", () => {
    expect(SIN_PLAZO.ok()).toBe(true);
  });
});

describe("el timeout de cada llamada al modelo", () => {
  it("nunca sobrevive al plazo de su etapa", async () => {
    // El fallo que lo motiva: el plazo se mira ENTRE llamadas, así que la
    // etapa veía tiempo de sobra, arrancaba una petición de cuarenta segundos
    // y volvía cuando Vercel ya había cortado la función. Al móvil llegaba un
    // "Gateway Timeout" sin una línea en ningún sitio que dijera por qué.
    const { deadlineIn, limites } = await import("@/lib/deadline");
    const plazo = deadlineIn(20_000);
    const { timeout, maxRetries } = limites(plazo);

    expect(timeout).toBeLessThanOrEqual(plazo.endsAt - Date.now() + 50);
    // Sin esto el reloj real sería el triple: el SDK reintenta dos veces.
    expect(maxRetries).toBe(0);
  });

  it("con el plazo casi agotado pide lo mínimo, no un número absurdo", async () => {
    const { limites, SIN_PLAZO } = await import("@/lib/deadline");

    const agotado = { ok: () => false, left: () => 0, endsAt: Date.now() - 5_000 };
    expect(limites(agotado).timeout).toBeGreaterThan(0);

    // Y sin plazo no se pide un timeout de trescientos mil años.
    expect(limites(SIN_PLAZO).timeout).toBeLessThanOrEqual(10 * 60_000);
  });
});
