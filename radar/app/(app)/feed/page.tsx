import Link from "next/link";
import { getFeed } from "@/lib/feed/leer";
import { FeedSync } from "@/components/feed-sync";

export const dynamic = "force-dynamic";

/**
 * El Feed: lo que dicen los boletines del sector, cuando te apetezca.
 *
 * Deliberadamente aparte del parte. El parte contesta "¿qué tengo que hacer
 * hoy?"; esto contesta "¿qué está pasando en mi sector?". Son preguntas con
 * ritmos distintos y mezclarlas estropea la primera: un boletín no tiene
 * plazo, nadie espera respuesta y no se rompe nada si no se abre, así que
 * puesto entre las cosas urgentes le quita el sitio a algo que sí urge.
 */
export default async function FeedPage() {
  const feed = await getFeed();

  return (
    <div className="parte feed">
      <header>
        <p className="parte-eyebrow">Feed</p>
        <h1 className="parte-date">Lo que se dice en tu sector</h1>
      </header>

      {feed.error ? (
        <div className="parte-broken">
          <p className="que">No se pudo abrir el Feed</p>
          <p className="detalle">{feed.error}</p>
        </div>
      ) : null}

      <FeedSync seguidos={feed.seguidos.length} />

      {feed.ultima ? (
        <section className="feed-digest">
          <p className="cuando">
            {fecha(feed.ultima.createdAt)} · {feed.ultima.emails} boletines
          </p>
          <Markdown texto={feed.ultima.markdown} />
        </section>
      ) : (
        <p className="parte-empty">
          Todavía no hay ninguna síntesis.
          <span>
            {feed.seguidos.length === 0
              ? "Marca un boletín desde la lista de descartados del parte y vuelve aquí."
              : "Pulsa Sincronizar cuando tengas un rato."}
          </span>
        </p>
      )}

      <section className="feed-lista">
        <h2>Boletines que sigues</h2>
        {feed.seguidos.length === 0 ? (
          <p className="nota">
            Ninguno todavía. En el parte, abre los correos descartados, busca el
            boletín y pulsa «Seguir».
          </p>
        ) : (
          <ul>
            {feed.seguidos.map((s) => (
              <li key={s.fromEmail}>{s.name ?? s.fromEmail}</li>
            ))}
          </ul>
        )}
      </section>

      <p className="parte-foot">
        <span>
          Esto no se actualiza solo. Se lee cuando tienes tiempo, y las semanas
          que no lo abres no cuesta nada.
        </span>
        <span>
          <Link href="/">Volver al parte</Link>
        </span>
      </p>
    </div>
  );
}

/**
 * Markdown mínimo: negritas y párrafos, que es lo único que produce la
 * síntesis. Meter una librería entera para dos marcas sería pagar cien
 * kilobytes por un asterisco.
 */
function Markdown({ texto }: { texto: string }) {
  return (
    <>
      {texto
        .split(/\n{2,}/)
        .map((parrafo) => parrafo.trim())
        .filter(Boolean)
        .map((parrafo, i) => (
          <p key={i}>
            {parrafo.split(/(\*\*[^*]+\*\*)/g).map((trozo, j) =>
              trozo.startsWith("**") && trozo.endsWith("**") ? (
                <b key={j}>{trozo.slice(2, -2)}</b>
              ) : (
                <span key={j}>{trozo.replace(/^[-*]\s*/, "")}</span>
              ),
            )}
          </p>
        ))}
    </>
  );
}

function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
