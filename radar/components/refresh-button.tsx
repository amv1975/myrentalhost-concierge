"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatUsd } from "@/lib/usage";

/**
 * Busca correos, extrae compromisos y sincroniza el calendario, en los dos
 * espacios a la vez. Es lo primero que se pulsa al abrir la app, así que es el
 * botón más grande de la pantalla y no obliga a repetir la operación por
 * pestaña.
 */
export function RefreshButton({ espacio: _espacio }: { espacio?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar");

      if (body.error) {
        setMessage(readable(body.error));
      } else {
        setMessage(summary(body));
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(
        readable(error instanceof Error ? error.message : "Error inesperado"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="w-full rounded-xl bg-[var(--color-ink)] px-4 py-3.5 text-base font-medium text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Buscando y analizando…" : "Actualizar"}
      </button>
      {message ? (
        <p className="mt-1.5 text-center text-xs text-[var(--color-muted)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Qué contar después de actualizar.
 *
 * Se mira todo el buzón, así que "sin novedades" a secas haría dudar de si ha
 * funcionado. Y como detrás hay un modelo que cobra por correo, el importe va
 * en la misma línea: es la única forma de que leer la bandeja entera no dé
 * miedo. Se enseña siempre, aunque sean céntimos, porque el día que suba se
 * tiene que ver ahí mismo y no en la factura.
 */
function summary(body: {
  created?: number;
  updated?: number;
  screened?: number;
  discarded?: number;
  read?: number;
  costUsd?: number;
}): string {
  const nuevos = body.created ?? 0;
  const cambios = body.updated ?? 0;
  const mirados = body.screened ?? 0;
  const ruido = body.discarded ?? 0;
  const leidos = body.read ?? 0;
  const coste = body.costUsd ? ` · ${formatUsd(body.costUsd)}` : "";

  if (nuevos + cambios > 0) {
    return `${nuevos} nuevos${cambios ? `, ${cambios} con cambios` : ""}${coste}`;
  }

  if (mirados > 0) {
    return `${mirados} correos mirados, ${ruido} descartados, ${leidos} leídos${coste}`;
  }

  if (leidos > 0) {
    return `${leidos} correos leídos, ningún compromiso nuevo${coste}`;
  }

  return "Sin novedades";
}

/**
 * Los errores de Google llegan como un JSON largo que no dice nada útil a quien
 * está mirando el móvil. Se traducen los que tienen una causa reconocible y del
 * resto se muestra solo el principio.
 */
function readable(raw: string): string {
  if (/Quota exceeded|rateLimitExceeded|429|limitando/i.test(raw)) {
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
