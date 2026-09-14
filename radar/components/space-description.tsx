"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Qué cuenta como esta vida.
 *
 * Este texto entra tal cual en el prompt del filtro, así que es el mando con
 * el que de verdad se corrige una clasificación mala: más directo que
 * cualquier lista de remitentes, porque describe el criterio en vez de
 * enumerar casos.
 */
export function SpaceDescription({
  espacio,
  valor,
}: {
  espacio: string;
  valor: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [texto, setTexto] = useState(valor ?? "");
  const [estado, setEstado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const sucio = texto.trim() !== (valor ?? "").trim();

  async function guardar() {
    setGuardando(true);
    setEstado(null);
    try {
      const response = await fetch(`/api/spaces/${espacio}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: texto }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `El servidor respondió ${response.status}`);
      }
      setEstado("Guardado. Se aplica en la próxima actualización.");
      startTransition(() => router.refresh());
    } catch (error) {
      setEstado(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        rows={5}
        maxLength={1200}
        className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-sm leading-relaxed"
        placeholder="Qué correos son de esta vida: quién escribe, de qué temas, y qué no."
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !sucio}
          className="rounded-lg bg-[var(--color-solid)] px-4 py-2.5 text-sm font-medium text-[var(--color-solid-ink)] disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <span className="text-xs text-[var(--color-muted)]">
          {estado ?? `${texto.length}/1200`}
        </span>
      </div>
    </div>
  );
}
