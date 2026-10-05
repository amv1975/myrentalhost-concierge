import { describe, expect, it } from "vitest";
import { esPlataforma, leerAsunto, resolver } from "@/lib/plataforma";

// Asuntos copiados tal cual de correos reales del buzón.
const SONIA_INQUIRY =
  "Inquiry for LUMINOUS DESIGNER LOFT STYLE APT EIXAMPLE VIEWS for Oct 21 – 24, 2026";
const SONIA_ENQUIRY =
  "Enquiry for LUMINOUS DESIGNER LOFT STYLE APT EIXAMPLE VIEWS for 21–24 Oct 2026";
const SONIA_PREAPROBADA =
  "RE: Pre-approval for LUMINOUS DESIGNER LOFT STYLE APT EIXAMPLE VIEWS, Oct 21 – 24";
const ZANDER_INQUIRY =
  "Inquiry for Unique Exclusive Apt · Stunning Views · Terrace for Oct 16 – 20, 2026";
const ZANDER_MENSAJE =
  "RE: Inquiry for Unique Exclusive Apt · Stunning Views · Terrace, Oct 16 – 20";
const RICHARD_PENDIENTE =
  "Pending: Reservation Request at Unique Exclusive Apt · Stunning Views · Terrace for Oct 16 – 19, 2026";
const RICHARD_RECORDATORIO =
  "Reminder: Reservation Request at Unique Exclusive Apt · Stunning Views · Terrace for Oct 16 – 19, 2026";
const HORTA_RESERVA =
  "RE: Reservation for Charming Horta House · 2 Bedrooms · 2 Bathrooms, 26–29 Oct";

describe("leerAsunto", () => {
  it("una consulta es una consulta, no una reserva", () => {
    expect(leerAsunto(SONIA_INQUIRY)?.estado).toBe("consulta");
    expect(leerAsunto(SONIA_ENQUIRY)?.estado).toBe("consulta");
  });

  it("las dos grafías de Airbnb dan la misma clave", () => {
    // "Oct 21 – 24, 2026" en inglés americano, "21–24 Oct 2026" en británico.
    expect(leerAsunto(SONIA_INQUIRY)?.clave).toBe(leerAsunto(SONIA_ENQUIRY)?.clave);
  });

  it("la preaprobación se reconoce y casa con su consulta", () => {
    const pre = leerAsunto(SONIA_PREAPROBADA);
    expect(pre?.estado).toBe("preaprobada");
    expect(pre?.clave).toBe(leerAsunto(SONIA_INQUIRY)?.clave);
  });

  it("un nombre de piso con puntos medios y comas no rompe nada", () => {
    expect(leerAsunto(HORTA_RESERVA)).toMatchObject({
      estado: "reserva",
      alojamiento: "Charming Horta House · 2 Bedrooms · 2 Bathrooms",
    });
  });

  it("la solicitud de reserva y su recordatorio son solicitudes", () => {
    expect(leerAsunto(RICHARD_PENDIENTE)?.estado).toBe("solicitud");
    expect(leerAsunto(RICHARD_RECORDATORIO)?.estado).toBe("solicitud");
  });

  it("lo que no es de Airbnb no se toca", () => {
    expect(leerAsunto("Resumen de prensa · 23 de septiembre de 2026")).toBeNull();
    expect(leerAsunto("James has left a 5-star review!")).toBeNull();
    expect(leerAsunto(null)).toBeNull();
  });
});

