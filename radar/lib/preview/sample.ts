import type { EmailBrief, SpaceView } from "@/lib/items";
import type { Item } from "@/lib/types";

/**
 * Datos de ejemplo para /preview. No se usan en ninguna otra parte de la app.
 *
 * Están escritos para que se vea cómo queda con correos parecidos a los reales:
 * el colegio en catalán y castellano, los canales de reserva en Trabajo, y los
 * tres casos que importan — un compromiso nuevo, uno que cambió de hora estando
 * ya en el calendario, y una acción vencida.
 */

const DIA = 86_400_000;

function fecha(offsetDias: number, hora = "17:30"): string {
  const base = new Date(Date.now() + offsetDias * DIA);
  const [h, m] = hora.split(":").map(Number);
  base.setUTCHours(h - 2, m, 0, 0);
  return base.toISOString();
}

function soloFecha(offsetDias: number): string {
  return new Date(Date.now() + offsetDias * DIA).toISOString().slice(0, 10);
}

function item(overrides: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    space_id: "demo",
    email_id: "demo",
    gmail_message_id: "demo",
    item_index: 0,
    type: "event",
    normalized_title: overrides.title.toLowerCase(),
    description: null,
    starts_at: null,
    ends_at: null,
    all_day: false,
    due_date: null,
    location: null,
    confidence: 0.9,
    status: "pending",
    dedupe_key: "demo",
    supersedes_item_id: null,
    superseded_by_item_id: null,
    changed_fields: null,
    google_event_id: null,
    google_calendar_id: null,
    synced_at: null,
    sync_error: null,
    pinned: false,
    reviewed_at: null,
    created_at: new Date(Date.now() - 3 * DIA).toISOString(),
    updated_at: new Date().toISOString(),
    email_from: "avisos@lestonnacbcn.org",
    email_from_name: null,
    ...overrides,
  };
}

/** Un correo resumido, de los que no piden nada pero conviene saber que están. */
function brief(overrides: Partial<EmailBrief> & { id: string }): EmailBrief {
  return {
    gmail_message_id: `gm-${overrides.id}`,
    from_email: "avisos@lestonnacbcn.org",
    from_name: null,
    subject: null,
    summary: null,
    importance: "normal",
    received_at: new Date(Date.now() - DIA).toISOString(),
    ...overrides,
  };
}

export const SAMPLE_FAMILY: SpaceView = {
  toReview: [
    item({
      id: "f1",
      // El caso que justifica la mitad del diseño: ya estaba confirmada y en el
      // calendario, y el colegio la ha movido media hora.
      title: "Reunió de pares 2n B",
      status: "needs_review",
      starts_at: fecha(6, "18:00"),
      location: "Col·legi Lestonnac, Carrer Pau Claris 131, Barcelona",
      description:
        "Presentació del curs i sortides del trimestre. Cal portar l'autorització signada.",
      confidence: 0.95,
      google_event_id: "gcal-existente",
      changed_fields: {
        starts_at: { before: fecha(6, "17:30"), after: fecha(6, "18:00") },
        location: {
          before: "Aula 12",
          after: "Col·legi Lestonnac, Carrer Pau Claris 131, Barcelona",
        },
      },
    }),
    item({
      id: "f2",
      type: "action",
      title: "Pagar la sortida al Zoo",
      due_date: soloFecha(4),
      description: "12 € per alumne. Ingrés al compte del centre abans del divendres.",
      confidence: 0.9,
      created_at: new Date(Date.now() - 2 * DIA).toISOString(),
    }),
    item({
      id: "f3",
      type: "action",
      title: "Firmar la autorización de la excursión",
      due_date: soloFecha(9),
      description:
        "Documento adjunto en el correo. Se entrega en secretaría o por la app del centro.",
      confidence: 0.75,
      created_at: new Date(Date.now() - DIA).toISOString(),
    }),
  ],

  openActions: [
    item({
      id: "f4",
      type: "action",
      title: "Comprar el material de plàstica",
      // Vencida: sale en rojo, que es el aviso que hace falta.
      due_date: soloFecha(-2),
      status: "confirmed",
      description: "Llista al correu: blocs, pinzells i una carpeta A3.",
    }),
    item({
      id: "f5",
      type: "action",
      title: "Rellenar el formulario de la beca de comedor",
      due_date: soloFecha(11),
      status: "confirmed",
      description: "Plazo de la convocatoria municipal. Hace falta la renta del año pasado.",
    }),
  ],

  upcomingEvents: [
    item({
      id: "f6",
      title: "Festival de Nadal",
      status: "confirmed",
      starts_at: fecha(15, "17:00"),
      ends_at: fecha(15, "19:00"),
      location: "Col·legi Lestonnac, Carrer Pau Claris 131, Barcelona",
      google_event_id: "gcal-festival",
      synced_at: new Date().toISOString(),
    }),
  ],

  oldestPendingDays: 3,

  digest: [
    brief({
      id: "fb1",
      from_email: "info@clinicadental-bcn.es",
      from_name: "Clínica Dental",
      subject: "Recordatorio de revisión",
      summary:
        "Confirman la revisión anual de Lucía; no hace falta responder salvo cambio.",
    }),
    brief({
      id: "fb2",
      from_email: "no-reply@endesaclientes.com",
      from_name: "Endesa",
      subject: "Tu factura de octubre",
      summary: "Factura de la luz de octubre: 84,20 € con cargo el día 5.",
      importance: "baja",
      received_at: new Date(Date.now() - 2 * DIA).toISOString(),
    }),
  ],
};

