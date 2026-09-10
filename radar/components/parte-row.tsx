"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gmailSearchUrl } from "@/lib/gmail-link";
import type { ParteEntry } from "@/lib/parte";

/**
 * Una línea del parte.
 *
 * Cerrada dice qué pasa en una frase. Abierta, el detalle y lo que se puede
 * hacer con ella, que son tres cosas y no más. Dos se parecen pero no son lo
 * mismo, y de esa distinción vive todo lo que la app aprende:
 *
 * - **Listo** — ya me he ocupado. Se va y no vuelve. No enseña nada.
 * - **Descartar** — esto no era para mí. Se va y le enseña al filtro a no subir
 *   más avisos de este tipo.
 * - **La estrella** — esto sí me importa. Sube arriba, deja de caducar, y le
 *   enseña al filtro qué no puede volver a dejarse fuera.
 *
 * En el móvil las dos primeras son un gesto del pulgar: derecha descarta,
 * izquierda marca hecho. Ninguna toca tu correo — todo sigue en Gmail igual.
 */
export function ParteRow({ entry }: { entry: ParteEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState<null | "listo" | "descartado">(null);
  const [starred, setStarred] = useState(entry.starred);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);

  async function send(action: string): Promise<boolean> {
    try {
      const response = await fetch(endpoint(entry), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("no");
      router.refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function act(gesture: "listo" | "descartado") {
    // Se va al pulsar, no cuando contesta el servidor: esperar dos segundos por
    // línea hace que despachar veinte se haga eterno.
    setGone(gesture);
    setFailed(false);
    if (!(await send(actionFor(entry, gesture)))) {
      setGone(null);
      setOffset(0);
      setFailed(true);
    }
  }

  async function toggleStar() {
    const next = !starred;
    setStarred(next);
    if (!(await send(starActionFor(entry, next)))) {
      setStarred(!next);
      setFailed(true);
    }
  }

  async function undo() {
    setGone(null);
    setOffset(0);
    await send("reabrir");
  }

  /* Deslizar: a la derecha descarta, a la izquierda marca hecho. */
  function onTouchStart(event: React.TouchEvent) {
    startX.current = event.touches[0].clientX;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (startX.current === null) return;
    setOffset(event.touches[0].clientX - startX.current);
  }

  function onTouchEnd() {
    if (startX.current === null) return;
    const moved = offset;
    startX.current = null;

    if (moved > SWIPE_PX) {
      setOffset(400);
      void act("descartado");
    } else if (moved < -SWIPE_PX) {
      setOffset(-400);
      void act("listo");
    } else {
      setOffset(0);
    }
  }

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
  const pulling = Math.abs(offset) > 12;

  return (
    <div className="parte-item">
      {/* Lo que asoma detrás al deslizar: sin esto el gesto no se descubre. */}
      {pulling ? (
        <span
          className="parte-behind"
          data-side={offset > 0 ? "descartar" : "listo"}
        >
          {offset > 0 ? "Descartar" : "Listo"}
        </span>
      ) : null}

      <div
        className="parte-row swipeable"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? "transform .18s ease" : "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <span className="parte-at">{hhmm(entry.at)}</span>

        <button
          type="button"
          className="parte-open"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
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
        </button>

        <button
          type="button"
          className="parte-star"
          aria-pressed={starred}
          aria-label={
            starred ? "Quitar de importantes" : "Marcar como importante"
          }
          onClick={toggleStar}
        >
          <Star filled={starred} />
        </button>

        {open ? (
          <div className="parte-detail">
            {entry.detail ? <p>{entry.detail}</p> : null}
            {entry.subject ? (
              <p className="parte-subject">{entry.subject}</p>
            ) : null}
            {failed ? (
              <p className="parte-error">No se pudo guardar. Inténtalo otra vez.</p>
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
              Descartar le enseña a no subir más avisos de este tipo; la
              estrella, a no dejarse fuera los que se parezcan a este.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Cuánto hay que arrastrar para que cuente. Menos, y se dispara sin querer. */
const SWIPE_PX = 70;

/** Un compromiso se despacha como ítem; un correo, como correo. */
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

function starActionFor(entry: ParteEntry, on: boolean): string {
  if (entry.kind === "item") return on ? "fijar" : "soltar";
  return on ? "destacar" : "quitar-destacado";
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden width="19" height="19">
      <path
        d="M10 2.6l2.2 4.6 5 .7-3.6 3.5.85 5-4.45-2.35L5.55 16.4l.85-5L2.8 7.9l5-.7z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
