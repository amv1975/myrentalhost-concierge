import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/google/html";

describe("htmlToText y los enlaces", () => {
  it("el destino sobrevive al barrido de etiquetas que viene después", () => {
    // Un resumen de prensa ES una lista de enlaces: sin ellos, la síntesis
    // puede contarte que hay una noticia pero no llevarte a leerla.
    const texto = htmlToText(
      '<p><a href="https://www.hosteltur.com/x.html">Subir un punto en Booking</a> | Hosteltur</p>',
    );
    expect(texto).toContain("Subir un punto en Booking");
    expect(texto).toContain("(https://www.hosteltur.com/x.html)");
  });

  it("un javascript: en un correo no es un enlace", () => {
    const texto = htmlToText('<a href="javascript:alert(1)">Pulsa aquí</a>');
    expect(texto).toContain("Pulsa aquí");
    expect(texto).not.toContain("javascript");
  });

  it("tampoco un data:", () => {
    expect(htmlToText('<a href="data:text/html,x">Ver</a>')).not.toContain(
      "data:",
    );
  });

  it("un enlace sin texto deja al menos su destino", () => {
    expect(
      htmlToText('<a href="https://apartur.com/a"><img src="x"></a>'),
    ).toContain("(https://apartur.com/a)");
  });

  it("sigue quitando scripts y estilos enteros", () => {
    const texto = htmlToText(
      "<style>a{color:red}</style><script>robar()</script><p>Hola</p>",
    );
    expect(texto).not.toContain("robar");
    expect(texto).not.toContain("color:red");
    expect(texto.trim()).toBe("Hola");
  });

  it("no se traga el texto de alrededor", () => {
    const texto = htmlToText(
      '<p>Tres medios citan <a href="https://elpais.com/x">la cifra</a> esta semana.</p>',
    );
    expect(texto).toContain("Tres medios citan");
    expect(texto).toContain("esta semana.");
  });
});
