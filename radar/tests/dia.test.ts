import { describe, expect, it } from "vitest";
import { choques, duracion, huecos, mejorHueco, type Bloque } from "@/lib/dia";

const T = (hhmm: string) => Date.parse(`2026-09-23T${hhmm}:00+02:00`);

function bloque(
  desde: string,
  hasta: string,
  title: string,
  when: "hoy" | "mañana" = "hoy",
): Bloque {
  return { id: title, start: T(desde), end: T(hasta), title, when };
}

describe("choques", () => {
  it("detecta dos cosas pisadas", () => {
    // El caso real: telefonillo 11:30 y desmontar cajón 12:00, en sitios
    // distintos, con una hora de duración cada una.
    const lista = choques([
      bloque("11:30", "12:30", "Telefonillo Galileu"),
      bloque("12:00", "13:00", "Desmontar cajón Casanova"),
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0].a).toBe("Telefonillo Galileu");
    expect(lista[0].b).toBe("Desmontar cajón Casanova");
  });

  it("un empalme exacto no es un choque", () => {
    // Una acaba a las 12:00 y la otra empieza a las 12:00: normal.
    expect(
      choques([bloque("11:00", "12:00", "A"), bloque("12:00", "13:00", "B")]),
    ).toEqual([]);
  });

  it("no inventa choques entre días distintos", () => {
    // Misma hora, distinto día: no se pisan.
    expect(
      choques([
        bloque("11:00", "12:00", "Hoy"),
        { ...bloque("11:00", "12:00", "Mañana"), when: "mañana" },
      ]),
    ).toEqual([]);
  });

  it("no se le escapa el tercero que se pisa con el primero", () => {
    const lista = choques([
      bloque("10:00", "14:00", "Larga"),
      bloque("11:00", "11:30", "Corta"),
      bloque("12:00", "12:30", "Otra"),
    ]);
    expect(lista).toHaveLength(2);
  });

  it("sin eventos no hay choques", () => {
    expect(choques([])).toEqual([]);
  });
});

describe("huecos", () => {
  const finDelDia = T("19:00");

  it("encuentra la mañana libre antes de la primera cita", () => {
    const lista = huecos([bloque("11:45", "12:45", "Médico")], T("08:00"), finDelDia);
    expect(lista[0].minutos).toBe(225); // 08:00 → 11:45
  });

  it("lo que ya pasó no cuenta como hueco", () => {
    // Son las 13:00: la mañana ya no está disponible por mucho que estuviera
    // libre.
    const lista = huecos([bloque("11:45", "12:45", "Médico")], T("13:00"), finDelDia);
    expect(lista).toHaveLength(1);
    expect(lista[0].desde).toBe(T("13:00"));
  });

  it("ignora los ratos de menos de media hora", () => {
    const lista = huecos(
      [bloque("10:00", "11:00", "A"), bloque("11:20", "12:00", "B")],
      T("10:00"),
      T("12:00"),
    );
    expect(lista).toEqual([]);
  });

  it("los eventos de mañana no parten el día de hoy", () => {
    const manana: Bloque = {
      ...bloque("11:00", "12:00", "Mañana"),
      when: "mañana",
    };
    const lista = huecos([manana], T("09:00"), finDelDia);
    expect(lista).toHaveLength(1);
    expect(lista[0].minutos).toBe(600);
  });

  it("dos citas dejan el hueco de en medio", () => {
    const lista = huecos(
      [bloque("09:00", "10:00", "A"), bloque("14:00", "15:00", "B")],
      T("08:00"),
      finDelDia,
    );
    expect(lista.map((h) => h.minutos)).toEqual([60, 240, 240]);
  });

  it("el día que acabó no promete nada", () => {
    expect(huecos([], T("20:00"), finDelDia)).toEqual([]);
  });
});

describe("mejorHueco", () => {
  it("elige el más largo, que es el que contesta cuándo trabajas", () => {
    const lista = huecos(
      [bloque("09:00", "10:00", "A"), bloque("14:00", "15:00", "B")],
      T("08:00"),
      T("19:00"),
    );
    expect(mejorHueco(lista)?.minutos).toBe(240);
  });

  it("sin huecos, null", () => {
    expect(mejorHueco([])).toBeNull();
  });
});

describe("duracion", () => {
  it("se lee como lo diría una persona", () => {
    expect(duracion(45)).toBe("45 min");
    expect(duracion(60)).toBe("1 hora");
    expect(duracion(120)).toBe("2 horas");
    expect(duracion(225)).toBe("3 h 45 min");
  });
});

describe("ocultar una cita", () => {
  it("rehace el marco del día sin lo que despachaste", async () => {
    const { sinLoOculto } = await import("@/lib/dia");
    const bloques = [
      bloque("11:30", "12:30", "Telefonillo Galileu"),
      bloque("12:00", "13:00", "Desmontar cajón Casanova"),
    ].map((b, i) => ({ ...b, id: `ev-${i}` }));

    const antes = {
      slots: [],
      marco: null,
      pisados: choques(bloques),
      bloques,
      blocks: 0,
      ok: true,
    };
    expect(antes.pisados).toHaveLength(1);

    // Si despachaste la que te partía la mañana, la mañana ya no está partida.
    const despues = sinLoOculto(antes, new Set(["ev-0"]));
    expect(despues.pisados).toEqual([]);
    expect(despues.bloques).toHaveLength(1);
  });

  it("sin nada oculto devuelve lo mismo, sin recalcular", async () => {
    const { sinLoOculto } = await import("@/lib/dia");
    const agenda = {
      slots: [],
      marco: "x",
      pisados: [],
      bloques: [],
      blocks: 0,
      ok: true,
    };
    expect(sinLoOculto(agenda, new Set())).toBe(agenda);
  });
});
