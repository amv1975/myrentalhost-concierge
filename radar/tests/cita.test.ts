import { describe, expect, it } from "vitest";
import { horarioDeCita } from "@/lib/fechas";
import { TriageResultSchema } from "@/lib/triage/schema";
import { buildTriageSystemPrompt } from "@/lib/triage/prompt";

const TZ = "Europe/Madrid";

describe("la cita que sale de leer un correo", () => {
  it("sin hora, ocupa el día entero y no bloquea ninguna tarde", () => {
    // La decisión que más se nota. El correo de los vecinos dice "el día 30" y
    // no dice a qué hora; ponerlo a las 00:00 le bloquearía la medianoche, y
    // ponerlo a las 19:00 sería inventárselo. Un evento a una hora falsa es
    // peor que uno sin hora: deja de fiarse del calendario entero.
    const horario = horarioDeCita(
      { fecha: "2026-09-30", hora: null, hora_fin: null },
      TZ,
    );

    expect(horario?.todoElDia).toBe(true);
    expect(horario?.fin).toBeNull();
  });

  it("con hora y sin final, dura una hora", () => {
    const horario = horarioDeCita(
      { fecha: "2026-09-30", hora: "19:00", hora_fin: null },
      TZ,
    );

    expect(horario?.todoElDia).toBe(false);
    // 19:00 en Madrid en septiembre son las 17:00 UTC.
    expect(horario?.inicio.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(horario?.fin?.toISOString()).toBe("2026-09-30T18:00:00.000Z");
  });

  it("respeta la hora de fin cuando el correo la dice", () => {
    const horario = horarioDeCita(
      { fecha: "2026-09-30", hora: "19:00", hora_fin: "21:30" },
      TZ,
    );
    expect(horario?.fin?.toISOString()).toBe("2026-09-30T19:30:00.000Z");
  });

  it("una fecha imposible no se guarda a medias", () => {
    expect(horarioDeCita({ fecha: "no es una fecha", hora: null, hora_fin: null }, TZ))
      .toBeNull();
  });
});

describe("qué le pedimos al modelo sobre las citas", () => {
  it("la cita es opcional: casi ningún correo trae una", () => {
    const resultado = TriageResultSchema.safeParse({
      category: "personal",
      summary: "El banco avisa de un recibo devuelto",
      detail: "Son 84,20 € del seguro del coche. Hay que reponerlo esta semana.",
      actionable: true,
      importance: "alta",
      riesgo: null,
      cita: null,
    });
    expect(resultado.success).toBe(true);
  });

  it("las dos reglas duras están escritas en el prompt", () => {
    const prompt = buildTriageSystemPrompt({
      workDescription: "Alquiler turístico.",
      personalDescription: "Banco, seguros, vecinos.",
      familyDescription: "El colegio y las niñas.",
      ownAddresses: ["agus@ejemplo.com"],
    });

    // Sin esto, "el próximo martes" se resuelve contra hoy y cae en otra semana.
    expect(prompt).toContain("se resuelve contra la fecha del correo");
    expect(prompt).toContain("La hora no se inventa");
    // Un vencimiento no es una cita: el calendario no es una lista de tareas.
    expect(prompt).toContain("No es una cita");
  });
});

describe("lo que llega del modelo no es de fiar", () => {
  it("una hora imposible no revienta la lectura del correo", () => {
    // El resumen es lo único que se lee por la mañana. Una cita mal formada
    // puede perderse; el resumen que venía con ella, no.
    for (const mala of [
      { fecha: "2026-09-30", hora: "25:00", hora_fin: null },
      { fecha: "2026-09-30", hora: "tarde", hora_fin: null },
      { fecha: "30/09/2026", hora: null, hora_fin: null },
      { fecha: "", hora: null, hora_fin: null },
      // Forma correcta, día inexistente: se colaría como 3 de marzo.
      { fecha: "2026-02-31", hora: null, hora_fin: null },
      { fecha: "2026-13-01", hora: null, hora_fin: null },
    ]) {
      expect(() => horarioDeCita(mala, TZ)).not.toThrow();
      expect(horarioDeCita(mala, TZ)).toBeNull();
    }
  });

  it("un fin anterior al inicio no crea una cita de duración negativa", () => {
    const horario = horarioDeCita(
      { fecha: "2026-09-30", hora: "19:00", hora_fin: "18:00" },
      TZ,
    );
    expect(horario?.fin?.getTime()).toBeGreaterThan(horario!.inicio.getTime());
  });
});
