import { notFound } from "next/navigation";
import Link from "next/link";
import { ParteBoard } from "@/components/parte-board";
import { FeedDigest } from "@/components/feed-digest";
import { SAMPLE_AGENDA, SAMPLE_PARTE } from "@/lib/preview/parte-sample";

/**
 * Las pantallas con datos de ejemplo, para poder mirarlas sin buzón ni base de
 * datos.
 *
 * Existe por el modo noche y se ha quedado por la tipografía: hay decisiones
 * —un color, un tamaño, si algo cabe en una línea— que solo se juzgan
 * mirándolas, y el único sitio donde mirarlas era el móvil de Agustín después
 * de desplegar. El Feed se añadió el día que un gris sobre negro resultó no
 * leerse: lo que no se puede abrir aquí se acaba juzgando en producción.
 *
 * Solo con RADAR_PREVIEW=1. No lee ni escribe nada.
 */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  if (process.env.RADAR_PREVIEW !== "1") notFound();
  const { vista } = await searchParams;

  if (vista === "feed") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="parte feed">
          <header>
            <p className="parte-eyebrow">Feed</p>
            <h1 className="parte-date">Lo que se dice en tu sector</h1>
          </header>
          <section className="feed-digest">
            <p className="cuando">23 de septiembre a las 17:00 · 7 boletines</p>
            <FeedDigest
              markdown={SAMPLE_FEED}
              createdAt="2026-09-23T15:00:00Z"
            />
          </section>
          <section className="feed-lista">
            <h2>Síntesis anteriores</h2>
            <ul className="feed-historial">
              <li>
                <Link href="/preview?vista=feed">
                  <span className="cuando">16 de septiembre a las 09:12</span>
                  <span className="titulo">
                    Justicia avala multas de 30.000 € a pisos sin licencia
                  </span>
                </Link>
              </li>
            </ul>
            <p className="nota">
              No se borran. Lo que costó una sincronización se puede releer
              siempre.
            </p>
          </section>
          <p className="parte-foot">
            <span>
              Esto no se actualiza solo. Se lee cuando tienes tiempo, y las
              semanas que no lo abres no cuesta nada.
            </span>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <ParteBoard
        parte={SAMPLE_PARTE}
        agenda={SAMPLE_AGENDA}
        espacios={["work", "personal", "family"]}
      />
    </main>
  );
}

const SAMPLE_FEED = `**Airbnb quiere cobrarte por vender dentro de su propia plataforma** Chesky anticipó anuncios patrocinados para anfitriones, con la idea de sumar 1.000 millones de dólares de ingresos. Todavía no hay fecha ni mecánica concreta, pero es la dirección.

**Apartur: ocupación del 88,8% en Barcelona este verano** Tres medios citan esta misma cifra en el marco del debate sobre acotar el alquiler turístico. Nada urgente, pero es la semana en que más medios hablaron de vuestro sector.

Lo demás iba de hoteles (RMS de Cloudbeds, informes de IA generativa para cadenas), rondas de financiación de startups de pagos, y notas de prensa sueltas de turismo general.`;
