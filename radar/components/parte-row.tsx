"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gmailSearchUrl } from "@/lib/gmail-link";
import type { ParteEntry } from "@/lib/parte";

/**
 * Una línea del parte.
 *
 * Cerrada dice qué pasa en una frase; abierta, el detalle y tres cosas que
 * hacer con ella, ni una más. Las dos últimas se parecen pero no son lo mismo,
 * y esa distinción es lo que hace que la app mejore con el uso:
 *
 * - **Listo** — ya me he ocupado. Se va y no vuelve.
 * - **Descartar** — esto no era para mí. Se va, y además le enseña al filtro a
 *   no volver a subir avisos de ese tipo.
 *
 * Ninguna de las dos toca tu correo: siguen los dos en Gmail igual que estaban.
 */
export function ParteRow({ entry }: { entry: ParteEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState<null | "listo" | "descartado">(null);
  const [failed, setFailed] = useState(false);

  async function act(gesture: "listo" | "descartado") {
    // Se va al pulsar, no cuando contesta el servidor: esperar dos segundos por
    // tarjeta hace que despachar veinte se haga eterno.
    setGone(gesture);
    setFailed(false);
    try {
      const response = await fetch(endpoint(entry), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionFor(entry, gesture) }),
      });
      if (!response.ok) throw new Error("no");
      router.refresh();
    } catch {
      setGone(null);
      setFailed(true);
    }
  }

  async function undo() {
    setGone(null);
    try {
      await fetch(endpoint(entry), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reabrir" }),
      });
      router.refresh();
    } catch {
      /* Vuelve a estar en pantalla, que es lo que importa. */
    }
  }

  // Descartar es la única de las dos que enseña algo, así que es la única que
  // conviene poder deshacer sin ir a buscarla a Ajustes.
  if (gone) {
    return (
      <div className="parte-undo">
        <span>
          {gone === "descartado" ? "Descartado. No volverá." : "Listo."}
        </span>
        <button type="button" onClick={undo}>
          Deshacer
        </button>
      </div>
    );
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
          {failed ? (
            <p className="parte-error">
              No se pudo guardar. Vuelve a pulsar.
            </p>
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
              onClick={() => act("listo")}
            >
              Listo
            </button>
            <button
              type="button"
              className="parte-btn"
              onClick={() => act("descartado")}
            >
              Descartar
            </button>
          </div>
          <p className="parte-hint">
            Descartar le enseña a no subir más avisos de este tipo.
          </p>
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

/**
 * "Listo" es «ya me he ocupado» y no debe enseñar nada: solo "Descartar"
 * alimenta lo que la app aprende a no traer.
 */
function actionFor(entry: ParteEntry, gesture: "listo" | "descartado"): string {
  if (gesture === "descartado") return "descartar";
  return entry.kind === "item" ? "hecho" : "visto";
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
