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

  // El parte trae su propia cabecera con la fecha, y encima de ella una barra
  // de pestañas solo estorbaría: lo primero que se ve por la mañana tiene que
  // ser qué pasa hoy, no dónde estás.
  if (forcedSlug === undefined && pathname === "/") return null;

  const activeSlug = forcedSlug ?? pathname.split("/")[1] ?? "";
  const isPreview = forcedSlug !== undefined;
  const href = (slug: string) =>
    isPreview ? `/preview?espacio=${slug}` : `/${slug}`;

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6">
        {/* El nombre lleva al parte, como en cualquier sitio. */}
        <Link
          href={isPreview ? "/preview" : "/"}
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
        >
          <RadarMark />
          Radar
        </Link>

        {/* min-w-0 en los dos: sin él, un correo largo empuja la casita fuera
            de la pantalla en vez de recortarse. */}
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-xs text-[var(--color-faint)]">
            {userEmail}
          </span>
          {/*
            Y una casita explícita, porque el nombre de una aplicación no
            parece un botón. Desde Ajustes no había forma evidente de volver:
            el único enlace era una línea pequeña bajo el título, y llevaba a
            la lista de fichas en vez de al parte.
          */}
          <Link
            href={isPreview ? "/preview" : "/"}
            aria-label="Ir al parte"
            title="Ir al parte"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink)]"
          >
            <CasaMark />
          </Link>
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

function CasaMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-[18px] w-[18px]">
      <path
        d="M3.4 8.6 10 3.2l6.6 5.4"
        className="fill-none stroke-current"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.1 9.9v6.3h9.8V9.9"
        className="fill-none stroke-current"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
