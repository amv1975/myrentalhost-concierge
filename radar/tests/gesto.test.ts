import { describe, expect, it } from "vitest";
import { decidirEje, resultado, SWIPE_PX } from "@/lib/gesto";

describe("decidirEje", () => {
  it("no decide con los primeros píxeles", () => {
    expect(decidirEje(9, 2)).toBeNull();
    expect(decidirEje(0, 0)).toBeNull();
  });

  it("un scroll con el pulgar torcido sigue siendo un scroll", () => {
    // El caso real: bajar por la lista desviándose 40 px de lado.
    expect(decidirEje(40, 120)).toBe("y");
    expect(decidirEje(-40, 120)).toBe("y");
  });

  it("la duda va a scroll, no a descarte", () => {
    // Diagonal limpia: la horizontal no gana de calle, así que no cuenta.
    expect(decidirEje(60, 55)).toBe("y");
  });

  it("un swipe de verdad es horizontal y se nota", () => {
    expect(decidirEje(90, 10)).toBe("x");
    expect(decidirEje(-90, 10)).toBe("x");
  });
});

describe("resultado", () => {
  it("un gesto vertical nunca despacha nada", () => {
    expect(resultado("y", 400)).toBeNull();
    expect(resultado(null, -400)).toBeNull();
  });

  it("hace falta pasar el listón, no rozarlo", () => {
    expect(resultado("x", SWIPE_PX)).toBeNull();
    expect(resultado("x", SWIPE_PX + 1)).toBe("descartado");
    expect(resultado("x", -SWIPE_PX - 1)).toBe("listo");
  });

  it("derecha descarta, izquierda marca listo", () => {
    expect(resultado("x", 200)).toBe("descartado");
    expect(resultado("x", -200)).toBe("listo");
  });
});
