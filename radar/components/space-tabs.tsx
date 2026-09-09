"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLUG_BY_SPACE, type Space } from "@/lib/types";

export function SpaceTabs({
  spaces,
  userEmail,
}: {
  spaces: Space[];
  userEmail: string;
}) {
  const pathname = usePathname();
  const activeSlug = pathname.split("/")[1] ?? "";

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
        <nav className="flex gap-1 px-4 pt-2 sm:px-6">
          {spaces.map((space) => {
            const slug = SLUG_BY_SPACE[space.key];
            const active = activeSlug === slug;
            return (
              <Link
                key={space.id}
                href={`/${slug}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-current"
                    : "border-transparent text-[var(--color-muted)]"
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
