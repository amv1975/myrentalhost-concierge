import Link from "next/link";
import { getFeed } from "@/lib/feed/leer";
import { FeedSync } from "@/components/feed-sync";
import { FeedDigest } from "@/components/feed-digest";

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
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  const feed = await getFeed(s);
  const leyendoVieja = feed.ultima !== null && feed.historial[0]?.id !== feed.ultima.id;

  return (
    <div className="parte feed">
      <header>
        <p className="parte-eyebrow">Feed</p>
        <h1 className="parte-date">Lo que se dice en tu sector</h1>
      </header>

      {feed.sinMontar ? (
        <div className="parte-broken">
          <p className="que">El Feed todavía no está montado</p>
          <p className="que-hacer">
            Le faltan dos tablas en la base de datos. No es un fallo de la app
            ni se ha perdido nada: el resto de Radar funciona igual. En
            Supabase, SQL Editor, crea <code>feeds</code> y{" "}
            <code>feed_digests</code>, y si ya lo hiciste, fuerza la recarga
            desde Settings → API → Reload schema cache.
          </p>
        </div>
      ) : feed.error ? (
        <div className="parte-broken">
          <p className="que">No se pudo abrir el Feed</p>
          <p className="detalle">{feed.error}</p>
        </div>
      ) : null}

      {feed.sinMontar ? null : <FeedSync seguidos={feed.seguidos.length} />}

      {feed.sinMontar ? null : feed.ultima ? (
        <section className="feed-digest">
          <p className="cuando">
            {fecha(feed.ultima.createdAt)} · {feed.ultima.emails} boletines
            {leyendoVieja ? (
              <>
                {" · "}
                <Link href="/feed">ver la última</Link>
              </>
            ) : null}
          </p>
          <FeedDigest
            markdown={feed.ultima.markdown}
            createdAt={feed.ultima.createdAt}
          />
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

      {feed.sinMontar || feed.historial.length < 2 ? null : (
        <section className="feed-lista">
          <h2>Síntesis anteriores</h2>
          <ul className="feed-historial">
            {feed.historial
              .filter((h) => h.id !== feed.ultima?.id)
              .map((h) => (
                <li key={h.id}>
                  <Link href={`/feed?s=${h.id}`}>
                    <span className="cuando">{fecha(h.createdAt)}</span>
                    <span className="titulo">{h.titulo}</span>
                  </Link>
                </li>
              ))}
          </ul>
          <p className="nota">
            No se borran. Lo que costó una sincronización se puede releer
            siempre, y leídas seguidas se ve lo que se repite.
          </p>
        </section>
      )}

      {feed.sinMontar ? null : (
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
      )}

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

function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
