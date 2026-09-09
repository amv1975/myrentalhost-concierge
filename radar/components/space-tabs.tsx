"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLUG_BY_SPACE, type Space } from "@/lib/types";

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
    <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-ground)]/90 backdrop-blur">
      <div className="flex items-center justify-between px-4 pt-3 sm:px-6">
        <span className="text-base font-semibold tracking-tight">Radar</span>
        <span className="truncate text-xs text-[var(--color-muted)]">
          {userEmail}
        </span>
      </div>

      {/* Con un solo espacio no hay nada que elegir, así que no se pintan tabs. */}
      {spaces.length > 1 ? (
        // Cada pestaña ocupa la mitad del ancho: en el móvil son dos dianas
        // grandes para el pulgar, y se ve de un vistazo en cuál estás.
        <nav className="flex px-4 pt-2 sm:px-6">
          {spaces.map((space) => {
            const slug = SLUG_BY_SPACE[space.key];
            const active = activeSlug === slug;
            return (
              <Link
                key={space.id}
                href={href(slug)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex-1 border-b-2 px-3 py-3 text-center text-base font-medium transition ${
                  active
                    ? "border-current"
                    : "border-[var(--color-line)] text-[var(--color-muted)]"
                }`}
                style={
                  active
                    ? {
                        color:
                          space.key === "family"
                            ? "var(--color-family)"
                            : "var(--color-work)",
                      }
                    : undefined
                }
              >
                {space.name}
              </Link>
            );
          })}
        </nav>
      ) : (
        <div className="h-2" />
      )}
    </header>
  );
}
