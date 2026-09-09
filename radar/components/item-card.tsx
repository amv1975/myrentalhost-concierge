"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/lib/types";
import { gmailSearchUrl } from "@/lib/gmail-link";
import { formatDate, formatDateTime, relativeDays } from "@/lib/format";

type Action = "confirmar" | "descartar" | "hecho" | "reabrir";

const SWIPE_COMMIT_PX = 96;

export function ItemCard({
  item,
  mode,
  demo = false,
}: {
  item: Item;
  /** review: decidir si entra. open: ya está dentro y se puede cerrar. */
  mode: "review" | "open";
  /** En previsualización la tarjeta se aparta sola, sin llamar a la API. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<Action | null>(null);
  const [offset, setOffset] = useState(0);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startX = useRef<number | null>(null);

  async function act(action: Action) {
    setBusy(action);
    setError(null);

    if (demo) {
      setTimeout(() => setGone(true), 180);
      return;
    }

    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo guardar");
      }
      // La decisión se guardó, pero el calendario no la recogió. Conviene
      // decirlo: el cron lo reintentará, y mientras tanto el evento no está.
      if (body.syncError) {
        setError(`Guardado, pero no llegó al calendario: ${body.syncError}`);
        setOffset(0);
        setBusy(null);
        return;
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setBusy(null);
      setOffset(0);
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    }
  }

  // Deslizar a la derecha confirma, a la izquierda descarta. Es el gesto de un
  // solo pulgar que hace que revisar veinte ítems no dé pereza.
  function onTouchStart(event: React.TouchEvent) {
    startX.current = event.touches[0].clientX;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (startX.current === null || busy) return;
    setOffset(event.touches[0].clientX - startX.current);
  }

  function onTouchEnd() {
    if (startX.current === null || busy) return;
    const moved = offset;
    startX.current = null;

    // Un evento ya confirmado no se "hace": o se queda o se quita. Deslizarlo a
    // la derecha no tiene significado, así que la tarjeta vuelve a su sitio.
    const derechaHaceAlgo = mode === "review" || item.type === "action";

    if (moved > SWIPE_COMMIT_PX && derechaHaceAlgo) {
      setOffset(400);
      void act(mode === "review" ? "confirmar" : "hecho");
    } else if (moved < -SWIPE_COMMIT_PX) {
      setOffset(-400);
      void act("descartar");
    } else {
      setOffset(0);
    }
  }

  const when = item.starts_at
    ? formatDateTime(item.starts_at)
    : item.due_date
      ? formatDate(item.due_date)
      : null;
  const dateForCountdown = item.starts_at ?? item.due_date;
  const days = dateForCountdown ? relativeDays(dateForCountdown) : null;
  const overdue = dateForCountdown
    ? relativeDays(dateForCountdown).startsWith("hace")
    : false;

  if (gone) return null;

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* Lo que asoma bajo la tarjeta mientras se desliza. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-xl px-5 text-sm font-medium">
        <span
          className={
            offset > 20 && (mode === "review" || item.type === "action")
              ? "text-emerald-700"
              : "opacity-0"
          }
        >
          {mode === "review" ? "Confirmar" : "Hecho"}
        </span>
        <span className={offset < -20 ? "text-[var(--color-danger)]" : "opacity-0"}>
          Descartar
        </span>
      </div>

      <div
        className="swipeable relative rounded-xl border border-[var(--color-line)] bg-white p-4"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? "transform 180ms ease" : "none",
          opacity: busy ? 0.5 : 1,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            {item.type === "event" ? "Evento" : "Acción"}
          </span>
          {item.status === "needs_review" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Ha cambiado
            </span>
          ) : null}
        </div>

        <h3 className="mt-1 text-base font-medium leading-snug">{item.title}</h3>

        {when ? (
          <p className="mt-1 text-sm">
            {when}
            {days ? (
              <span
                className={`ml-2 text-xs ${overdue ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}
              >
                {days}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--color-muted)]">Sin fecha</p>
        )}

        {item.description ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {item.description}
          </p>
        ) : null}

        {item.location ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {item.location}
          </p>
        ) : null}

        {item.changed_fields ? <ChangeDiff item={item} /> : null}

        {mode === "open" && item.type === "event" ? (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {item.google_event_id
              ? "En tu calendario"
              : item.sync_error
                ? `No llegó al calendario: ${item.sync_error}`
                : "Pendiente de subir al calendario"}
          </p>
        ) : null}

        {error ? (
          <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          {mode === "review" ? (
            <>
              <button
                onClick={() => act("confirmar")}
                disabled={busy !== null}
                className="flex-1 rounded-lg bg-[var(--color-ink)] px-3 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                onClick={() => act("descartar")}
                disabled={busy !== null}
                className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-sm transition active:scale-[0.98] disabled:opacity-50"
              >
                Descartar
              </button>
            </>
          ) : item.type === "action" ? (
            <button
              onClick={() => act("hecho")}
              disabled={busy !== null}
              className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50"
            >
              Marcar como hecho
            </button>
          ) : (
            // Un evento confirmado ya está en el calendario. Lo único que tiene
            // sentido hacerle desde aquí es retirarlo.
            <button
              onClick={() => act("descartar")}
              disabled={busy !== null}
              className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50"
            >
              {item.google_event_id ? "Quitar del calendario" : "Descartar"}
            </button>
          )}

          <a
            href={gmailSearchUrl({
              fromEmail: item.email_from,
              subject: item.email_subject,
              messageId: item.gmail_message_id,
            })}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 px-2 py-2.5 text-xs text-[var(--color-muted)] underline underline-offset-4"
          >
            Correo
          </a>
        </div>
      </div>
    </li>
  );
}

/** Qué cambió respecto al compromiso anterior, sin obligar a abrir el correo. */
function ChangeDiff({ item }: { item: Item }) {
  const labels: Record<string, string> = {
    title: "Título",
    description: "Detalles",
    location: "Lugar",
    starts_at: "Fecha y hora",
    due_date: "Fecha límite",
  };

  const entries = Object.entries(item.changed_fields ?? {});
  if (entries.length === 0) return null;

  return (
    <dl className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs">
      {entries.map(([field, change]) => (
        <div key={field} className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-amber-900">
            {labels[field] ?? field}:
          </dt>
          <dd className="text-amber-900">
            <span className="line-through opacity-60">
              {display(field, change.before)}
            </span>{" "}
            → <span className="font-medium">{display(field, change.after)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function display(field: string, value: string | null): string {
  if (!value) return "—";
  if (field === "starts_at") return formatDateTime(value);
  if (field === "due_date") return formatDate(value);
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}
