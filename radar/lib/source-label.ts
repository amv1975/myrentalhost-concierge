/**
 * De quién viene un compromiso, en corto.
 *
 * Saber la fuente cambia cuánta atención merece una tarjeta antes de leerla:
 * no pesa igual una circular del colegio que un aviso automático de un canal
 * de reservas. Se busca lo más reconocible y breve, no lo más exacto.
 */
export function sourceLabel(
  fromEmail?: string | null,
  fromName?: string | null,
): string | null {
  // Un nombre corto y con letras es más reconocible que el dominio. Los que
  // son la propia dirección, o cadenas largas de sistema, no aportan.
  const name = fromName?.trim();
  if (name && name.length <= 28 && !name.includes("@") && /[a-zA-Z]/.test(name)) {
    return name;
  }

  const domain = fromEmail?.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  // guest.booking.com y express.airbnb.com son el mismo sitio de siempre:
  // interesa la marca, no el subdominio por el que salió el correo.
  const parts = domain.split(".");
  if (parts.length > 2) {
    const tail = parts.slice(-2).join(".");
    // Dominios como .co.uk necesitan una etiqueta más para significar algo.
    if (/^(co|com|org|net|gov|edu)\.[a-z]{2}$/.test(tail)) {
      return parts.slice(-3).join(".");
    }
    return tail;
  }

  return domain;
}
