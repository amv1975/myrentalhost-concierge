import type { ParteEntry } from "@/lib/parte";

/**
 * El mensaje que recibe el equipo por WhatsApp.
 *
 * Se escribe para quien NO ha visto el parte: en el grupo de administración
 * llega suelto, entre otras veinte cosas, y nadie va a preguntar de qué va.
 *
 * Aquí iba el enlace al correo original, y era inútil: abre el buzón de
 * Agustín, al que el equipo no tiene acceso. Lo que sí les sirve es con qué
 * buscarlo en su propio sitio —el nombre del huésped, el código de reserva, el
 * piso, el número de factura—, y eso ya está escrito en el detalle. Ellos
 * entran por Airbnb, por Booking o por el programa de facturación, no por su
 * Gmail.
 */
export function textoParaElEquipo(entries: ParteEntry[]): string {
  if (entries.length === 0) return "";

  const cabecera =
    entries.length === 1
      ? "Una cosa para mirar:"
      : `${entries.length} cosas para mirar:`;

  const lineas = entries.map((entry, i) => {
    const cuando = entry.when ? ` (${entry.when})` : "";

    return [
      `${i + 1}. ${entry.headline}${cuando}`,
      // El detalle lleva los identificadores delante: huésped, código de
      // reserva, piso, número de factura. Es por donde van a buscarlo.
      entry.detail?.trim(),
      `— ${entry.who}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [cabecera, ...lineas].join("\n\n");
}

/**
 * Cómo se manda.
 *
 * Un enlace wa.me con el texto ya escrito: se abre WhatsApp, eliges el grupo y
 * le das a enviar. Nada de la API de WhatsApp Business, que para esto pediría
 * un número de empresa, la aprobación de Meta y plantillas revisadas — semanas
 * de trámite para ahorrarse un toque.
 */
export function enlaceWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
