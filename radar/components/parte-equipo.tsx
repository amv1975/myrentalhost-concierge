"use client";

import { useState } from "react";
import { enlaceWhatsApp, textoParaElEquipo } from "@/lib/equipo";
import type { ParteEntry } from "@/lib/parte";

/**
 * La barra que aparece al elegir cosas para pasarle al equipo.
 *
 * Solo existe cuando hay algo elegido: una app que se mira medio dormido no
 * puede tener un botón permanente para algo que se usa dos veces al día.
 *
 * Y no toca nada más. Pasar algo al equipo no lo marca como hecho ni lo saca
 * del parte, porque delegar no es despachar: hasta que no vuelvan con una
 * respuesta sigue siendo tuyo. Si quieres que desaparezca, Listo está donde
 * siempre.
 */
export function ParteEquipo({
  elegidos,
  onLimpiar,
}: {
  elegidos: ParteEntry[];
  onLimpiar: () => void;
}) {
  const [enviado, setEnviado] = useState(false);

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

  return (
    <div className="parte-equipo">
      <div>
        <button type="button" className="mandar" onClick={enviar}>
          {enviado ? "Enviar otra vez" : `Pasar ${elegidos.length} al equipo`}
        </button>
        <button
          type="button"
          className="quitar"
          onClick={() => {
            setEnviado(false);
            onLimpiar();
          }}
          aria-label="Quitar la selección"
        >
          Quitar
        </button>
      </div>
    </div>
  );
}
