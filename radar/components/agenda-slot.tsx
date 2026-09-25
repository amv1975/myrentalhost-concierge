"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgendaSlot } from "@/lib/agenda";

/**
 * Una cita del día, con la forma de quitarla de en medio.
 *
 * "El telefonillo es de mantenimiento: con verlo una vez ya está." Hay citas
 * que no se despachan yendo a ningún sitio, solo se leen; y mientras siguen
 * ahí compiten por la atención con lo que sí hay que hacer.
 *
 * Quitarla de la vista no toca tu Google Calendar. El evento sigue donde
 * estaba, con quien lo compartiera y con su aviso: lo único que cambia es que
 * Radar deja de enseñártelo.
 */
export function AgendaSlotRow({ slot }: { slot: AgendaSlot }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fuera, setFuera] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mandar(action: "ocultar" | "mostrar"): Promise<boolean> {
    try {
      const response = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, eventId: slot.id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? `El servidor respondió ${response.status}`);
        return false;
      }
      setError(null);
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("No se pudo guardar. Inténtalo otra vez.");
      return false;
    }
  }

  if (fuera) {
    return (
      <li className="agenda-fuera">
        <span>Fuera de la vista: {slot.title}</span>
        <button
          type="button"
          onClick={async () => {
            if (await mandar("mostrar")) setFuera(false);
          }}
        >
          Deshacer
        </button>
      </li>
    );
  }

  return (
    <li>
      <span className="hora">{slot.time}</span>
      <span className="que">
        {slot.title}
        {slot.location ? <span className="donde"> · {slot.location}</span> : null}
        {/* En su propio renglón: metido dentro del texto de la cita, el aviso
            parecía parte del sitio donde era la cita. */}
        {error ? <span className="agenda-error">{error}</span> : null}
      </span>
      <button
        type="button"
        className="agenda-listo"
        aria-label={`Quitar de la vista: ${slot.title}`}
        onClick={async () => {
          // Se va al pulsar y se vuelve si el servidor dice que no: esperar
          // a la respuesta para que desaparezca una línea hace que despachar
          // tres se sienta lento.
          setFuera(true);
          if (!(await mandar("ocultar"))) setFuera(false);
        }}
      >
        Listo
      </button>
    </li>
  );
}
