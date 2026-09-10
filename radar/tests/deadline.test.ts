import { describe, expect, it, vi } from "vitest";
import { deadlineIn, SIN_PLAZO } from "@/lib/deadline";

/**
 * Este test existe por una tarde en la que reanalizar borró los compromisos,
 * se quedó sin tiempo antes de reconstruirlos, y dejó el parte vacío.
 */
describe("el reloj de una pasada", () => {
  it("guarda margen para responder antes de que corten", () => {
    // Con 60 s de función, empezar una tanda en el segundo 59 es garantizar
    // que la matan a mitad. El margen es lo que evita eso.
    const plazo = deadlineIn(60_000);
    expect(plazo.left()).toBeLessThan(60);
    expect(plazo.left()).toBeGreaterThan(30);
  });

  it("se cierra cuando el margen se come el tiempo", () => {
    // Un plazo más corto que la reserva no da para nada: mejor no empezar.
    expect(deadlineIn(5_000).ok()).toBe(false);
  });

  it("dice que no cuando el tiempo ya pasó", () => {
    vi.useFakeTimers();
    try {
      const plazo = deadlineIn(60_000);
      expect(plazo.ok()).toBe(true);
      vi.advanceTimersByTime(50_000);
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
