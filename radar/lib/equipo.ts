import type { ParteEntry } from "@/lib/parte";
import { gmailSearchUrl } from "@/lib/gmail-link";

/**
 * El mensaje que recibe el equipo por WhatsApp.
 *
 * Se escribe para quien NO ha visto el parte: en el grupo de administración
 * llega suelto, entre otras veinte cosas, y nadie va a preguntar de qué va.
 * Por eso cada línea lleva quién escribe y el enlace al correo original — sin
 * él, el resumen obliga a buscarlo a mano en un buzón que además no es suyo.
 *
 * WhatsApp corta los mensajes largos con un "Leer más", así que se va al grano:
 * el titular, de quién es, y el enlace. El detalle se lee en el correo.
 */
export function textoParaElEquipo(entries: ParteEntry[]): string {
  if (entries.length === 0) return "";

  const cabecera =
    entries.length === 1
      ? "Una cosa para mirar:"
      : `${entries.length} cosas para mirar:`;

  const lineas = entries.map((entry, i) => {
    const cuando = entry.when ? ` (${entry.when})` : "";
    const enlace = gmailSearchUrl({
      fromEmail: entry.fromEmail,
      subject: entry.subject,
      messageId: entry.gmailMessageId,
    });

    return [
      `${i + 1}. ${entry.headline}${cuando}`,
      `${entry.who}`,
      enlace,
    ].join("\n");
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
