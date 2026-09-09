"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Source } from "@/lib/types";

export function SourcesEditor({
  espacio,
  sources,
}: {
  espacio: string;
  sources: Source[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/spaces/${espacio}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo añadir");
      setValue("");
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/spaces/${espacio}/sources?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo quitar");
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2.5"
          >
            <span className="truncate text-sm">
              {source.value}
              <span className="ml-2 text-xs text-[var(--color-muted)]">
                {source.kind === "domain" ? "dominio" : "dirección"}
              </span>
            </span>
            <button
              onClick={() => remove(source.id)}
              disabled={busy}
              aria-label={`Quitar ${source.value}`}
              className="shrink-0 px-2 text-sm text-[var(--color-danger)] disabled:opacity-50"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="colegio.org o avisos@colegio.org"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="shrink-0 rounded-lg bg-[var(--color-ink)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Añadir
        </button>
      </form>

      {error ? (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
