import { describe, expect, it } from "vitest";
import { enlacesPlanos, trocear } from "@/lib/feed/markdown";

describe("trocear", () => {
  it("separa enlaces, negritas y texto", () => {
    const trozos = trocear(
      "**Airbnb cobra** Chesky lo anticipó [Hosteltur](https://hosteltur.com/x).",
    );
    expect(trozos.map((t) => t.tipo)).toEqual([
      "negrita",
      "texto",
      "enlace",
      "texto",
    ]);
    expect(trozos[2]).toEqual({
      tipo: "enlace",
      texto: "Hosteltur",
      url: "https://hosteltur.com/x",
    });
  });

  it("un javascript: no se pinta como enlace, pero se ve", () => {
    // La dirección sale de un correo que no controlamos. Esconderla sería
    // peor: si algo raro llega, quiero verlo.
    const trozos = trocear("Pulsa [aquí](javascript:alert(1)) ya");
    expect(trozos.some((t) => t.tipo === "enlace")).toBe(false);
    expect(trozos.map((t) => t.texto).join("")).toContain("javascript");
  });

  it("texto sin marcas sale entero y de una pieza", () => {
    expect(trocear("Lo demás iba de hoteles.")).toEqual([
      { tipo: "texto", texto: "Lo demás iba de hoteles." },
    ]);
  });

  it("varios enlaces en el mismo párrafo", () => {
    const trozos = trocear("[A](https://a.com) y [B](https://b.com)");
    expect(trozos.filter((t) => t.tipo === "enlace")).toHaveLength(2);
  });

  it("no se come los corchetes que no son un enlace", () => {
    expect(trocear("Un [dato] suelto")[0].texto).toBe("Un [dato] suelto");
  });
});

describe("enlacesPlanos", () => {
  it("en WhatsApp la dirección va suelta, que sí se puede pulsar", () => {
    expect(enlacesPlanos("lo cuenta [Hosteltur](https://hosteltur.com/x)")).toBe(
      "lo cuenta Hosteltur: https://hosteltur.com/x",
    );
  });

  it("lo que no es http se queda solo con su texto", () => {
    expect(enlacesPlanos("[aquí](javascript:void)")).toBe("aquí");
  });

  it("un texto sin enlaces no se toca", () => {
    expect(enlacesPlanos("Nada que enlazar")).toBe("Nada que enlazar");
  });
});

describe("primerEnlace", () => {
  it("encuentra el artículo para colgarlo del titular", async () => {
    const { primerEnlace } = await import("@/lib/feed/markdown");
    expect(
      primerEnlace("Los anuncios subieron un 47%. [3CatInfo](https://3cat.cat/x)"),
    ).toBe("https://3cat.cat/x");
  });

  it("se queda con el primero cuando hay varios", async () => {
    const { primerEnlace } = await import("@/lib/feed/markdown");
    expect(primerEnlace("[A](https://a.com) y [B](https://b.com)")).toBe(
      "https://a.com",
    );
  });

  it("sin enlace, el titular se queda en titular", async () => {
    const { primerEnlace } = await import("@/lib/feed/markdown");
    expect(primerEnlace("Lo demás iba de hoteles.")).toBeNull();
  });

  it("no cuelga del titular algo que no es http", async () => {
    const { primerEnlace } = await import("@/lib/feed/markdown");
    expect(primerEnlace("[aquí](javascript:void)")).toBeNull();
  });
});
