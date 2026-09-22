import type { Agenda } from "@/lib/agenda";
import type { Parte, ParteEntry } from "@/lib/parte";

/**
 * Un parte de ejemplo para mirar la pantalla sin base de datos.
 *
 * Existe por el modo noche: el parte tenía paleta oscura y el resto de la app
 * no, y eso solo se ve mirándolo. Sin una forma de abrirlo en local, el único
 * sitio donde comprobar un color era el móvil de Agustín después de desplegar.
 */
function entrada(over: Partial<ParteEntry> & { id: string }): ParteEntry {
  return {
    kind: "email",
    life: "family",
    urgent: false,
    at: "2026-09-10T08:12:00Z",
    who: "Col·legi Lestonnac",
    headline: "",
    detail: null,
    when: null,
    fromEmail: "info@lestonnac.cat",
    subject: null,
    actionable: true,
    link: null,
    reading: false,
    gmailMessageId: "demo",
    agenda: null,
    starred: false,
    ...over,
  };
}

export const SAMPLE_PARTE: Parte = {
  scanned: 458,
  discarded: 419,
  updatedAt: "2026-09-10T19:08:00Z",
  reading: 3,
  noise: [
    { id: "n1", who: "Booking.com", fromEmail: "noreply@booking.com", subject: "Nueva reserva confirmada" },
    { id: "n2", who: "Smart Travel News", fromEmail: "news@smarttravel.news", subject: "Google AI Mode y el billboard effect de las OTA" },
  ],
  urgent: [
    entrada({
      id: "u1",
      urgent: true,
      starred: true,
      life: "personal",
      who: "Ajuntament de Barcelona",
      headline: "La subvención de deporte cierra el viernes 18",
      detail:
        "Quedan 8 días. Piden el certificado de empadronamiento y el recibo del trimestre, que el colegio manda por separado.",
      when: "vie 18 sept",
    }),
    entrada({
      id: "u2",
      life: "work",
      urgent: true,
      who: "Airbnb",
      headline: "Marta pregunta si puede entrar a las 12:00 en Gràcia 4",
      detail: "Lleva esperando desde ayer a las 19:40. Entra el sábado.",
      fromEmail: "automated@airbnb.com",
    }),
  ],
  rest: [
    entrada({
      id: "r1",
      life: "personal",
      who: "Hilari Garcia",
      headline: "La reunión de vecinos del 15 se aplaza al 30",
      detail:
        "Se espera a la reunión con el administrador de FINPER. Se tratará el tema de obras y permisos.",
      when: "mar 30 sept, 19:00",
      agenda: "puede",
      link: "El recibo del primer trimestre incluye esta salida.",
    }),
    entrada({
      id: "r2",
      life: "work",
      who: "Gestoría",
      headline: "Falta el modelo 303 del segundo trimestre",
      reading: true,
    }),
  ],
  fyi: [
    entrada({
      id: "f1",
      actionable: false,
      headline:
        "El colegio comparte el dossier informativo de tercero y cuarto de primaria",
      detail: null,
    }),
  ],
};

export const SAMPLE_AGENDA: Agenda = {
  ok: true,
  blocks: 12,
  slots: [
    {
      when: "hoy",
      time: "17:30",
      title: "Tutoría con la profesora de tercero",
      location: "Col·legi Lestonnac",
    },
    { when: "mañana", time: "09:00", title: "Check-in Gràcia 4", location: null },
  ],
};
