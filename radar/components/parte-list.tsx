"use client";

import { useEffect, useState } from "react";
import { ParteRow } from "@/components/parte-row";
import type { ParteEntry } from "@/lib/parte";

type Filter = "todo" | "work" | "family";

/**
 * El parte, con el filtro por vida encima.
 *
 * Todo junto por defecto, porque a las siete de la mañana la pregunta es "qué
 * hay hoy" y no "en qué mitad de mi vida miro". Pero cuando te sientas a
 * despachar trabajo, ver los recibos de casa por medio estorba — así que el
 * filtro existe, recuerda lo que elegiste, y no se te olvida en qué vista
 * estás porque los recuentos están a la vista.
 */
export function ParteList({
  urgent,
  rest,
  fyi,
}: {
  urgent: ParteEntry[];
  rest: ParteEntry[];
  fyi: ParteEntry[];
}) {
  const [filter, setFilter] = useState<Filter>("todo");

  // Se lee después del primer pintado a propósito: así el servidor y el cliente
  // pintan lo mismo y no hay parpadeo de hidratación.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved === "work" || saved === "family") setFilter(saved);
    } catch {
      /* Navegación privada: se queda en "todo", que es el valor razonable. */
    }
  }, []);

  function choose(next: Filter) {
    setFilter(next);
    try {
      localStorage.setItem(STORE, next);
    } catch {
      /* Que no se recuerde entre visitas no impide filtrar ahora. */
    }
  }

  const all = [...urgent, ...rest, ...fyi];
  const counts = {
    todo: all.length,
    work: all.filter((e) => e.life === "work").length,
    family: all.filter((e) => e.life === "family").length,
  };

  const keep = (entries: ParteEntry[]) =>
    filter === "todo" ? entries : entries.filter((e) => e.life === filter);

  const shownUrgent = keep(urgent);
  const shownRest = keep(rest);
  const shownFyi = keep(fyi);

  return (
    <>
      <div className="parte-filter" role="group" aria-label="Filtrar por vida">
        {(["todo", "work", "family"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => choose(value)}
          >
            {LABELS[value]}
            <span className="n">{counts[value]}</span>
          </button>
        ))}
      </div>

      {shownUrgent.length + shownRest.length + shownFyi.length === 0 ? (
        <p className="parte-empty">
          Nada aquí.
          <span>
            No hay nada de {LABELS[filter].toLowerCase()} pendiente ahora mismo.
          </span>
        </p>
      ) : (
        <>
          <Section title="Hay que mirarlo hoy" entries={shownUrgent} urgent />
          <Section title="Cuando puedas" entries={shownRest} />
          {/* El tercer montón es el que hace que te fíes: dice qué ha pasado
              que NO te toca. Sin él, "todo despejado" no se sabe si es que no
              ha pasado nada o es que la app no se ha enterado. */}
          <Section title="No hace falta que hagas nada" entries={shownFyi} />
        </>
      )}
    </>
  );
}

const STORE = "radar:parte-filtro";

const LABELS: Record<Filter, string> = {
  todo: "Todo",
  work: "Trabajo",
  family: "Familia",
};

function Section({
  title,
  entries,
  urgent = false,
}: {
  title: string;
  entries: ParteEntry[];
  urgent?: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <section className={urgent ? "parte-urgent" : undefined}>
      <h2>
        {title}
        <span className="count">{entries.length}</span>
      </h2>
      <div>
        {entries.map((entry) => (
          <ParteRow key={`${entry.kind}-${entry.id}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}
