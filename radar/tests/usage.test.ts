import { describe, expect, it } from "vitest";
import { Spend, costUsd, formatUsd, emptyUsage, readUsage } from "@/lib/usage";

describe("coste", () => {
  it("los tokens en caché cuestan una fracción", () => {
    // Es lo que justifica repetir el mismo prompt de sistema en cada llamada.
    const normal = costUsd("claude-haiku-4-5", {
      ...emptyUsage(),
      input: 1_000_000,
    });
    const cacheado = costUsd("claude-haiku-4-5", {
      ...emptyUsage(),
      cacheRead: 1_000_000,
    });
    expect(cacheado).toBeLessThan(normal / 5);
  });

  it("un modelo desconocido se cobra como el más caro", () => {
    // Mejor asustar de más que dar por gratis una llamada que no lo es.
    const desconocido = costUsd("modelo-que-no-existe", {
      ...emptyUsage(),
      input: 1_000_000,
    });
    expect(desconocido).toBe(15);
  });

  it("mirar mil asuntos cuesta céntimos", () => {
    // La cuenta que sostiene toda la arquitectura: cincuenta lotes de veinte
    // correos, con el prompt de sistema ya en caché.
    const spend = new Spend();
    for (let i = 0; i < 50; i++) {
      spend.add("claude-haiku-4-5", {
        input: 700,
        cacheWrite: 0,
        cacheRead: 800,
        output: 300,
      });
    }
    expect(spend.usd).toBeLessThan(0.15);
  });

  it("lee la forma que devuelve la API, y aguanta que falte", () => {
    expect(readUsage({ input_tokens: 10, output_tokens: 3 })).toEqual({
      input: 10,
      cacheWrite: 0,
      cacheRead: 0,
      output: 3,
    });
    expect(readUsage(null)).toEqual(emptyUsage());
  });

  it("nunca dice cero cuando algo ha costado", () => {
    // Redondear a dos decimales enseñaría "0,00 $" en casi toda actualización,
    // que es exactamente la mentira tranquilizadora que hay que evitar.
    expect(formatUsd(0)).toBe("0 $");
    expect(formatUsd(0.0004)).toBe("<0,01 $");
    expect(formatUsd(1.5)).toBe("1,50 $");
  });
});
