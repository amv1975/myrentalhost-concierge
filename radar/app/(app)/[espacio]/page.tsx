import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpaceByKey } from "@/lib/spaces";
import { getSpaceView } from "@/lib/items";
import { slugToSpaceKey, type Item } from "@/lib/types";
import { ItemCard } from "@/components/item-card";
import { RefreshButton } from "@/components/refresh-button";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ espacio: string }>;
}) {
  const { espacio } = await params;
  const key = slugToSpaceKey(espacio);
  if (!key) notFound();

  // RLS: si no es miembro, la consulta no devuelve el espacio y aquí acaba.
  // Forzar la URL /trabajo desde una cuenta de Familia da 404, y lo decide la
  // base de datos, no el router.
  const space = await getSpaceByKey(key);
  if (!space) notFound();

  const view = await getSpaceView(space.id);
  const nothingAtAll =
    view.toReview.length === 0 &&
    view.openActions.length === 0 &&
    view.upcomingEvents.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="sr-only">{space.name}</h1>
        <PendingNotice
          count={view.toReview.length}
          days={view.oldestPendingDays}
        />
        <RefreshButton espacio={espacio} />
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
      />

      <Section
        title="Próximos eventos"
        items={view.upcomingEvents}
        mode="open"
      />

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
    </div>
  );
}

function Section({
  title,
  items,
  mode,
  empty,
}: {
  title: string;
  items: Item[];
  mode: "review" | "open";
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
            <ItemCard key={item.id} item={item} mode={mode} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "Si tengo 40 ítems pendientes de revisar, la app ha fracasado."
 *
 * Este aviso existe para que eso sea visible antes de que pase: dice cuántos
 * hay y desde cuándo espera el más antiguo.
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
