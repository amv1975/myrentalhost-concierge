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
