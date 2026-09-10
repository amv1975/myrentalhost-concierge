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
        <p className="libre">
          Sin citas hoy ni mañana. El día es tuyo.
          {agenda.blocks > 0 ? (
            <span>
              {" "}
              ({agenda.blocks}{" "}
              {agenda.blocks === 1 ? "bloque" : "bloques"} de estancias, que no
              te piden nada)
            </span>
          ) : null}
        </p>
      ) : (
        <>
          <Day label="Hoy" slots={hoy} />
          <Day label="Mañana" slots={manana} />
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
