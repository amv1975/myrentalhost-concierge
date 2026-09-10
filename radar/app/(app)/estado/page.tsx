import Link from "next/link";
import { getDiagnostico } from "@/lib/diagnostico";
import { checkSchema } from "@/lib/schema-check";

/**
 * Qué está haciendo la app por dentro, en una pantalla de móvil.
 *
 * No arregla nada: enseña. Existe porque durante una tarde entera los fallos
 * se diagnosticaron deduciendo desde capturas, con los datos ahí al lado y sin
 * forma de mirarlos sin un ordenador delante. Un fallo que se ve se arregla en
 * minutos; uno que se deduce, en horas.
 */
export default async function EstadoPage() {
  const [diagnostico, esquema] = await Promise.all([
    getDiagnostico(),
    checkSchema(),
  ]);

  return (
    <div className="parte">
      <header>
        <p className="parte-eyebrow">Radar por dentro</p>
        <h1 className="parte-date">Estado</h1>
      </header>

      {diagnostico.error ? (
        <div className="parte-broken">
          <p className="que">No se pudo leer el estado.</p>
          <p className="detalle">{diagnostico.error}</p>
        </div>
      ) : null}

      <section className="estado-bloque">
        <h2>Dónde está cada correo</h2>
        <table className="estado-tabla">
          <tbody>
            {diagnostico.reparto.map((fila) => (
              <tr key={fila.estado}>
                <td>{fila.estado}</td>
                <td className="num">{fila.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="nota">
          Un correo va de arriba abajo: lo mira el filtro, y o es ruido o pasa a
          leerse entero. Si se acumulan en uno de los dos primeros, esa etapa no
          está corriendo.
        </p>
      </section>

      <section className="estado-bloque">
        <h2>Últimas pasadas</h2>
        <table className="estado-tabla">
          <tbody>
            {diagnostico.pasadas.map((pasada, index) => (
              <tr key={`${pasada.startedAt}-${index}`} data-mal={pasada.status !== "ok"}>
                <td>
                  {hhmm(pasada.startedAt)} · {pasada.kind}
                </td>
                <td className="num">
                  {pasada.segundos === null ? "—" : `${pasada.segundos}s`}
                </td>
                <td className="num">
                  {pasada.vistos > 0 || pasada.nuevos > 0
                    ? `${pasada.nuevos}/${pasada.vistos}`
                    : ""}
                </td>
                <td className={pasada.status === "ok" ? "ok" : "mal"}>
                  {pasada.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {diagnostico.pasadas.some((p) => p.error) ? (
          <ul className="errores">
            {diagnostico.pasadas
              .filter((p) => p.error)
              .slice(0, 4)
              .map((p, index) => (
                <li key={index}>
                  <b>{hhmm(p.startedAt)}</b> {p.error}
                </li>
              ))}
          </ul>
        ) : null}
        <p className="nota">
          Nuevos/vistos y cuánto duró. Una pasada que siempre acaba en el mismo
          número de segundos se está quedando sin tiempo.
        </p>
      </section>

      {diagnostico.colegio.length > 0 ? (
        <section className="estado-bloque">
          <h2>Los del colegio</h2>
          <table className="estado-tabla">
            <tbody>
              {diagnostico.colegio.map((correo, index) => (
                <tr key={index}>
                  <td>{correo.subject ?? "(sin asunto)"}</td>
                  <td className="num">{correo.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="estado-bloque">
        <h2>Base de datos</h2>
        <p className={esquema.ok ? "ok" : "mal"}>
          {esquema.ok
            ? "Al día. No falta ninguna columna."
            : (esquema.error ?? `Faltan: ${esquema.missing.join(", ")}`)}
        </p>
      </section>

      <p className="parte-foot">
        <Link href="/">Volver al parte</Link>
      </p>
    </div>
  );
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
