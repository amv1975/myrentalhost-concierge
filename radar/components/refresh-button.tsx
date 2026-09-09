"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Busca correos y extrae, en ese orden. Es el mismo trabajo que hace el cron,
 * disponible a mano para cuando esperas algo y no quieres aguardar a la hora.
 */
export function RefreshButton({ espacio }: { espacio: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "ingest" | "extract">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setMessage(null);
    try {
      setPhase("ingest");
      const ingest = await postJson(`/api/spaces/${espacio}/ingest`);

      setPhase("extract");
      const extract = await postJson(`/api/spaces/${espacio}/extract`);

      const nuevos = extract.created ?? 0;
      const cambios = extract.updated ?? 0;

      // La ingesta puede terminar bien habiendo guardado solo una parte, si
      // Gmail cortó por cuota. Eso no es un fallo: el resto entra al repetir.
      if (ingest.error) {
        setMessage(readable(ingest.error));
      } else {
        setMessage(
          nuevos + cambios === 0
            ? `${ingest.messagesNew ?? 0} correos nuevos, nada que revisar`
            : `${nuevos} nuevos, ${cambios} con cambios`,
        );
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(
        readable(error instanceof Error ? error.message : "Error inesperado"),
      );
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm font-medium shadow-sm transition active:scale-[0.98] disabled:opacity-60"
      >
        {phase === "ingest"
          ? "Buscando…"
          : phase === "extract"
            ? "Analizando…"
            : "Actualizar"}
      </button>
      {message ? (
        <p className="mt-1 max-w-[14rem] text-xs text-[var(--color-muted)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

async function postJson(url: string) {
  const response = await fetch(url, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar");
  return body;
}

/**
 * Los errores de Google llegan como un JSON largo que no dice nada útil a quien
 * está mirando el móvil. Se traducen los que tienen una causa reconocible y del
 * resto se muestra solo el principio.
 */
function readable(raw: string): string {
  if (/Quota exceeded|rateLimitExceeded|429/i.test(raw)) {
    return "Gmail limitó las peticiones. Se guardó lo descargado; vuelve a pulsar en un minuto para el resto.";
  }
  if (/invalid_grant|refresh token/i.test(raw)) {
    return "El permiso de Google caducó. Cierra sesión y vuelve a entrar para renovarlo.";
  }
  if (/insufficient|insufficientPermissions|403/i.test(raw)) {
    return "Google rechazó la petición por permisos. Vuelve a entrar aceptando el acceso a Gmail y Calendar.";
  }
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}
