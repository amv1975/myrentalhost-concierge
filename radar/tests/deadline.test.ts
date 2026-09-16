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

describe("cuándo se actualiza sola la app", () => {
  /** La misma cuenta que hace el botón al abrir la pantalla. */
  function haceFalta(updatedAt: string | null, frescuraMs = 10 * 60_000) {
    if (!updatedAt) return true;
    const cuando = Date.parse(updatedAt);
    return Number.isNaN(cuando) || Date.now() - cuando > frescuraMs;
  }

  it("sin parte previo, se actualiza", () => {
    expect(haceFalta(null)).toBe(true);
  });

  it("con un parte de hace media hora, se actualiza", () => {
    expect(haceFalta(new Date(Date.now() - 30 * 60_000).toISOString())).toBe(true);
  });

  it("con un parte de hace dos minutos, no", () => {
    // El freno que importa: en un móvil, cambiar de app y volver es constante.
    // Sin él, cada regreso lanzaría una pasada, y cada pasada cuesta dinero.
    expect(haceFalta(new Date(Date.now() - 2 * 60_000).toISOString())).toBe(false);
  });

  it("una fecha corrupta se trata como 'no sé', y se actualiza", () => {
    expect(haceFalta("no es una fecha")).toBe(true);
  });
});
