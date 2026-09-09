"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface LearnedEntry {
  title: string;
  normalizedTitle: string;
  count: number;
}

/**
 * Lo que la app ha aprendido a ignorar, y cómo deshacerlo.
 *
 * Existe porque el aprendizaje silencioso es peligroso: si algo que descartaste
 * una vez resulta importante después, la app dejaría de traerlo sin decir nada.
 * Aquí se ve qué ha aprendido y se puede revocar de uno en uno.
 */
export function LearnedList({
  espacio,
  entries,
}: {
  espacio: string;
  entries: LearnedEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function forget(entry: LearnedEntry) {
    setBusy(entry.normalizedTitle);
    setError(null);
    try {
      const response = await fetch(
        `/api/spaces/${espacio}/learned?titulo=${encodeURIComponent(entry.normalizedTitle)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo olvidar");
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--color-line)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
        Todavía no ha aprendido nada. Cada vez que descartes algo, dejará de
        traerte cosas parecidas.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li
            key={entry.normalizedTitle}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-3"
          >
            <span className="min-w-0 text-sm">
              <span className="block truncate text-[var(--color-ink)]">
                {entry.title}
              </span>
              {entry.count > 1 ? (
                <span className="text-xs text-[var(--color-muted)]">
                  descartado {entry.count} veces
                </span>
              ) : null}
            </span>
            <button
              onClick={() => forget(entry)}
              disabled={busy !== null}
              className="shrink-0 text-sm font-medium text-[var(--color-muted)] disabled:opacity-50"
            >
              Olvidar
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
