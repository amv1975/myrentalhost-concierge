import type { ParteEntry } from "@/lib/parte";

/**
 * Lo que dice el asunto de un correo de Airbnb, sin abrirlo.
 *
 * Existe por un error concreto. Llegó "Inquiry for LUMINOUS DESIGNER LOFT…"
 * a las 05:17, el parte lo contó como "reserva" y se lo pasó al equipo como
 * algo pendiente. Era una consulta —no hay reserva hasta que el huésped
 * reserva— y a las 07:08 Vicky ya la había preaprobado desde la app de Airbnb.
 * La app no podía saberlo: esa respuesta no se da por correo, así que el hilo
 * de Gmail seguía pareciendo sin contestar.
 *
 * Pero Airbnb sí deja rastro, y en el asunto. Cuando alguien del equipo
 * escribe en la conversación, Airbnb manda una copia con el título que tiene
 * la conversación en ese momento, y ese título cambia con el estado:
 *
 *   05:17  Inquiry for LUMINOUS DESIGNER LOFT STYLE APT EIXAMPLE VIEWS for Oct 21 – 24, 2026
 *   07:08  RE: Pre-approval for LUMINOUS DESIGNER LOFT STYLE APT EIXAMPLE VIEWS, Oct 21 – 24
 *
 * "Pre-approval" solo aparece si alguien preaprobó. Es una prueba, no una
 * deducción. Todos los formatos de aquí están sacados de correos reales del
 * buzón; los que no se han visto no se adivinan.
 */

export type Estado =
  /** Un huésped pregunta. No hay reserva. Se contesta preaprobando o no. */
  | "consulta"
  /** Un huésped pide reservar. Hay que aceptar o rechazar. */
  | "solicitud"
  /** Alguien del equipo ya preaprobó la consulta. */
  | "preaprobada"
  /** La conversación ya es de una reserva. */
  | "reserva"
  /** Un mensaje más dentro de una consulta. No dice quién lo escribió. */
  | "mensaje";

export interface AsuntoAirbnb {
  estado: Estado;
  alojamiento: string;
  /** Alojamiento y fechas normalizados: lo que tienen en común la consulta y
   *  su respuesta aunque Airbnb escriba las fechas de dos maneras. */
  clave: string;
}

const MESES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * "Oct 21 – 24, 2026", "21–24 Oct 2026" y "Oct 21 – 24" son las mismas
 * fechas. Se quedan los días y los meses, en orden, y se tira el año —que a
 * veces viene y a veces no—.
 */
function fechasClave(texto: string): string {
  const t = texto.toLowerCase();
  const dias = (t.match(/\b\d{1,2}\b/g) ?? []).map(Number).filter((d) => d >= 1 && d <= 31);
  const meses = MESES.filter((m) => new RegExp(`\\b${m}`).test(t));
  return `${dias.join("-")}|${meses.join(",")}`;
}

function normalizar(alojamiento: string): string {
  return alojamiento.toLowerCase().replace(/\s+/g, " ").trim();
}

function crear(estado: Estado, alojamiento: string, fechas: string): AsuntoAirbnb {
  const limpio = alojamiento.trim();
  return {
    estado,
    alojamiento: limpio,
    clave: `${normalizar(limpio)}|${fechasClave(fechas)}`,
  };
}

/** Solo asuntos de Airbnb. Cualquier otra cosa devuelve null y no se toca. */
export function leerAsunto(asunto: string | null): AsuntoAirbnb | null {
  if (!asunto) return null;
  const s = asunto.trim();
  let m: RegExpMatchArray | null;

  // "Inquiry for L for Oct 21 – 24, 2026" / "Enquiry for L for 21–24 Oct 2026".
  // El alojamiento se queda con todo hasta el ÚLTIMO " for ", por si el
  // nombre del piso lleva un "for" dentro.
  if ((m = s.match(/^(?:inquiry|enquiry) for (.+) for (.+)$/i))) {
    return crear("consulta", m[1], m[2]);
  }

  // "Pending: Reservation Request at L for Oct 16 – 19, 2026" y su recordatorio.
  if ((m = s.match(/^(?:pending|reminder): reservation request at (.+) for (.+)$/i))) {
    return crear("solicitud", m[1], m[2]);
  }

  // Las copias de la conversación: "RE: <título>, <fechas>". El alojamiento
  // llega hasta la ÚLTIMA coma, porque hay pisos con comas en el nombre.
  if ((m = s.match(/^re: pre-approval for (.+), ([^,]+)$/i))) {
    return crear("preaprobada", m[1], m[2]);
  }
  if ((m = s.match(/^re: reservation for (.+), ([^,]+)$/i))) {
    return crear("reserva", m[1], m[2]);
  }
  if ((m = s.match(/^re: inquiry for (.+), ([^,]+)$/i))) {
    return crear("mensaje", m[1], m[2]);
  }

  return null;
}

