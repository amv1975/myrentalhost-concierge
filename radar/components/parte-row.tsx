"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gmailSearchUrl } from "@/lib/gmail-link";
import type { ParteEntry } from "@/lib/parte";

/**
 * Una línea del parte.
 *
 * Cerrada dice qué pasa en una frase; abierta, el detalle y las dos únicas
 * cosas que se pueden hacer con ella: ir al correo original o quitarla de en
 * medio. Nada más — cuantas más decisiones tenga una línea, menos se despacha.
 */
export function ParteRow({ entry }: { entry: ParteEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Desaparece al pulsar, no cuando el servidor contesta: esperar dos segundos
  // a que se vaya una tarjeta hace que revisar veinte se haga eterno.
  if (gone) return null;

  async function dismiss() {
    setBusy(true);
    setGone(true);
    try {
      const response = await fetch(endpoint(entry), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // "Listo" es «ya me he ocupado», no «no me enseñes más cosas así»:
        // por eso un compromiso se marca hecho y no descartado, que es lo que
        // alimenta lo que la extracción aprende a no traer.
        body: JSON.stringify({
          action: entry.kind === "item" ? "hecho" : "descartar",
        }),
      });
      if (!response.ok) throw new Error("no");
      router.refresh();
    } catch {
      setGone(false);
      setBusy(false);
    }
  }

  const life = entry.life === "family" ? "family" : "work";

  return (
    <>
      <button
        type="button"
        className="parte-row"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="parte-at">{hhmm(entry.at)}</span>
        <span className="parte-main">
          <span className="parte-headline">{entry.headline}</span>
          <span className="parte-meta">
            <span className="parte-chip" data-life={life}>
              {life === "family" ? "Familia" : "Trabajo"}
            </span>
            {entry.who ? <span className="parte-who">{entry.who}</span> : null}
            {entry.when ? (
              <span className="parte-when">· {entry.when}</span>
            ) : null}
            {entry.needsReview ? (
              <span className="parte-flag">· cambió</span>
            ) : null}
          </span>
        </span>
      </button>

      {open ? (
        <div className="parte-detail">
          {entry.detail ? <p>{entry.detail}</p> : null}
          {entry.subject ? (
            <p className="parte-subject">{entry.subject}</p>
          ) : null}
          <div className="parte-actions">
            <a
              className="parte-btn"
              href={gmailSearchUrl({
                fromEmail: entry.fromEmail,
                subject: entry.subject,
                messageId: entry.gmailMessageId,
              })}
              target="_blank"
              rel="noreferrer"
            >
              Abrir en Gmail
            </a>
            <button
              type="button"
              className="parte-btn primary"
              onClick={dismiss}
              disabled={busy}
            >
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Un compromiso se descarta como ítem; un correo, como correo. */
function endpoint(entry: ParteEntry): string {
  return entry.kind === "item"
    ? `/api/items/${entry.id}`
    : `/api/emails/${entry.id}`;
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
