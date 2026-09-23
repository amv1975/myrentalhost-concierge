import type { Agenda } from "@/lib/agenda";

/**
 * La agenda, encima de todo lo demás.
 *
 * Va primero porque cambia cómo se lee el resto: seis cosas pendientes con la
 * mañana libre no es lo mismo que seis con dos reuniones encima. Y cuando no
 * hay nada, lo dice — "el día es tuyo" es de las pocas frases que uno agradece
 * leer a las siete de la mañana.
 */
export function ParteAgenda({ agenda }: { agenda: Agenda }) {
  // Si no se pudo mirar el calendario, no se dice nada. Callar es honesto;
  // decir "no tienes nada" cuando no se ha podido comprobar, no.
  if (!agenda.ok) return null;

  const hoy = agenda.slots.filter((s) => s.when === "hoy");
  const manana = agenda.slots.filter((s) => s.when === "mañana");

  return (
    <section className="parte-agenda">
      <h2>Tu día</h2>

      {hoy.length === 0 && manana.length === 0 ? (
        // Sin la coletilla de los bloques de estancias. Era una explicación de
        // por qué no se cuentan, y explicarlo cada mañana durante un año para
        // que sirviera una vez no sale a cuenta.
        <p className="libre">Sin citas hoy ni mañana. El día es tuyo.</p>
      ) : (
        <>
          <Day label="Hoy" slots={hoy} />
          <Day label="Mañana" slots={manana} />

          {/* Lo que se pisa va después de la lista y no dentro: mirando la
              lista no se ve, porque dos horas seguidas no parecen un choque
              hasta que sabés cuánto dura la primera. */}
          {agenda.pisados.map((choque, i) => (
            <p className="pisado" key={i}>
              {choque.when === "hoy" ? "Hoy" : "Mañana"} se te pisan{" "}
              <b>{choque.a}</b> y <b>{choque.b}</b>.
            </p>
          ))}

          {/* Y el marco al final, que es la conclusión de todo lo anterior. */}
          {agenda.marco ? <p className="marco">{agenda.marco}</p> : null}
        </>
      )}
    </section>
  );
}

function Day({
  label,
  slots,
}: {
  label: string;
  slots: Agenda["slots"];
}) {
  return (
    <div className="dia">
      <span className="cuando">{label}</span>
      {slots.length === 0 ? (
        <span className="nada">nada</span>
      ) : (
        <ul>
          {slots.map((slot, index) => (
            <li key={`${slot.time}-${index}`}>
              <span className="hora">{slot.time}</span>
              <span className="que">
                {slot.title}
                {slot.location ? (
                  <span className="donde"> · {slot.location}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
