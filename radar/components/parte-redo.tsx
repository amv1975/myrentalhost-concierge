"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Rehacer los resúmenes de lo que ya está guardado.
 *
 * Hace falta cuando cambian las reglas: un correo analizado no se vuelve a
 * analizar nunca, así que los viejos se quedan como los dejó el prompt
 * anterior —en catalán, sin detalle, con el criterio antiguo— y no hay forma
 * de que se arreglen solos.
 *
 * Vive aquí, en el parte, y no escondido en Ajustes, porque esta es la
 * pantalla en la que se ve el problema: si lees algo raro, lo arreglas donde
 * lo estás leyendo.
 */
export function ParteRedo({ espacios }: { espacios: string[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setAsking(false);
    setMessage("Poniéndolos en cola…");

    let done = 0;
    const problems: string[] = [];

    // Uno detrás de otro: los dos espacios comparten los mismos correos y
    // lanzarlos a la vez sería pagar dos veces por leer lo mismo.
    for (const espacio of espacios) {
      try {
        const response = await fetch(`/api/spaces/${espacio}/reanalyze`, {
          method: "POST",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
        done += body.queued ?? 0;
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }

    setMessage(
      problems.length > 0
        ? problems[0]
        : `${done} correos en cola. Pulsa Actualizar para releerlos.`,
    );
    setBusy(false);
    startTransition(() => router.refresh());
  }

  if (busy) return <span className="parte-redo">{message}</span>;

  if (asking) {
    return (
      <span className="parte-redo">
        Pone los correos guardados en cola para volver a resumirlos. Después
        hay que pulsar Actualizar, quizá dos veces. Lo que ya confirmaste no se
        toca.{" "}
        <button type="button" onClick={run}>
          Hacerlo
        </button>{" "}
        <button type="button" onClick={() => setAsking(false)}>
          Dejarlo
        </button>
      </span>
    );
  }

  return (
    <span className="parte-redo">
      {message ? `${message} ` : null}
      <button type="button" onClick={() => setAsking(true)}>
        Rehacer los resúmenes
      </button>
    </span>
  );
}
