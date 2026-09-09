"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLUG_BY_SPACE, spaceLabel, type Space } from "@/lib/types";

export function SpaceTabs({
  spaces,
  userEmail,
  activeSlug: forcedSlug,
}: {
  spaces: Space[];
  userEmail: string;
  /** La previsualización vive en /preview y necesita decir qué pestaña marcar. */
  activeSlug?: string;
}) {
  const pathname = usePathname();
  const activeSlug = forcedSlug ?? pathname.split("/")[1] ?? "";
  const isPreview = forcedSlug !== undefined;
  const href = (slug: string) =>
    isPreview ? `/preview?espacio=${slug}` : `/${slug}`;

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <RadarMark />
          Radar
        </span>
        <span className="truncate text-xs text-[var(--color-faint)]">
          {userEmail}
        </span>
      </div>

      {/* Con un solo espacio no hay nada que elegir, así que no se pintan tabs. */}
      {spaces.length > 1 ? (
        // Cada pestaña ocupa la mitad del ancho: en el móvil son dos dianas
        // grandes para el pulgar, y se ve de un vistazo en cuál estás.
        <nav className="mt-2.5 flex px-4 sm:px-6">
          {spaces.map((space) => {
            const slug = SLUG_BY_SPACE[space.key];
            const active = activeSlug === slug;
            const color =
              space.key === "family"
                ? "var(--color-family)"
                : "var(--color-work)";

            return (
              <Link
                key={space.id}
                href={href(slug)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex-1 border-b-2 px-3 pb-2.5 text-center text-[15px] font-semibold transition ${
                  active
                    ? "border-current"
                    : "border-transparent text-[var(--color-faint)]"
                }`}
                style={active ? { color } : undefined}
              >
                {spaceLabel(space.key)}
              </Link>
            );
          })}
        </nav>
      ) : (
        <div className="h-3" />
      )}
    </header>
  );
}

function RadarMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      <circle
        cx="8"
        cy="8"
        r="6.2"
        className="fill-none stroke-current"
        strokeWidth="1.3"
        opacity="0.35"
      />
      <circle
        cx="8"
        cy="8"
        r="3.2"
        className="fill-none stroke-current"
        strokeWidth="1.3"
        opacity="0.35"
      />
      <path
        d="M8 8 L12.4 4.6"
        className="stroke-current"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12.4" cy="4.6" r="1.9" className="fill-current" />
    </svg>
  );
}
