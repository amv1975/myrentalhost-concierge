import Link from "next/link";
import type { SpaceView } from "@/lib/items";
import type { Item } from "@/lib/types";
import { ItemCard } from "@/components/item-card";

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
  const nothingAtAll =
    view.toReview.length === 0 &&
    view.openActions.length === 0 &&
    view.upcomingEvents.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PendingNotice
          count={view.toReview.length}
          days={view.oldestPendingDays}
        />
        {children}
      </div>

      {nothingAtAll ? (
        <div className="rounded-xl border border-[var(--color-line)] bg-white px-4 py-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            Nada pendiente. Si esperabas algo, busca correos nuevos.
          </p>
        </div>
      ) : null}

      <Section
        title="Para revisar"
        items={view.toReview}
        mode="review"
        demo={demo}
        empty={
          view.toReview.length === 0 && !nothingAtAll
            ? "Todo revisado."
            : undefined
        }
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

      {demo ? null : (
        <div className="flex gap-4 pt-2 text-sm">
          <Link
            href={`/${espacio}/correos`}
            className="text-[var(--color-muted)] underline underline-offset-4"
          >
            Ver correos
          </Link>
          <Link
            href={`/${espacio}/ajustes`}
            className="text-[var(--color-muted)] underline underline-offset-4"
          >
            Ajustes
          </Link>
        </div>
      )}
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
      <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
        {title}
        {items.length > 0 ? (
          <span className="ml-1.5 font-normal">({items.length})</span>
        ) : null}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-2">
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
  if (count === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">Nada por revisar.</p>
    );
  }

  const piledUp = count >= 10 || (days ?? 0) >= 7;

  return (
    <p
      className={`text-sm ${piledUp ? "font-medium text-[var(--color-danger)]" : ""}`}
    >
      {count} {count === 1 ? "cosa" : "cosas"} por revisar
      {days !== null && days >= 1 ? (
        <span className="block text-xs font-normal text-[var(--color-muted)]">
          la más antigua lleva {days} {days === 1 ? "día" : "días"} esperando
        </span>
      ) : null}
    </p>
  );
}