export const SAMPLE_WORK: SpaceView = {
  toReview: [
    item({
      id: "w1",
      pinned: true,
      email_from: "noticias@apartur.com",
      email_from_name: "Apartur",
      type: "action",
      title: "Decidir el precio del late check-out",
      due_date: soloFecha(1),
      description:
        "El huésped de Balmes pregunta por salir a las 16:00 el domingo. La siguiente entrada es el lunes.",
      confidence: 0.8,
      created_at: new Date(Date.now() - 5 * DIA).toISOString(),
    }),
    item({
      id: "w2",
      email_from: "noreply@guest.booking.com",
      email_from_name: null,
      type: "action",
      title: "Responder a la consulta sobre el parking",
      due_date: soloFecha(0),
      description: "Reserva de Booking para el 14. Pregunta si hay plaza en el edificio.",
      confidence: 0.85,
      created_at: new Date(Date.now() - 4 * DIA).toISOString(),
    }),
  ],

  openActions: [
    item({
      id: "w3",
      type: "action",
      title: "Enviar las instrucciones de entrada",
      due_date: soloFecha(3),
      status: "confirmed",
      description: "Check-in del jueves en Consell de Cent. Código del portal y del buzón.",
    }),
  ],

  upcomingEvents: [
    item({
      id: "w4",
      email_from: "express@airbnb.com",
      email_from_name: null,
      title: "Entrada del huésped en Balmes",
      status: "confirmed",
      starts_at: fecha(3, "16:00"),
      location: "Carrer de Balmes, Barcelona",
      google_event_id: "gcal-checkin",
      synced_at: new Date().toISOString(),
    }),
  ],

  oldestPendingDays: 5,

  digest: [
    brief({
      id: "wb1",
      from_email: "gestoria@connectandenjoy.com",
      from_name: "Gestoría",
      subject: "Modelo 303 tercer trimestre",
      summary:
        "La gestoría avisa de que el modelo 303 se presenta antes del día 20.",
      importance: "alta",
      received_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    }),
    brief({
      id: "wb2",
      from_email: "noreply@guest.booking.com",
      from_name: "Booking.com",
      subject: "Nueva reserva",
      summary: "Entra un huésped el 14 en el piso de Gràcia, 3 noches.",
      importance: "baja",
    }),
    brief({
      id: "wb3",
      from_email: "noticias@apartur.com",
      from_name: "Apartur",
      subject: "Boletín semanal",
      summary:
        "Boletín: el Ayuntamiento aplaza a enero la revisión de licencias turísticas.",
      received_at: new Date(Date.now() - 3 * DIA).toISOString(),
    }),
  ],
};
