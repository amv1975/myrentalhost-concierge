"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/lib/types";
import { gmailSearchUrl } from "@/lib/gmail-link";
import { googleCalendarDayUrl } from "@/lib/calendar-link";
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
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar");

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

  const isEvent = item.type === "event";
  const dateValue = item.starts_at ?? item.due_date;
  const days = dateValue ? relativeDays(dateValue) : null;
  const overdue = days?.startsWith("hace") ?? false;
  const today = days === "hoy" || days === "mañana";

  if (gone) return null;

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Lo que asoma bajo la tarjeta mientras se desliza. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-2xl bg-[var(--color-line-soft)] px-6 text-sm font-semibold">
        <span
          className={
            offset > 20 && (mode === "review" || item.type === "action")
              ? "text-[var(--color-ok)]"
              : "opacity-0"
          }
        >
          {mode === "review" ? "Confirmar" : "Hecho"}
        </span>
        <span
          className={offset < -20 ? "text-[var(--color-danger)]" : "opacity-0"}
        >
          Descartar
        </span>
      </div>

      <article
        className="swipeable relative rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(20,22,26,0.04)]"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? "transform 180ms ease" : "none",
          opacity: busy ? 0.55 : 1,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <TypeBadge isEvent={isEvent} />
            {item.status === "needs_review" ? (
              <span className="rounded-full bg-[var(--color-warn-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-warn)]">
                Ha cambiado
              </span>
            ) : null}
          </div>

          <h3 className="mt-2.5 text-[17px] font-semibold leading-snug text-[var(--color-ink)]">
            {item.title}
          </h3>

          <When
            item={item}
            days={days}
            overdue={overdue}
            today={today}
            isEvent={isEvent}
          />

          {item.description ? (
            <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-body)]">
              {item.description}
            </p>
          ) : null}

          {item.location ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--color-muted)]">
              <PinIcon />
              <span>{item.location}</span>
            </p>
          ) : null}

          {item.changed_fields ? <ChangeDiff item={item} /> : null}

          {error ? (
            <p className="mt-3 rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <Footer item={item} mode={mode} busy={busy !== null} act={act} />
      </article>
    </li>
  );
}

function TypeBadge({ isEvent }: { isEvent: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        isEvent
          ? "bg-[var(--accent-soft,#eef0f4)] text-[var(--accent,#3f4653)]"
          : "bg-[var(--color-line-soft)] text-[var(--color-body)]"
      }`}
    >
      {isEvent ? <CalendarIcon /> : <CheckSquareIcon />}
      {isEvent ? "Evento" : "Acción"}
    </span>
  );
}

/** La fecha es lo que más se mira, así que va grande y con el plazo al lado. */
function When({
  item,
  days,
  overdue,
  today,
  isEvent,
}: {
  item: Item;
  days: string | null;
  overdue: boolean;
  today: boolean;
  isEvent: boolean;
}) {
  if (!item.starts_at && !item.due_date) {
    return (
      <p className="mt-1.5 text-sm text-[var(--color-faint)]">Sin fecha</p>
    );
  }

  const text = item.starts_at
    ? formatDateTime(item.starts_at)
    : formatDate(item.due_date!);

  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="tnum text-sm font-medium text-[var(--color-ink)]">
        {!isEvent && item.due_date ? "Antes del " : ""}
        {text}
      </span>
      {days ? (
        <span
          className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
            overdue
              ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
              : today
                ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                : "text-[var(--color-muted)]"
          }`}
        >
          {overdue ? `vencido ${days}` : days}
        </span>
      ) : null}
    </div>
  );
}

function Footer({
  item,
  mode,
  busy,
  act,
}: {
  item: Item;
  mode: "review" | "open";
  busy: boolean;
  act: (action: Action) => void;
}) {
  const inCalendar = item.type === "event" && item.google_event_id;

  return (
    <div className="border-t border-[var(--color-line-soft)] px-4 py-3">
      <div className="flex items-center gap-2">
        {mode === "review" ? (
          <>
            <button
              onClick={() => act("confirmar")}
              disabled={busy}
              className="flex-1 rounded-xl bg-[var(--color-ink)] px-3 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {item.type === "event" ? "Confirmar y añadir" : "Confirmar"}
            </button>
            <button
              onClick={() => act("descartar")}
              disabled={busy}
              className="rounded-xl border border-[var(--color-line)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-body)] transition active:scale-[0.98] disabled:opacity-50"
            >
              Descartar
            </button>
          </>
        ) : item.type === "action" ? (
          <button
            onClick={() => act("hecho")}
            disabled={busy}
            className="flex-1 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition active:scale-[0.98] disabled:opacity-50"
          >
            Marcar como hecho
          </button>
        ) : (
          <button
            onClick={() => act("descartar")}
            disabled={busy}
            className="flex-1 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm font-medium text-[var(--color-body)] transition active:scale-[0.98] disabled:opacity-50"
          >
            {item.google_event_id ? "Quitar del calendario" : "Descartar"}
          </button>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <a
          href={gmailSearchUrl({
            fromEmail: item.email_from,
            subject: item.email_subject,
            messageId: item.gmail_message_id,
          })}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[var(--color-muted)] underline underline-offset-4"
        >
          Ver el correo
        </a>

        {inCalendar ? (
          <a
            href={googleCalendarDayUrl(item.starts_at!)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[var(--color-ok)] underline underline-offset-4"
          >
            <CheckIcon />
            En tu calendario
          </a>
        ) : item.type === "event" && mode === "open" ? (
          <span className="text-[var(--color-muted)]">
            {item.sync_error
              ? "No llegó al calendario"
              : "Subiendo al calendario…"}
          </span>
        ) : null}
      </div>
    </div>
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
    <dl className="mt-3 space-y-1.5 rounded-xl bg-[var(--color-warn-soft)] px-3 py-2.5 text-xs">
      {entries.map(([field, change]) => (
        <div key={field}>
          <dt className="font-semibold text-[var(--color-warn)]">
            {labels[field] ?? field}
          </dt>
          <dd className="text-[var(--color-warn)]">
            <span className="line-through opacity-55">
              {display(field, change.before)}
            </span>
            <span className="mx-1.5">→</span>
            <span className="font-semibold">
              {display(field, change.after)}
            </span>
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3 fill-current">
      <path d="M5 1a.75.75 0 0 1 .75.75V2.5h4.5v-.75a.75.75 0 0 1 1.5 0V2.5h.75A1.5 1.5 0 0 1 14 4v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V4a1.5 1.5 0 0 1 1.5-1.5h.75v-.75A.75.75 0 0 1 5 1ZM3.5 6v7h9V6h-9Z" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3 fill-current">
      <path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9Zm7.78 4.28-4 4a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l1.47 1.47 3.47-3.47a.75.75 0 1 1 1.06 1.06Z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="mt-0.5 h-3 w-3 shrink-0 fill-current"
    >
      <path d="M8 1a5 5 0 0 0-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 0 0-5-5Zm0 6.75A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3 fill-current">
      <path d="M13.28 4.22a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6.75 9.69l5.47-5.47a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}
