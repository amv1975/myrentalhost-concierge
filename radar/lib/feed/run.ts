import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import { getMessageBody } from "@/lib/google/gmail";
import { getAllSpaces } from "@/lib/spaces";
import { sourceLabel } from "@/lib/source-label";
import { readUsage, Spend } from "@/lib/usage";
import { deadlineIn, limites } from "@/lib/deadline";
import { describeError } from "@/lib/errors";
import {
  buildFeedSystemPrompt,
  buildFeedUserPrompt,
  type FeedEmail,
} from "@/lib/feed/prompt";
import {
  dentroDeVentana,
  desdeParaCada,
  sinNoticias,
} from "@/lib/feed/ventana";

/**
 * El Feed no corre solo, y esa es toda la idea.
 *
 * Una síntesis semanal que llega sola se convierte en otra bandeja de entrada
 * —una cosa más que atender a una hora que no elegiste—. Pedida a mano cuando
 * hay un rato, es lo contrario: no hay ritmo que mantener y no se gasta nada
 * las semanas que no se mira.
 *
 * Tampoco toca el parte ni el filtro. Los boletines siguen siendo ruido para
 * "qué tengo que hacer hoy", que es lo correcto, y sus correos ya están
 * descargados entre los descartados. Lo único que falta cuando pulsas es
 * bajarles el cuerpo.
 */

/** Un modelo bueno: son pocos correos, una vez por semana, y hay que sintetizar
 *  de verdad en vez de resumir de uno en uno. */
const MODEL = "claude-sonnet-5";

/** Cuántos boletines entran en una síntesis. Más no cabe ni hace falta. */
const MAX_EMAILS = 25;

/** Hasta dónde mira atrás la primera vez, sin una síntesis anterior. */
const PRIMERA_VENTANA_MS = 7 * 86_400_000;

export interface FeedResult {
  markdown: string | null;
  emails: number;
  costUsd: number;
  error?: string;
}

