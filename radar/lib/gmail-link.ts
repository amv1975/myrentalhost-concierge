/** Enlace al mensaje original en la interfaz de Gmail. */
export function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}
