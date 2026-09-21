"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enlaceWhatsApp, textoParaElEquipo } from "@/lib/equipo";
import type { ParteEntry } from "@/lib/parte";

/**
 * La barra que aparece al elegir cosas para pasarle al equipo.
 *
 * Solo existe cuando hay algo elegido: una app que se mira medio dormido no
 * puede tener un botón permanente para algo que se usa dos veces al día.
 *
 * Enviar no despacha nada por su cuenta: delegar no es lo mismo que resolver,
 * y hay cosas que uno pasa al equipo y quiere seguir viendo hasta que vuelvan.
 * Pero después de enviar aparece el atajo, porque la mayoría de las veces sí
 * es el final del asunto y si no estuviera habría que ir fila por fila
 * pulsando Listo en las mismas tres que acabas de mandar.
 */
export function ParteEquipo({
  elegidos,
  onLimpiar,
}: {
  elegidos: ParteEntry[];
  onLimpiar: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const [despachando, setDespachando] = useState(false);

  if (elegidos.length === 0) return null;

  const texto = textoParaElEquipo(elegidos);

  async function enviar() {
    // El menú de compartir del móvil deja elegir grupo dentro de WhatsApp, y
    // de paso sirve para mandarlo a otro sitio si hace falta. Donde no exista
    // —un navegador de escritorio— se cae al enlace de WhatsApp de toda la
    // vida, que hace lo mismo con un paso más.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: texto });
        setEnviado(true);
        return;
      } catch {
        // Cancelado, o el navegador dijo que no: queda el enlace de abajo.
      }
    }
    window.open(enlaceWhatsApp(texto), "_blank", "noopener,noreferrer");
    setEnviado(true);
  }

  /**
   * Darlos por despachados sin ir uno a uno.
   *
   * "Listo" y no "Descartar": descartar le enseña al filtro a no subir más
   * avisos de este tipo, y pasarle algo al equipo no significa eso ni de
   * lejos. Significa que ya se ocupó alguien.
   */
  async function marcarListos() {
    setDespachando(true);
    await Promise.all(
      elegidos.map((entry) =>
        fetch(
          entry.kind === "item"
            ? `/api/items/${entry.id}`
            : `/api/emails/${entry.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: entry.kind === "item" ? "hecho" : "visto",
            }),
          },
        ).catch(() => null),
      ),
    );
    setDespachando(false);
    setEnviado(false);
    onLimpiar();
    startTransition(() => router.refresh());
  }

  return (
    <div className="parte-equipo">
      <div>
        {enviado ? (
          <button
            type="button"
            className="mandar"
            onClick={marcarListos}
            disabled={despachando}
          >
            {despachando
              ? "Quitando…"
              : `Marcar ${elegidos.length} como Listo`}
          </button>
        ) : (
          <button type="button" className="mandar" onClick={enviar}>
            Pasar {elegidos.length} al equipo
          </button>
        )}
        <button
          type="button"
          className="quitar"
          onClick={() => {
            setEnviado(false);
            onLimpiar();
          }}
          aria-label="Quitar la selección"
        >
          {enviado ? "Dejarlos" : "Quitar"}
        </button>
      </div>
      {enviado ? (
        <p className="aviso">
          Enviado. Si el equipo se ocupa, quítalos de tu parte; si quieres
          seguirlos, déjalos.
        </p>
      ) : null}
    </div>
  );
}