export async function sincronizarFeed(): Promise<FeedResult> {
  const admin = createAdminClient();
  const spend = new Spend();

  try {
    const { data: feedRows, error: feedError } = await admin
      .from("feeds")
      .select("from_email, name, created_at");
    if (feedError) throw feedError;

    const seguidos = (feedRows ?? []).map((f) => {
      const fila = f as {
        from_email: string;
        name: string | null;
        created_at: string;
      };
      return {
        fromEmail: fila.from_email,
        name: fila.name,
        createdAt: fila.created_at,
      };
    });

    if (seguidos.length === 0) {
      return {
        markdown: null,
        emails: 0,
        costUsd: 0,
        error: "Todavía no sigues ningún boletín.",
      };
    }

    // El tope es hasta dónde llega el buzón; la ventana de verdad la pone cada
    // remitente, porque uno recién añadido no tiene nada leído que repetir.
    const tope = new Date(Date.now() - PRIMERA_VENTANA_MS);
    const ventanas = desdeParaCada(seguidos, await ultimaSintesis(), tope);

    const { data: rows, error } = await admin
      .from("emails")
      .select("id, from_email, from_name, subject, received_at, body_text")
      .in(
        "from_email",
        seguidos.map((s) => s.fromEmail),
      )
      .gte("received_at", tope.toISOString())
      .order("received_at", { ascending: false })
      .limit(MAX_EMAILS);
    if (error) throw error;

    const todos = (rows ?? []) as {
      id: string;
      from_email: string;
      from_name: string | null;
      subject: string | null;
      received_at: string;
      body_text: string | null;
    }[];

    const correos = dentroDeVentana(todos, ventanas);

    if (correos.length === 0) {
      // Decir de quién no ha llegado nada, por su nombre. Es la diferencia
      // entre entender que un medio al que citan otros no te escribe a ti, y
      // pensar que la app está rota.
      const callados = sinNoticias(seguidos, todos);
      return {
        markdown: null,
        emails: 0,
        costUsd: 0,
        error:
          callados.length > 0
            ? `No ha llegado nada nuevo. Sin correos esta semana de: ${callados.join(", ")}.`
            : "No ha llegado ningún boletín nuevo desde la última vez.",
      };
    }

    // El cuerpo solo se baja aquí: al filtro le bastó el asunto para darlos por
    // ruido, así que nunca se pidió. Es la única parte que cuesta tiempo.
    const spaces = await getAllSpaces();
    const userId = spaces.length > 0 ? await getIngestUserId(spaces[0].id) : null;
    const accessToken = userId ? await getAccessToken(userId) : null;

    const conCuerpo: FeedEmail[] = [];
    for (const correo of correos) {
      let body = correo.body_text;
      // Los cuerpos guardados antes de que se conservaran los enlaces no
      // tienen ninguno, y un boletín sin enlaces no puede llevarte a leer
      // nada. Se vuelven a bajar una vez; a partir de ahí ya traen su
      // dirección y esta condición no se cumple nunca más.
      const sinEnlaces = body !== null && !/https?:\/\//.test(body);
      if ((!body || sinEnlaces) && accessToken) {
        try {
          body = await getMessageBody(accessToken, await gmailIdDe(correo.id));
          await admin
            .from("emails")
            .update({ body_text: body })
            .eq("id", correo.id);
        } catch {
          // Un boletín que Gmail no devuelve no puede tumbar la síntesis.
          continue;
        }
      }
      if (!body?.trim()) continue;

      conCuerpo.push({
        who: sourceLabel(correo.from_email, correo.from_name) ?? correo.from_email,
        subject: correo.subject,
        receivedAt: correo.received_at.slice(0, 10),
        body,
      });
    }

    if (conCuerpo.length === 0) {
      return {
        markdown: null,
        emails: 0,
        costUsd: 0,
        error: "No se pudo leer ninguno de los boletines nuevos.",
      };
    }

    const negocio =
      spaces.find((s) => s.key === "work")?.description ??
      "Gestiona apartamentos turísticos en Barcelona, anunciados en Airbnb y Booking.";

    const plazo = deadlineIn(40_000);
    const response = await getClient().messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        system: [
          {
            type: "text",
            text: buildFeedSystemPrompt({ negocio }),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: buildFeedUserPrompt(conCuerpo) },
        ],
      },
      limites(plazo),
    );

    spend.add(MODEL, readUsage(response.usage), "feed");

    const markdown = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!markdown) {
      return {
        markdown: null,
        emails: conCuerpo.length,
        costUsd: spend.usd,
        error: "El modelo no devolvió nada.",
      };
    }

    await admin.from("feed_digests").insert({
      // El más antiguo que ha entrado: es lo que de verdad cubre esta
      // síntesis, y con ventanas por remitente ya no hay una sola fecha de
      // partida que valga para todos.
      since: correos[correos.length - 1].received_at,
      markdown,
      emails: conCuerpo.length,
      cost_usd: spend.usd,
    });

    return { markdown, emails: conCuerpo.length, costUsd: spend.usd };
  } catch (error) {
    return {
      markdown: null,
      emails: 0,
      costUsd: spend.usd,
      error: describeError(error),
    };
  }
}

/**
 * Desde cuándo mirar.
 *
 * Desde la última síntesis, para no repetir lo que ya te conté. La primera vez
 * —o después de mucho tiempo— una semana, que es lo que cabe leer de una
 * sentada sin que la síntesis se vuelva un resumen de resúmenes.
 */
/** Cuándo se hizo la última síntesis, o null si no hay ninguna. */
async function ultimaSintesis(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("feed_digests")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { created_at: string } | null)?.created_at ?? null;
}

async function gmailIdDe(id: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("emails")
    .select("gmail_message_id")
    .eq("id", id)
    .maybeSingle();
  return (data as { gmail_message_id: string }).gmail_message_id;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}
