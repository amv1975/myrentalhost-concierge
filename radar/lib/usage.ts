/**
 * Cuánto cuesta cada llamada, para poder enseñarlo.
 *
 * Una app que lee tu bandeja entera con un modelo detrás da miedo justo por
 * esto: no sabes lo que llevas gastado hasta que llega la factura. Contar los
 * tokens y mostrar el importe convierte esa incógnita en un número que ves
 * cada vez que pulsas Actualizar.
 *
 * Los precios son los de lista en dólares por millón de tokens. Si Anthropic
 * los cambia, esto queda desfasado: es una estimación para orientarte, no una
 * factura.
 */

export interface Usage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

interface Price {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

const PER_MILLION: Record<string, Price> = {
  "claude-haiku-4-5": { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
  "claude-sonnet-5": { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
  "claude-opus-5": { input: 15, cacheWrite: 18.75, cacheRead: 1.5, output: 75 },
};

/** Un modelo que no esté en la tabla se cobra como el más caro: mejor asustar
 *  de más que dar por gratis algo que no lo es. */
function priceOf(model: string): Price {
  return PER_MILLION[model] ?? PER_MILLION["claude-opus-5"];
}

export function emptyUsage(): Usage {
  return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
}

/** Lo que devuelve la API, en la forma en que lo devuelve. */
export function readUsage(raw: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
} | null | undefined): Usage {
  return {
    input: raw?.input_tokens ?? 0,
    cacheWrite: raw?.cache_creation_input_tokens ?? 0,
    cacheRead: raw?.cache_read_input_tokens ?? 0,
    output: raw?.output_tokens ?? 0,
  };
}

export function costUsd(model: string, usage: Usage): number {
  const price = priceOf(model);
  return (
    (usage.input * price.input +
      usage.cacheWrite * price.cacheWrite +
      usage.cacheRead * price.cacheRead +
      usage.output * price.output) /
    1_000_000
  );
}

/** Suma de gasto a lo largo de una pasada, con varios modelos por medio. */
export class Spend {
  private total = 0;
  private tokensIn = 0;
  private tokensOut = 0;

  add(model: string, usage: Usage): void {
    this.total += costUsd(model, usage);
    this.tokensIn += usage.input + usage.cacheWrite + usage.cacheRead;
    this.tokensOut += usage.output;
  }

  get usd(): number {
    return this.total;
  }

  get inputTokens(): number {
    return this.tokensIn;
  }

  get outputTokens(): number {
    return this.tokensOut;
  }
}

/** "0,03 $". Con dos decimales no se ve nada: casi todo cae por debajo. */
export function formatUsd(value: number): string {
  if (value === 0) return "0 $";
  if (value < 0.01) return "<0,01 $";
  return `${value.toFixed(2).replace(".", ",")} $`;
}
