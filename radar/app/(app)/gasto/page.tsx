import Link from "next/link";
import { getGasto } from "@/lib/gasto";
import { formatUsd } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Cuánto cuesta esto, sin entrar en Supabase.
 *
 * Nació de "¿cada vez que actualiza se cobra?". Podía contestarse con una
 * frase, pero una frase mía no se puede comprobar y el número sí: abrir la app
 * diez veces sale igual que abrirla una, y eso se ve en cuántas pasadas
 * salieron a cero.
 */
export default async function GastoPage() {
  const gasto = await getGasto();
  const cicloGratis = gasto.pasadas > 0 && gasto.gratis === gasto.pasadas;

  return (
    <div className="parte">
      <header>
        <p className="parte-eyebrow">Gasto</p>
        <h1 className="parte-date">Lo que cuesta Radar</h1>
      </header>

      {gasto.error ? (
        <div className="parte-broken">
          <p className="que">No se pudo leer el gasto.</p>
          <p className="detalle">{gasto.error}</p>
        </div>
      ) : null}

      <section className="estado-bloque">
        <h2>Total</h2>
        <table className="estado-tabla">
          <tbody>
            <tr>
              <td>Hoy</td>
              <td className="num">{formatUsd(gasto.hoy)}</td>
            </tr>
            <tr>
              <td>Últimos 7 días</td>
              <td className="num">{formatUsd(gasto.semana)}</td>
            </tr>
            <tr>
              <td>Últimos 30 días</td>
              <td className="num">{formatUsd(gasto.mes)}</td>
            </tr>
          </tbody>
        </table>
        {gasto.peorDia ? (
          <p className="nota">
            El día más caro del mes fue el {diaCorto(gasto.peorDia.dia)}:{" "}
            {formatUsd(gasto.peorDia.usd)}. Ese es el techo, no la media.
          </p>
        ) : null}
      </section>

      <section className="estado-bloque">
        <h2>En qué se va</h2>
        {gasto.conceptos.length === 0 ? (
          <p className="nota">Todavía no se ha gastado nada este mes.</p>
        ) : (
          <table className="estado-tabla">
            <tbody>
              {gasto.conceptos.map((c) => (
                <tr key={c.nombre}>
                  <td>{NOMBRES[c.nombre] ?? c.nombre}</td>
                  <td className="num">{formatUsd(c.usd)}</td>
                  <td className="num">{porcentaje(c.usd, gasto.mes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="nota">
          El filtro mira veinte asuntos por llamada y descarta el ruido sin
          abrirlo; la lectura paga el correo entero, y solo la pagan los pocos
          que sobreviven. El Feed es la llamada cara, y por eso es la única que
          no ocurre sola: solo cuando pulsas Sincronizar.
        </p>
      </section>

      <section className="estado-bloque">
        <h2>Pulsar Actualizar</h2>
        <p className={cicloGratis ? "ok" : undefined}>
          {gasto.pasadas === 0
            ? "Todavía no hay pasadas registradas este mes."
            : `${gasto.gratis} de ${gasto.pasadas} pasadas del mes no costaron nada.`}
        </p>
        <p className="nota">
          Se cobra por correo procesado, no por pulsar: si no ha entrado nada
          nuevo, el filtro y la lectura no llaman al modelo ni una vez. Abrir la
          app diez veces seguidas cuesta lo mismo que abrirla una.
        </p>
      </section>

      {gasto.feedVeces > 0 ? (
        <section className="estado-bloque">
          <h2>Feed</h2>
          <p>{gasto.feedVeces} síntesis este mes.</p>
          <p className="nota">
            Cada una lee los boletines enteros con el modelo grande. Las semanas
            que no lo abres no cuesta nada.
          </p>
        </section>
      ) : null}

      <p className="parte-foot">
        <Link href="/">Volver al parte</Link>
      </p>
    </div>
  );
}

const NOMBRES: Record<string, string> = {
  filtro: "Filtro por asunto",
  lectura: "Lectura y resumen",
  feed: "Síntesis del Feed",
  "sin desglosar": "Pasadas antiguas",
};

function porcentaje(parte: number, total: number): string {
  if (total <= 0) return "";
  const pct = Math.round((parte / total) * 100);
  return pct < 1 ? "<1%" : `${pct}%`;
}

/** "2026-09-21" → "21 de septiembre". */
function diaCorto(iso: string): string {
  const fecha = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "long",
  }).format(fecha);
}
