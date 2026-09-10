/**
 * Los únicos permisos que Radar pide sobre la cuenta de Google.
 *
 * gmail.readonly: leer correos. No permite enviar, responder, etiquetar,
 * archivar ni borrar — la API los rechaza aunque el código lo intentara.
 * calendar.events: crear y actualizar eventos, y leer los que ya tienes en una
 * ventana de dos días —eso último es lo que permite que el parte te diga si hoy
 * tienes reuniones—. No da acceso a la lista de calendarios de la cuenta ni a
 * su configuración.
 *
 * Cualquier añadido aquí amplía lo que la app puede hacer sobre tu cuenta.
 * tests/permissions.test.ts falla si esta lista crece o si aparece en el
 * código una llamada a un endpoint de escritura de Gmail.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_SCOPE_STRING = GOOGLE_SCOPES.join(" ");