describe("resolver", () => {
  const consulta = {
    asunto: leerAsunto(SONIA_INQUIRY)!,
    recibido: "2026-10-05T03:17:32Z",
  };

  it("el caso que lo motivó: Vicky preaprobó a las 07:08", () => {
    const r = resolver(consulta, [
      { asunto: SONIA_PREAPROBADA, recibido: "2026-10-05T05:08:13Z" },
    ]);
    expect(r).toEqual({
      como: "Preaprobada en Airbnb",
      cuando: "2026-10-05T05:08:13Z",
    });
  });

  it("una preaprobación de otras fechas no cuenta", () => {
    const r = resolver(consulta, [
      {
        asunto: "RE: Pre-approval for LUMINOUS DESIGNER LOFT STYLE APT EIXAMPLE VIEWS, Nov 2 – 5",
        recibido: "2026-10-05T05:08:13Z",
      },
    ]);
    expect(r).toBeNull();
  });

  it("de otro piso tampoco", () => {
    const r = resolver(consulta, [
      {
        asunto: "RE: Pre-approval for Unique Exclusive Apt · Stunning Views · Terrace, Oct 21 – 24",
        recibido: "2026-10-05T05:08:13Z",
      },
    ]);
    expect(r).toBeNull();
  });

  it("una preaprobación anterior a la consulta no la contesta", () => {
    const r = resolver(consulta, [
      { asunto: SONIA_PREAPROBADA, recibido: "2026-10-04T05:08:13Z" },
    ]);
    expect(r).toBeNull();
  });

  it("un mensaje más en la consulta no prueba nada: puede ser el huésped", () => {
    const zander = {
      asunto: leerAsunto(ZANDER_INQUIRY)!,
      recibido: "2026-10-04T14:56:13Z",
    };
    expect(
      resolver(zander, [{ asunto: ZANDER_MENSAJE, recibido: "2026-10-04T17:53:47Z" }]),
    ).toBeNull();
  });

  it("una solicitud de reserva no se da por resuelta adivinando", () => {
    const richard = {
      asunto: leerAsunto(RICHARD_PENDIENTE)!,
      recibido: "2026-10-04T15:10:27Z",
    };
    expect(
      resolver(richard, [
        {
          asunto: "RE: Reservation for Unique Exclusive Apt · Stunning Views · Terrace, Oct 16 – 19",
          recibido: "2026-10-04T17:41:54Z",
        },
      ]),
    ).toBeNull();
  });
});

describe("esPlataforma", () => {
  it("a Airbnb y Booking no se les contesta por correo", () => {
    expect(esPlataforma("automated@airbnb.com")).toBe(true);
    expect(esPlataforma("express@airbnb.com")).toBe(true);
    expect(esPlataforma("noreply@booking.com")).toBe(true);
  });

  it("los no-reply genéricos tampoco", () => {
    expect(esPlataforma("no-reply@procontur.es")).toBe(true);
    expect(esPlataforma("noreply@ejemplo.com")).toBe(true);
  });

  it("una persona sí", () => {
    expect(esPlataforma("hilari.garcia@gmail.com")).toBe(false);
    expect(esPlataforma("gestoria@asesoria.es")).toBe(false);
    expect(esPlataforma(null)).toBe(false);
  });
});

describe("aplicarPlataforma", async () => {
  const { aplicarPlataforma } = await import("@/lib/plataforma");

  const base = {
    id: "1",
    kind: "email" as const,
    life: "work" as const,
    urgent: true,
    at: "2026-10-05T03:17:32Z",
    who: "Airbnb",
    headline: "Sonia pregunta por el 21 de octubre",
    detail: null,
    riesgo: null,
    espera: { desde: "2026-10-05T03:17:32Z", mensajes: 1 },
    resuelta: null,
    when: null,
    fromEmail: "automated@airbnb.com",
    subject: SONIA_INQUIRY,
    actionable: true,
    link: null,
    reading: false,
    gmailMessageId: "x",
    starred: false,
    agenda: null,
  };

  it("una consulta ya preaprobada deja de pedir nada y dice por qué", () => {
    const r = aplicarPlataforma(base, [
      { asunto: SONIA_PREAPROBADA, recibido: "2026-10-05T05:08:13Z" },
    ]);
    expect(r.resuelta?.como).toBe("Preaprobada en Airbnb");
    // Baja a "no hace falta que hagas nada": ni urgente ni accionable.
    expect(r.urgent).toBe(false);
    expect(r.actionable).toBe(false);
    expect(r.espera).toBeNull();
  });

  it("una consulta sin contestar espera desde que llegó", () => {
    const r = aplicarPlataforma({ ...base, espera: null }, []);
    expect(r.espera).toEqual({ desde: base.at, mensajes: 1 });
    expect(r.urgent).toBe(true);
  });

  it("un aviso de plataforma que no es consulta no está 'sin responder'", () => {
    // El falso aviso de antes: el hilo de Gmail de automated@ nunca recibe
    // respuesta, así que siempre parecía sin contestar.
    const r = aplicarPlataforma(
      { ...base, subject: "Reservation reminder: Tomi is coming soon!" },
      [],
    );
    expect(r.espera).toBeNull();
  });

  it("el correo de una persona no se toca", () => {
    const persona = { ...base, fromEmail: "hilari@gmail.com", subject: "Vecinos" };
    expect(aplicarPlataforma(persona, [])).toBe(persona);
  });
});
