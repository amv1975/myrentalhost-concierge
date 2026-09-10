"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a analizar los correos ya guardados. Se usa cuando cambian las reglas
 * de extracción: sin esto, los ítems viejos se quedan como los dejó el prompt
 * anterior, porque un correo analizado no se reprocesa nunca.
 */
export function ReanalyzeButton({ espacio }: { espacio: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setAsking(false);
    setMessage(null);
    try {
      const response = await fetch(`/api/spaces/${espacio}/reanalyze`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo reanalizar");

      const kept = body.kept
        ? `, ${body.kept} intactos por estar confirmados`
        : "";
      setMessage(
        `${body.reanalyzed} correos reanalizados${kept}. ${body.created} compromisos.`,
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  if (asking) {
    return (
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="text-sm">
          Se vuelven a analizar los correos y se rehacen los compromisos que
          todavía no has confirmado. Lo que ya está en tu calendario no se toca.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={run}
            className="flex-1 rounded-lg bg-[var(--color-solid)] px-3 py-2.5 text-sm font-medium text-[var(--color-solid-ink)]"
          >
            Reanalizar
          </button>
          <button
            onClick={() => setAsking(false)}
            className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setAsking(true)}
        disabled={busy}
        className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-left text-sm disabled:opacity-60"
      >
        {busy ? "Reanalizando…" : "Volver a analizar los correos"}
        <span className="block text-xs text-[var(--color-muted)]">
          Útil cuando cambian las reglas de extracción
        </span>
      </button>
      {message ? (
        <p className="mt-1 text-xs text-[var(--color-muted)]">{message}</p>
      ) : null}
    </div>
  );
}
