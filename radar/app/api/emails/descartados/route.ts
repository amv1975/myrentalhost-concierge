import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceLabel } from "@/lib/source-label";
import { describeError } from "@/lib/errors";
import { getAllSpaces } from "@/lib/spaces";
import { getAccessToken, getIngestUserId } from "@/lib/google/oauth";
import { getMessageHeaders, listMessageIds } from "@/lib/google/gmail";

/**
 * Buscar un correo que Radar no te ha subido.
 *
 * El gesto real: veo algo en Gmail que no está en el parte y quiero decirle
 * que eso sí me importa. Para eso hay que poder encontrarlo por lo poco que
 * uno recuerda — quién lo manda o dos palabras del asunto.
 *
 * Busca en todo lo que Radar tiene guardado, y si ahí no está, en el buzón.
 * Las dos cosas, porque las dos razones por las que un correo no está en el
 * parte se ven igual desde fuera: que el filtro lo tirara, que aún no lo haya
 * mirado, o que ni siquiera se descargara.
 *
 * Va contra service role y no contra RLS porque un correo clasificado como
 * ruido no pertenece a ningún espacio, así que RLS —con razón— no lo devuelve.
 * Eso obliga a comprobar a mano quién pregunta: solo el dueño del buzón. Sin
 * esa comprobación, cualquier miembro de cualquier espacio podría leer los
 * asuntos de toda la bandeja.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("google_accounts")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) {
    // Victoria ve el recuento de descartados, nunca la lista ni su contenido.
    return NextResponse.json({ results: [] });
  }

  try {
    const patron = `%${escaparLike(q)}%`;

    const { data, error } = await admin
      .from("emails")
      .select("id, from_email, from_name, subject, received_at")
      // Todo lo que Radar tenga, no solo lo que dio por ruido. Buscaba solo
      // entre los descartados y eso dejaba fuera los que aún estaban en la
      // cola sin juzgar: para quien busca, un correo que el filtro no ha
      // mirado todavía es igual de invisible que uno que tiró. La distinción
      // era de la máquina, no suya.
      //
      // Lo que descartaste tú sí se queda fuera: ya lo decidiste.
      .is("dismissed_at", null)
      // También en la vista previa. Un correo del ayuntamiento llega con un
      // asunto burocrático que no dice nada y lleva dentro lo único que uno
      // recuerda —"limpieza", el código de seguimiento—; buscar solo por
      // asunto y remitente lo dejaba inencontrable aunque estuviera guardado.
      .or(
        `subject.ilike.${patron},from_email.ilike.${patron},from_name.ilike.${patron},snippet.ilike.${patron}`,
      )
      .order("received_at", { ascending: false })
      .limit(LIMITE);
    if (error) throw error;

    const results = ((data ?? []) as {
      id: string;
      from_email: string;
      from_name: string | null;
      subject: string | null;
      received_at: string;
    }[]).map((row) => ({
      id: row.id,
      who: sourceLabel(row.from_email, row.from_name) ?? row.from_email,
      fromEmail: row.from_email,
      subject: row.subject ?? "(sin asunto)",
      at: row.received_at,
    }));

    // Si en Radar no hay nada, se busca en el buzón. Radar no es el archivo:
    // es una copia de los últimos días, y el correo que buscas puede ser de
    // antes de que empezara a mirar —o de un día que se perdió porque la
    // ventana era más corta de lo que debía—. Gmail sí lo tiene.
    if (results.length === 0) {
      return NextResponse.json({ results: await buscarEnGmail(q) });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

/** Bastantes para encontrarlo, pocos para no volver a la lista infinita. */
const LIMITE = 30;

/**
 * Lo que escribe el usuario entra en un patrón LIKE, así que sus comodines
 * tienen que dejar de serlo: buscar "100%" no puede significar "lo que sea".
 * Y la coma cierra el filtro .or() de PostgREST, que es el que de verdad
 * importa aquí.
 */
function escaparLike(texto: string): string {
  return texto.replace(/[%_\\,()]/g, " ").slice(0, 80);
}

/**
 * Traer del buzón lo que Radar no tiene guardado.
 *
 * Solo cabeceras —remitente, asunto, fecha—, que es gratis y es todo lo que
 * hace falta para reconocerlo y decidir. Se guardan sin clasificar: quedan
 * como "sin mirar", y el rescate es quien decide de qué vida son. Así un
 * correo encontrado a mano entra por el mismo camino que cualquier otro en
 * vez de por una puerta propia.
 *
 * Un fallo aquí devuelve vacío y no rompe la búsqueda: que Gmail no conteste
 * significa "no lo encuentro", no "la pantalla está rota".
 */
async function buscarEnGmail(q: string): Promise<Encontrado[]> {
  try {
    const spaces = await getAllSpaces();
    if (spaces.length === 0) return [];
    const userId = await getIngestUserId(spaces[0].id);
    if (!userId) return [];
    const accessToken = await getAccessToken(userId);

    // Entrecomillado: lo que escribe el usuario es un término de búsqueda, no
    // sintaxis de Gmail. Sin esto, un "from:" suyo cambiaría la consulta.
    const consulta = `"${q.replace(/"/g, " ")}" -in:spam -in:trash`;
    const ids = await listMessageIds(accessToken, consulta, MAX_GMAIL);
    if (ids.length === 0) return [];

    const admin = createAdminClient();
    const salida: Encontrado[] = [];

    for (const messageId of ids) {
      const { data: existente } = await admin
        .from("emails")
        .select("id, from_email, from_name, subject, received_at")
        .eq("gmail_message_id", messageId)
        .maybeSingle();

      let fila = existente as {
        id: string;
        from_email: string;
        from_name: string | null;
        subject: string | null;
        received_at: string;
      } | null;

      if (!fila) {
        const cabeceras = await getMessageHeaders(accessToken, messageId);
        const { data: insertada } = await admin
          .from("emails")
          .insert({
            gmail_message_id: cabeceras.id,
            gmail_thread_id: cabeceras.threadId,
            from_email: cabeceras.fromEmail,
            from_name: cabeceras.fromName,
            recipients: cabeceras.recipients,
            subject: cabeceras.subject,
            snippet: cabeceras.snippet,
            bulk: cabeceras.bulk,
            body_text: null,
            received_at: cabeceras.receivedAt.toISOString(),
          })
          .select("id, from_email, from_name, subject, received_at")
          .maybeSingle();
        fila = insertada as typeof fila;
      }

      if (!fila) continue;
      salida.push({
        id: fila.id,
        who: sourceLabel(fila.from_email, fila.from_name) ?? fila.from_email,
        fromEmail: fila.from_email,
        subject: fila.subject ?? "(sin asunto)",
        at: fila.received_at,
        deGmail: true,
      });
    }

    return salida;
  } catch {
    return [];
  }
}

/** Pocos: es una búsqueda de un correo concreto, no una segunda ingesta. */
const MAX_GMAIL = 15;

interface Encontrado {
  id: string;
  who: string;
  fromEmail: string;
  subject: string;
  at: string;
  /** Venía del buzón, no de la lista de descartados. La pantalla lo dice. */
  deGmail?: boolean;
}
