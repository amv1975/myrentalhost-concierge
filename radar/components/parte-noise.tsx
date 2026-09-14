"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NoiseEntry } from "@/lib/parte";
import { SLUG_BY_SPACE, spaceLabel, type SpaceKey } from "@/lib/types";

/**
 * Lo que el filtro tiró, y la forma de decirle que se equivocó.
 *
 * Antes esto era una lista muerta con un pie que decía "si ves algo mal
 * descartado, dilo en Ajustes" — y en Ajustes no había nada que hacer. Enseñaba
 * el error sin dejar corregirlo, así que el filtro solo podía aprender de sus
 * aciertos: descartar enseñaba qué no traer, y no había ningún gesto que
 * enseñara qué no dejarse fuera.
 *
 * Hacen falta dos toques y no uno porque el filtro descartó el correo
 * precisamente por no saber de qué vida era. Esa es la información que falta, y
 * es la que hay que pedir.
 */
/** A qué vidas se puede mandar un correo rescatado, en el orden del filtro. */
const DESTINOS: readonly SpaceKey[] = ["work", "personal", "family"];

export function ParteNoise({
  total,
  entries,
}: {
  total: number;
  entries: NoiseEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /** Cuál está preguntando a qué vida pertenece. */
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Record<string, string>>({});
  const [fallo, setFallo] = useState<string | null>(null);

  async function rescatar(id: string, espacio: SpaceKey) {
    setEligiendo(null);
    setFallo(null);
    // Optimista: el correo ya no es ruido en cuanto lo dices. Si el servidor
    // dice que no, se deshace y se cuenta.
    setHecho((prev) => ({ ...prev, [id]: espacio }));

    try {
      const response = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescatar", espacio }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `El servidor respondió ${response.status}`);
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setHecho((prev) => {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      });
      setFallo(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  return (
    <details className="parte-noise">
      <summary>{total} correos descartados por ruido</summary>

      {entries.length > 0 ? (
        <ul>
          {entries.map((entry) => {
            const rescatado = hecho[entry.id];

            return (
              <li key={entry.id}>
                <span className="nfrom">{entry.who}</span>
                <span className="nsubj">{entry.subject}</span>

                {rescatado ? (
                  <span className="nok">
                    Rescatado · sube al parte en la próxima actualización
                  </span>
                ) : eligiendo === entry.id ? (
                  <span className="nacciones">
                    <span className="nlabel">¿De qué es?</span>
                    {DESTINOS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => rescatar(entry.id, key)}
                      >
                        {spaceLabel(key)}
                      </button>
                    ))}
                    <button type="button" onClick={() => setEligiendo(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <span className="nacciones">
                    <button type="button" onClick={() => setEligiendo(entry.id)}>
                      Esto sí me importa
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {fallo ? <p className="parte-error">{fallo}</p> : null}

      <p className="note">
        Está aquí para que puedas comprobar que no se tiró nada que importara.
        Lo que rescates vuelve a la cola, se lee entero y además le enseña al
        filtro qué no puede volver a dejarse fuera.
      </p>
    </details>
  );
}
