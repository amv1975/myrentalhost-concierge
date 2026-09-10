"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Descartar en bloque lo que todavía no se ha leído.
 *
 * Existe por una regla del usuario: la app no borra nada por su cuenta, él
 * decide qué se va. Pero respetar eso no puede significar despachar
 * doscientos avisos automáticos de uno en uno — eso no es decidir, es
 * castigar. Así que la decisión sigue siendo suya y el trabajo es un toque.
 *
 * Solo alcanza a lo que aún no tiene resumen, nunca a lo que ya está leído y
 * en pantalla.
 */
export function ParteVaciar({ pendientes }: { pendientes: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setAsking(false);
    try {
      const response = await fetch("/api/emails/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo descartar");
      setMessage(`${body.dismissed} descartados.`);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  if (message) return <span className="parte-redo">{message}</span>;
  if (busy) return <span className="parte-redo">Descartando…</span>;

  if (asking) {
    return (
      <span className="parte-redo">
        Descarta los {pendientes} sin leer y le enseña a no subir más avisos de
        ese tipo. Lo que ya está leído no se toca.{" "}
        <button type="button" onClick={run}>
          Descartarlos
        </button>{" "}
        <button type="button" onClick={() => setAsking(false)}>
          Dejarlo
        </button>
      </span>
    );
  }

  return (
    <span className="parte-redo">
      <button type="button" onClick={() => setAsking(true)}>
        Descartar los {pendientes} sin leer
      </button>
    </span>
  );
}
