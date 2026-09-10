import Link from "next/link";
import type { SpaceView } from "@/lib/items";
import type { Item } from "@/lib/types";
import { ItemCard } from "@/components/item-card";
import { EmailDigest } from "@/components/email-digest";

/**
 * El tablero de un espacio. Recibe los datos ya resueltos, así que la página
 * real lo usa con lo que sale de Supabase y la previsualización con datos de
 * ejemplo, sin que haya dos versiones de la vista.
 */
export function SpaceBoard({
  espacio,
  view,
  demo = false,
  children,
}: {
  espacio: string;
  view: SpaceView;
  /** En previsualización las acciones no llaman a la API. */
  demo?: boolean;
  /** El botón de actualizar, que la previsualización no monta. */
  children?: React.ReactNode;
}) {
  const noItems =
    view.toReview.length === 0 &&
    view.openActions.length === 0 &&
    view.upcomingEvents.length === 0;
  const nothingAtAll = noItems && view.digest.length === 0;

  return (
    <div className="space-y-7">
      {/* El botón va ancho y arriba del todo: es lo primero que se pulsa al
          abrir la app, y en el móvil un objetivo grande se acierta sin mirar. */}
      {children}

      <PendingNotice
        count={view.toReview.length}
        days={view.oldestPendingDays}
      />

      {nothingAtAll ? (
        <EmptyState />
      ) : noItems ? null : (
        <>
          <Section
            title="Para revisar"
            items={view.toReview}
            mode="review"
            demo={demo}
            empty="Todo revisado."
          />
          <Section
            title="Acciones abiertas"
            items={view.openActions}
            mode="open"
            demo={demo}
          />
          <Section
            title="Próximos eventos"
            items={view.upcomingEvents}
            mode="open"
            demo={demo}
          />
        </>
      )}

      <EmailDigest emails={view.digest} />

      {demo ? null : (
        <div className="flex gap-5 border-t border-[var(--color-line)] pt-4 text-sm">
          <Link
            href={`/${espacio}/correos`}
            className="font-medium text-[var(--color-muted)]"
          >
            Ver correos
          </Link>
          <Link
            href={`/${espacio}/ajustes`}
            className="font-medium text-[var(--color-muted)]"
          >
            Ajustes
          </Link>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[var(--color-body)]">
        Nada pendiente
      </p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Si esperabas algo, pulsa Actualizar.
      </p>
    </div>
  );
}

function Section({
  title,
  items,
  mode,
  demo,
  empty,
}: {
  title: string;
  items: Item[];
  mode: "review" | "open";
  demo: boolean;
  empty?: string;
}) {
  if (items.length === 0 && !empty) return null;

  return (
    <section>
      <h2 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
        {items.length > 0 ? (
          <span className="tnum rounded-full bg-[var(--color-line-soft)] px-1.5 text-[11px] font-semibold normal-case tracking-normal text-[var(--color-body)]">
            {items.length}
          </span>
        ) : null}
      </h2>
      {items.length === 0 ? (
        <p className="px-0.5 text-sm text-[var(--color-faint)]">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} mode={mode} demo={demo} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "Si tengo 40 ítems pendientes de revisar, la app ha fracasado."
 *
 * Este aviso existe para que eso se vea venir: dice cuántos hay y desde cuándo
 * espera el más antiguo, y se pone en rojo antes de que la pila sea inmanejable.
 */
function PendingNotice({
  count,
  days,
}: {
  count: number;
  days: number | null;
}) {
  if (count === 0) return null;

  const piledUp = count >= 10 || (days ?? 0) >= 7;

  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        piledUp
          ? "bg-[var(--color-danger-soft)]"
          : "bg-[var(--accent-soft,#eef0f4)]"
      }`}
    >
      <p
        className={`text-sm font-semibold ${
          piledUp
            ? "text-[var(--color-danger)]"
            : "text-[var(--accent,#3f4653)]"
        }`}
      >
        {count} {count === 1 ? "cosa por revisar" : "cosas por revisar"}
      </p>
      {days !== null && days >= 1 ? (
        <p
          className={`mt-0.5 text-xs ${
            piledUp
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-muted)]"
          }`}
        >
          la más antigua lleva {days} {days === 1 ? "día" : "días"} esperando
        </p>
      ) : null}
    </div>
  );
}
