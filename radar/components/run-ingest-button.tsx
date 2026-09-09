"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunIngestButton({ espacio }: { espacio: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/spaces/${espacio}/ingest`, {
        method: "POST",
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? `${result.messagesNew} correos nuevos de ${result.messagesSeen} revisados`
          : (result.error ?? "No se pudo buscar correos"),
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setRunning(false);
    }
  }

  const busy = running || pending;

  return (
    <div className="text-right">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm font-medium shadow-sm transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Buscando…" : "Buscar correos"}
      </button>
      {message ? (
        <p className="mt-1 max-w-[16rem] text-xs text-[var(--color-muted)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
