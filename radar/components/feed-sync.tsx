"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatUsd } from "@/lib/usage";

/**
 * El botón que trae la síntesis.
 *
 * A mano y solo a mano: es la decisión que hace que esto no sea otra bandeja
 * de entrada. Una síntesis que llega sola es una cosa más que atender a una
 * hora que no elegiste; una que pides cuando tienes un rato, no.
 */
export function FeedSync({ seguidos }: { seguidos: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function sincronizar() {
    setBusy(true);
    setMensaje(null);
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sincronizar" }),
      });
      const body = (await response.json()) as {
        emails?: number;
        costUsd?: number;
        error?: string;
      };
      if (body.error) {
        setMensaje(body.error);
      } else {
        setMensaje(
          `${body.emails} boletines leídos · ${formatUsd(body.costUsd ?? 0)}`,
        );
      }
      startTransition(() => router.refresh());
    } catch {
      setMensaje("No se pudo sincronizar. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="feed-sync">
      <button
        type="button"
        onClick={sincronizar}
        disabled={busy || seguidos === 0}
      >
        {busy ? "Leyendo los boletines…" : "Sincronizar"}
      </button>
      {mensaje ? <p className="nota">{mensaje}</p> : null}
    </div>
  );
}
