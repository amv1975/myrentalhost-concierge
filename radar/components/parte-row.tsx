"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gmailSearchUrl } from "@/lib/gmail-link";
import type { ParteEntry } from "@/lib/parte";
import { spaceLabel } from "@/lib/types";
import { decidirEje, resultado, SWIPE_PX } from "@/lib/gesto";
import { desdeCuando } from "@/lib/google/hilo-parse";

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
export function ParteRow({
  entry,
  elegido = false,
  onElegir,
}: {
  entry: ParteEntry;
  /** Elegido para pasárselo al equipo. */
  elegido?: boolean;
  onElegir?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState<null | "listo" | "descartado">(null);
  const [starred, setStarred] = useState(entry.starred);
  /** Null hasta que se toca; luego dice cómo fue. */
  const [enAgenda, setEnAgenda] = useState(entry.agenda === "puesto");
  const [poniendo, setPoniendo] = useState(false);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  /**
   * Qué resultó ser el gesto.
   *
   * Se decide una vez, al principio, y ya no cambia. Sin esto, bajar por la
   * lista con el pulgar —que nunca baja recto— iba arrastrando la fila de
   * lado, y un dedo que se desvía cuarenta píxeles mientras hace scroll
   * acababa descartando un correo que ni se llegó a leer.
   */
  const eje = useRef<null | "x" | "y">(null);

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

  /**
   * Poner la cita en el calendario, desde el parte.
   *
   * El camino ya existía entero —confirmar un compromiso lo escribe en Google
   * Calendar— pero el botón vivía solo en la vista de fichas, que es otra
   * pantalla. Un compromiso con fecha se quedaba en el parte para siempre sin
   * llegar nunca al calendario, que es justo lo que la aplicación venía a
   * resolver.
   */
  async function ponerEnAgenda() {
    setPoniendo(true);
    setFailed(false);
    // Aquí no se es optimista: escribir en el calendario es un efecto de
    // verdad y fuera de la app. Decir que está puesto antes de que lo esté
    // sería la clase de mentira que hace desconfiar de todo lo demás.
    const ok = await send("confirmar");
    setPoniendo(false);
    if (ok) setEnAgenda(true);
    else setFailed(true);
  }

  async function undo() {
    setGone(null);
    setOffset(0);
    await send("reabrir");
  }

  /* Deslizar: a la derecha descarta, a la izquierda marca hecho. */
  function onTouchStart(event: React.TouchEvent) {
    startX.current = event.touches[0].clientX;
    startY.current = event.touches[0].clientY;
    eje.current = null;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return;
    const dx = event.touches[0].clientX - startX.current;
    const dy = event.touches[0].clientY - startY.current;

    // Hasta que el dedo no se ha movido lo suficiente para saber qué está
    // haciendo, no se hace nada. Decidir en el primer píxel es decidir con
    // ruido.
    if (eje.current === null) {
      eje.current = decidirEje(dx, dy);
      if (eje.current === null) return;
    }

    if (eje.current === "y") return;
    setOffset(dx);
  }

  function onTouchEnd() {
    const gesto = resultado(eje.current, offset);
    startX.current = null;
    startY.current = null;
    eje.current = null;

    if (gesto === null) {
      setOffset(0);
      return;
    }
    setOffset(gesto === "descartado" ? 400 : -400);
    void act(gesto);
  }

  if (gone) {
    // Decir cuál era, no solo que se fue. "Descartado. No volverá." sobre una
    // fila que ya no está deja al que lo hizo sin saber qué acaba de perder, y
    // entonces Deshacer tampoco sirve: no sabes si pulsarlo.
    return (
      <div className="parte-undo">
        <span>
          <b>{gone === "descartado" ? "Descartado" : "Listo"}</b>
          {": "}
          {entry.headline}
        </span>
        <button type="button" onClick={undo}>
          Deshacer
        </button>
      </div>
    );
  }

  const life = entry.life;
  // Lo de detrás solo asoma cuando ya hay arrastre de verdad, y crece con él:
  // así se ve venir lo que va a pasar antes de que pase.
  const pulling = Math.abs(offset) > 24;
  const listo = Math.min(1, Math.abs(offset) / SWIPE_PX);

  return (
    <div className="parte-item">
      {/* Lo que asoma detrás al deslizar: sin esto el gesto no se descubre. */}
      {pulling ? (
        <span
          className="parte-behind"
          data-side={offset > 0 ? "descartar" : "listo"}
          data-armed={listo >= 1}
          style={{ opacity: 0.35 + listo * 0.65 }}
        >
          {offset > 0 ? "Descartar" : "Listo"}
          {listo >= 1 ? " ›" : null}
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
              {spaceLabel(life)}
            </span>
            {entry.who ? <span className="parte-who">{entry.who}</span> : null}
            {entry.when ? (
              <span className="parte-when">· {entry.when}</span>
            ) : null}
            {entry.reading ? (
              <span className="parte-reading">· leyéndolo</span>
            ) : null}
            {/* Lo más accionable de la línea, y por eso va en la cabecera y no
                escondido en el detalle: no es lo mismo una pregunta que
                contestaste que una que lleva dos mensajes esperando. */}
            {entry.espera ? (
              <span className="parte-espera">
                · sin responder {desdeCuando(new Date(entry.espera.desde))}
                {entry.espera.mensajes > 1
                  ? ` (${entry.espera.mensajes} mensajes)`
                  : null}
              </span>
            ) : null}
          </span>
          {entry.link ? (
            <span className="parte-link">{entry.link}</span>
          ) : null}
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
            {/* Antes que el detalle: es la frase que decide si esto se mira
                ahora o mañana, y en el cuarto renglón no decide nada. */}
            {entry.riesgo ? (
              <p className="parte-riesgo">{entry.riesgo}</p>
            ) : null}
            {entry.detail ? <p>{entry.detail}</p> : null}
            {entry.subject ? (
              <p className="parte-subject">{entry.subject}</p>
            ) : null}
            {failed ? (
              <p className="parte-error">No se pudo guardar. Inténtalo otra vez.</p>
            ) : null}
            <div className="parte-actions">
              {entry.agenda !== null ? (
                enAgenda ? (
                  <span className="parte-btn hecho">En tu calendario</span>
                ) : (
                  <button
                    type="button"
                    className="parte-btn primary"
                    onClick={ponerEnAgenda}
                    disabled={poniendo}
                  >
                    {poniendo ? "Poniendo…" : "Poner en el calendario"}
                  </button>
                )
              ) : null}
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
                className={entry.agenda === "puede" ? "parte-btn" : "parte-btn primary"}
                onClick={() => act("listo")}
              >
                Listo
              </button>
              {onElegir ? (
                <button
                  type="button"
                  className="parte-btn"
                  aria-pressed={elegido}
                  onClick={onElegir}
                >
                  {elegido ? "✓ Para el equipo" : "Para el equipo"}
                </button>
              ) : null}
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
