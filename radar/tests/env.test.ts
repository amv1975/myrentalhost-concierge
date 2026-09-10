import { describe, expect, it, beforeEach, afterEach } from "vitest";

/**
 * Un salto de línea invisible al final de una clave produce "The OAuth client
 * was not found", que acusa a la clave y no al espacio. Este test existe
 * porque ese fallo costó una mañana.
 */
describe("variables de entorno", () => {
  const saved = process.env.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = saved;
  });

  it("recorta lo que se pega de más al copiar una clave", async () => {
    process.env.GOOGLE_CLIENT_ID = "  1234.apps.googleusercontent.com\n";
    const { env } = await import("@/lib/env");
    expect(env.googleClientId).toBe("1234.apps.googleusercontent.com");
  });

  it("una variable con solo espacios cuenta como que falta", async () => {
    process.env.GOOGLE_CLIENT_ID = "   ";
    const { env } = await import("@/lib/env");
    expect(() => env.googleClientId).toThrow(/Falta la variable/);
  });
});
