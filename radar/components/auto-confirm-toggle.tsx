"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AutoConfirmToggle({
  espacio,
  enabled,
  threshold,
}: {
  espacio: string;
  enabled: boolean;
  threshold: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/spaces/${espacio}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_confirm_enabled: next }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar");
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setOn(!next);
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={busy}
        className="flex w-full items-center justify-between gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-left disabled:opacity-60"
      >
        <span className="text-sm">
          Confirmar solas las de confianza alta
          <span className="block text-xs text-[var(--color-muted)]">
            a partir de {Math.round(threshold * 100)}% de confianza
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            on ? "bg-[var(--color-solid)]" : "bg-[var(--color-line)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--color-solid-ink)] shadow transition-all ${
              on ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </span>
      </button>
      {error ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
