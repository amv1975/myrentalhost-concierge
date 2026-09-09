/**
 * Enlace al correo original.
 *
 * El identificador que da la API abre el mensaje en Gmail de escritorio
 * (`#all/<id>`), pero la versión móvil de mail.google.com ignora ese enlace y
 * deja al usuario en la bandeja, que es justo lo que no queremos: el enlace
 * existe para no tener que buscar el correo a mano.
 *
 * Una búsqueda por remitente y asunto exacto funciona igual en ambas y deja un
 * único resultado en pantalla. Es un toque más que abrir el mensaje, pero
 * llega siempre al correo correcto.
 */
export function gmailSearchUrl(params: {
  fromEmail?: string | null;
  subject?: string | null;
  messageId: string;
}): string {
  const terms: string[] = [];

  if (params.fromEmail) terms.push(`from:${params.fromEmail}`);
  if (params.subject) {
    // Las comillas fuerzan la frase exacta; las que trae el asunto romperían
    // la consulta, así que se quitan.
    terms.push(`subject:"${params.subject.replace(/"/g, "")}"`);
  }

  if (terms.length === 0) {
    return `https://mail.google.com/mail/u/0/#all/${params.messageId}`;
  }

  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(terms.join(" "))}`;
}