/** Lo que espera respuesta del equipo. */
export function pideRespuesta(estado: Estado): boolean {
  return estado === "consulta" || estado === "solicitud";
}

export interface Resolucion {
  /** Qué pasó, para enseñarlo tal cual. */
  como: string;
  /** Cuándo llegó la prueba. */
  cuando: string;
}

/**
 * Si una consulta ya está contestada, y con qué prueba.
 *
 * Solo cuentan las pruebas que lo son de verdad: una preaprobación o que la
 * conversación ya sea de una reserva. Un "RE: Inquiry for…" no sirve —puede
 * ser el huésped escribiendo otra vez— y marcar como resuelto algo que no lo
 * está es peor que avisar de más: es justo lo que hace que algo se pierda.
 *
 * Las solicitudes de reserva tampoco se resuelven aquí todavía: su
 * confirmación llega con el nombre del huésped y sin el del piso, y cruzarlas
 * por adivinación es exactamente lo que este fichero no hace.
 */
export function resolver(
  consulta: { asunto: AsuntoAirbnb; recibido: string },
  posteriores: { asunto: string | null; recibido: string }[],
): Resolucion | null {
  if (consulta.asunto.estado !== "consulta") return null;

  const pruebas = posteriores
    .filter((p) => p.recibido > consulta.recibido)
    .map((p) => ({ ...p, leido: leerAsunto(p.asunto) }))
    .filter(
      (p) =>
        p.leido !== null &&
        p.leido.clave === consulta.asunto.clave &&
        (p.leido.estado === "preaprobada" || p.leido.estado === "reserva"),
    )
    .sort((a, b) => a.recibido.localeCompare(b.recibido));

  const primera = pruebas[0];
  if (!primera?.leido) return null;

  return {
    como:
      primera.leido.estado === "preaprobada"
        ? "Preaprobada en Airbnb"
        : "Ya es una reserva en Airbnb",
    cuando: primera.recibido,
  };
}

/**
 * Remitentes a los que nadie contesta por correo.
 *
 * Sus hilos de Gmail no reciben nunca una respuesta tuya —se contesta en la
 * plataforma—, así que mirarlos para saber si "está sin responder" daba
 * siempre que sí. Era un falso aviso por construcción.
 */
export function esPlataforma(remitente: string | null): boolean {
  if (!remitente) return false;
  const r = remitente.toLowerCase();
  return (
    /@([a-z0-9-]+\.)*(airbnb\.com|booking\.com)$/.test(r) ||
    /^(no-?reply|do-?not-?reply|automated|notifications?)@/.test(r)
  );
}

/**
 * Lo que la plataforma sabe y el hilo de Gmail no.
 *
 * - Una consulta ya preaprobada baja a "no hace falta que hagas nada", con
 *   la prueba a la vista. Mandarla al equipo como pendiente es justo el error
 *   que esto evita.
 * - Una consulta sin contestar está esperando desde que llegó: eso sí se sabe.
 * - Cualquier otro aviso de plataforma no está "sin responder": a esos
 *   remitentes no se les contesta por correo, y el hilo daba siempre que sí.
 */
export function aplicarPlataforma(
  entry: ParteEntry,
  posteriores: { asunto: string | null; recibido: string }[],
): ParteEntry {
  if (entry.kind !== "email") return entry;

  const airbnb = leerAsunto(entry.subject);
  if (airbnb && pideRespuesta(airbnb.estado)) {
    const resuelta = resolver({ asunto: airbnb, recibido: entry.at }, posteriores);
    if (resuelta) {
      return { ...entry, resuelta, espera: null, urgent: false, actionable: false };
    }
    return { ...entry, espera: { desde: entry.at, mensajes: 1 } };
  }

  if (esPlataforma(entry.fromEmail)) return { ...entry, espera: null };
  return entry;
}
