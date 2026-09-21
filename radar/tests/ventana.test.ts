import { describe, expect, it } from "vitest";
import { DIAS_VENTANA, VENTANA_MS } from "@/lib/ventana";

describe("hasta dónde mira Radar hacia atrás", () => {
  it("cubre un fin de semana entero visto desde el lunes", () => {
    // El fallo que lo motiva: la ventana eran 48 horas y el comentario decía
    // "dos días cubren el fin de semana". No los cubre. Abriendo el lunes a
    // las nueve, cuarenta y ocho horas llegan al sábado a las nueve, así que
    // el viernes entero se quedaba fuera — y con él una reunión de vecinos y
    // unos billetes de tren que nadie llegó a ver.
    const lunes = new Date("2026-09-14T09:00:00+02:00");
    const desde = new Date(lunes.getTime() - VENTANA_MS);
    const viernes = new Date("2026-09-11T08:00:00+02:00");

    expect(desde.getTime()).toBeLessThan(viernes.getTime());
  });

  it("aguanta también unos días sin abrirla", () => {
    expect(DIAS_VENTANA).toBeGreaterThanOrEqual(7);
  });
});

describe("las dos ventanas son la misma", () => {
  it("lo que se baja del buzón y lo que se enseña coinciden", async () => {
    // Son dos constantes en dos archivos y ya se desincronizaron una vez: la
    // ingesta traía dos días y el parte enseñaba dos, pero cambiar una sin la
    // otra da correos que se pagan y no se ven, o que no se descargan nunca.
    const parte = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/parte.ts", import.meta.url), "utf8"),
    );
    const pipeline = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/pipeline.ts", import.meta.url), "utf8"),
    );

    for (const fuente of [parte, pipeline]) {
      expect(fuente).toContain('from "@/lib/ventana"');
    }
    // Ninguno de los dos define su propia ventana por su cuenta.
    expect(parte).not.toMatch(/const WINDOW_HOURS/);
    expect(pipeline).not.toMatch(/const VENTANA_MAX_MS = \d/);
  });
});

describe("hasta dónde avanza la marca de la última ingesta", () => {
  it("una pasada a medias no mueve la marca", async () => {
    // El agujero que se tragó el correo de la junta de propietarios. Cuando
    // "se acabó el tiempo" dejó de contar como error, una pasada incompleta
    // pasó a contar como buena: la marca saltaba a su hora de fin y todo lo
    // que no había dado tiempo a descargar quedaba detrás, sin pedirse nunca
    // más. Con doscientos correos al día, eso es perder uno importante por
    // semana y no enterarse.
    //
    // La consulta es la garantía, así que es lo que se comprueba: exige a la
    // vez estado ok y columna de error vacía. El aviso de "me quedé a medias"
    // vive en esa columna aunque el estado sea ok.
    const fuente = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/pipeline.ts", import.meta.url), "utf8"),
    );

    const consulta = fuente.slice(
      fuente.indexOf("async function desdeCuandoMirar"),
    );

    expect(consulta).toContain('.eq("status", "ok")');
    expect(consulta).toContain('.is("error", null)');
  });
});
