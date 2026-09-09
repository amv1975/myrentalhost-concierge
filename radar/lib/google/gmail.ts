import "server-only";

/**
 * Cliente de Gmail. Expone exactamente dos operaciones, ambas de lectura.
 *
 * No hay aquí — ni debe haber en ninguna parte del proyecto — envoltorio de
 * messages.send, messages.modify, messages.trash, messages.batchModify,
 * drafts.* ni labels.*. El token que usa esta app tiene scope gmail.readonly,
 * así que la API rechazaría esas llamadas, pero la ausencia de la ruta de
 * código es la garantía de primer orden. tests/permissions.test.ts la vigila.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessage {
  id: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string;
  receivedAt: Date;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface RawMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

async function gmailGet<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GMAIL_API}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail ${response.status} en ${path}: ${body}`);
  }
  return (await response.json()) as T;
}

/**
 * IDs de los mensajes que coinciden con la query, más recientes primero.
 * Pagina hasta maxResults en total.
 */
export async function listMessageIds(
  accessToken: string,
  query: string,
  maxResults = 200,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < maxResults) {
    const page = await gmailGet<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(accessToken, "/messages", {
      q: query,
      maxResults: String(Math.min(100, maxResults - ids.length)),
      ...(pageToken ? { pageToken } : {}),
    });

    for (const message of page.messages ?? []) ids.push(message.id);
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  return ids;
}

export async function getMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage> {
  const raw = await gmailGet<RawMessage>(
    accessToken,
    `/messages/${messageId}`,
    { format: "full" },
  );

  const headers = raw.payload?.headers ?? [];
  const from = headerValue(headers, "From") ?? "";
  const { email, name } = parseFrom(from);

  return {
    id: raw.id,
    threadId: raw.threadId,
    fromEmail: email,
    fromName: name,
    subject: headerValue(headers, "Subject"),
    snippet: raw.snippet ? decodeEntities(raw.snippet) : null,
    bodyText: extractBody(raw.payload),
    receivedAt: receivedAt(raw, headers),
  };
}

function headerValue(
  headers: { name: string; value: string }[],
  name: string,
): string | null {
  const found = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? null;
}

/**
 * La fecha de envío es la referencia contra la que se resuelven las fechas
 * relativas del correo ("el próximo miércoles"), así que importa que sea la
 * real. internalDate es la que Gmail asigna al recibirlo; si falta, el header
 * Date del remitente.
 */
function receivedAt(
  raw: RawMessage,
  headers: { name: string; value: string }[],
): Date {
  if (raw.internalDate) {
    const ms = Number(raw.internalDate);
    if (Number.isFinite(ms) && ms > 0) return new Date(ms);
  }
  const dateHeader = headerValue(headers, "Date");
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function parseFrom(value: string): {
  email: string;
  name: string | null;
} {
  const angled = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].replace(/^"|"$/g, "").trim();
    return { email: angled[2].trim().toLowerCase(), name: name || null };
  }
  return { email: value.trim().toLowerCase(), name: null };
}

/** Prefiere text/plain; si solo hay HTML, lo limpia. Ignora adjuntos. */
function extractBody(payload?: GmailPart): string {
  if (!payload) return "";

  const plain = findPart(payload, "text/plain");
  if (plain) return decodeBase64Url(plain).trim();

  const html = findPart(payload, "text/html");
  if (html) return htmlToText(decodeBase64Url(html)).trim();

  return "";
}

function findPart(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.mimeType === mimeType && part.body?.data && !part.filename) {
    return part;
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decodeBase64Url(part: GmailPart): string {
  const data = part.body?.data;
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    .toString("utf8");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}
