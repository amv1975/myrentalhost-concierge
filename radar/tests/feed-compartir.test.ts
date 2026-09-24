import { describe, expect, it } from "vitest";
import { partir } from "@/lib/feed/bloques";
import { aWhatsApp, textoDelFeed } from "@/lib/feed/compartir";

const SINTESIS = `**Airbnb quiere cobrarte por vender dentro de su propia plataforma** Chesky anticipó anuncios patrocinados para anfitriones.

**Apartur: ocupación del 88,8% en Barcelona** Tres medios citan la cifra.

Lo demás iba de hoteles y notas de prensa sueltas.`;

describe("partir", () => {
  it("separa la síntesis en cosas que se pueden mandar sueltas", () => {
    const bloques = partir(SINTESIS);
    expect(bloques).toHaveLength(3);
    expect(bloques[0].titulo).toBe(
      "Airbnb quiere cobrarte por vender dentro de su propia plataforma",
    );
    expect(bloques[0].cuerpo).toContain("Chesky");
    // El titular no se queda también dentro del cuerpo.
    expect(bloques[0].cuerpo).not.toContain("Airbnb quiere cobrarte");
  });

  it("un párrafo sin titular va entero y sin inventarle uno", () => {
    const bloques = partir(SINTESIS);
    expect(bloques[2].titulo).toBeNull();
    expect(bloques[2].cuerpo).toContain("Lo demás");
  });

  it("los ids son la posición, para que la selección no baile", () => {
    expect(partir(SINTESIS).map((b) => b.id)).toEqual([0, 1, 2]);
  });

  it("sin texto no hay bloques", () => {
    expect(partir("")).toEqual([]);
    expect(partir("\n\n   \n")).toEqual([]);
  });

  it("quita las viñetas, que en WhatsApp no son viñetas", () => {
    expect(partir("- una cosa\n- otra")[0].cuerpo).toBe("una cosa\notra");
  });
});

describe("textoDelFeed", () => {
  const cuando = new Date("2026-09-22T10:00:00Z");

  it("dice de dónde sale, para quien no ha abierto Radar nunca", () => {
    const texto = textoDelFeed(partir(SINTESIS).slice(0, 1), cuando);
    expect(texto.startsWith("Del sector, 22 de septiembre:")).toBe(true);
  });

  it("manda solo lo elegido", () => {
    const bloques = partir(SINTESIS);
    const texto = textoDelFeed([bloques[1]], cuando);
    expect(texto).toContain("Apartur");
    expect(texto).not.toContain("Chesky");
  });

  it("negrita de WhatsApp, un asterisco", () => {
    const texto = textoDelFeed(partir(SINTESIS).slice(0, 1), cuando);
    expect(texto).toContain("*Airbnb quiere cobrarte");
    expect(texto).not.toContain("**");
  });

  it("sin nada elegido no manda nada", () => {
    expect(textoDelFeed([], cuando)).toBe("");
  });

  it("también convierte las negritas de dentro del cuerpo", () => {
    expect(aWhatsApp("sube un **18%** interanual")).toBe(
      "sube un *18%* interanual",
    );
  });
});

describe("el enlace al original", () => {
  const cuando = new Date("2026-09-22T10:00:00Z");

  it("en WhatsApp la dirección va suelta, no entre corchetes", () => {
    const bloques = partir(
      "**Booking y la nota de ubicación** Un punto más sube la tarifa un 21% [Hosteltur](https://hosteltur.com/x).",
    );
    const texto = textoDelFeed(bloques, cuando);
    expect(texto).toContain("Hosteltur: https://hosteltur.com/x");
    expect(texto).not.toContain("](");
  });

  it("y las negritas siguen siendo de WhatsApp", () => {
    expect(aWhatsApp("sube un **21%** [ver](https://a.com)")).toBe(
      "sube un *21%* ver: https://a.com",
    );
  });
});
