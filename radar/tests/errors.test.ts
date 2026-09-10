import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/errors";

/**
 * Este test existe por un mensaje que llegó al móvil diciendo, literalmente,
 * "[object Object]". Un error que no se puede leer es un error que no se puede
 * arreglar.
 */
describe("contar un fallo", () => {
  it("un error de Supabase no es un Error, y aun así se lee", () => {
    // Son objetos planos con message/details/hint/code. String(error) los
    // convertía en "[object Object]", que fue exactamente lo que pasó.
    expect(
      describeError({
        message: 'column emails.detail does not exist',
        details: null,
        hint: null,
        code: "42703",
      }),
    ).toBe("column emails.detail does not exist (42703)");
  });

  it("junta lo que Postgres cuenta en tres campos distintos", () => {
    expect(
      describeError({
        message: "insert violates check constraint",
        details: "Failing row contains (triage).",
        hint: "Revisa el valor de kind.",
        code: "23514",
      }),
    ).toBe(
      "insert violates check constraint · Failing row contains (triage). · Revisa el valor de kind. (23514)",
    );
  });

  it("un Error normal sigue diciendo lo suyo", () => {
    expect(describeError(new Error("Gmail 403"))).toBe("Gmail 403");
  });

  it("un objeto sin mensaje se enseña entero antes que perderlo", () => {
    expect(describeError({ status: 500 })).toBe('{"status":500}');
  });

  it("nunca devuelve «[object Object]»", () => {
    for (const raw of [{}, { a: 1 }, null, undefined, 42, "texto"]) {
      expect(describeError(raw)).not.toBe("[object Object]");
    }
  });
});
