import type { Source } from "@/lib/types";

/**
 * Qué correos se descargan del buzón.
 *
 * Desde la última vez que se miró, y nada más. Antes se pedía una ventana fija
 * —"los últimos catorce días"— en cada pasada, así que cada actualización
 * volvía a recorrer miles de mensajes que ya estaban guardados solo para
 * descubrir que ya estaban guardados. Con doscientos correos al día eso se
 * comía el tiempo entero y las etapas siguientes no llegaban a correr nunca.
 *
 * Radar no filtra por remitente: un buzón real recibe lo que importa desde
 * direcciones que nunca estarían en una lista blanca — la gestoría, un
 * proveedor nuevo, el banco. Se descarga todo lo nuevo y se clasifica después.
 *
 * Lo único que se descarta de entrada es lo que Gmail ya ha apartado por su
 * cuenta: promociones, redes sociales y foros. Ahí no hay compromisos y es la
 * mayor parte del volumen, así que quitarlo no pierde nada y evita pagar por
 * leerlo. Los correos que el propio usuario ha enviado tampoco cuentan.
 */
export function buildInboxQuery(since: Date): string {
  return [
    // Gmail acepta el instante en segundos, así que la ventana es exacta y no
    // "de hoy en adelante", que se llevaría de vuelta toda la mañana.
    `after:${Math.floor(since.getTime() / 1000)}`,
    "-category:promotions",
    "-category:social",
    "-category:forums",
    // La bandeja, y punto.
    //
    // Antes esto era "-in:sent -in:draft", y esa negación tenía un agujero que
    // se tragaba correos de trabajo enteros: Gmail etiqueta como SENT
    // cualquier mensaje que salga de tu propio dominio, incluidos los que
    // llegan a tu bandeja. La automatización de MyRentalHost se escribe a sí
    // misma —"Trabajo finalizado, listo para facturar"— y esos mensajes llevan
    // a la vez INBOX y SENT, así que Radar no ha visto ni uno.
    //
    // Pedir in:inbox dice lo que de verdad se quiere: lo que ha llegado y está
    // esperando. De paso sobra excluir borradores y enviados, que por
    // definición no están en la bandeja.
    "in:inbox",
    "-in:spam",
    "-in:trash",
  ].join(" ");
}

/**
 * Remitentes de confianza: los que se saltan la clasificación.
 *
 * Sigue habiendo lista, pero cambia de papel. Antes decidía qué entraba; ahora
 * solo dice "de este ya sabemos de qué espacio es", lo que ahorra una llamada
 * por correo y evita que un colegio o un canal de reservas acabe clasificado
 * como ruido por un correo mal redactado.
 */
export function knownSpaceFor(
  fromEmail: string,
  recipients: string[],
  sources: (Source & { space_key?: string })[],
): string | null {
  const from = fromEmail.trim().toLowerCase();
  const to = recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);

  const matches = (address: string, source: Source) => {
    const value = source.value.trim().toLowerCase();
    const domain = address.split("@")[1] ?? "";
    if (source.kind === "email" || source.kind === "to_email") {
      return address === value;
    }
    return domain === value || domain.endsWith(`.${value}`);
  };

  for (const source of sources) {
    if (!source.enabled) continue;
    const hit = source.kind.startsWith("to_")
      ? to.some((address) => matches(address, source))
      : matches(from, source);
    if (hit) return source.space_key ?? null;
  }

  return null;
}
