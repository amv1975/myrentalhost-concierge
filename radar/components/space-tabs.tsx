"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * La cabecera de las pantallas que no son el parte.
 *
 * Aquí había dos pestañas, Familia y Trabajo, que llevaban a una segunda lista
 * con sus propias fichas y sus propios botones. Esa lista ya no existe: el
 * parte enseña las tres vidas juntas y se filtran ahí mismo, sin cambiar de
 * pantalla. Lo único que hacía falta de verdad era volver.
 */
export function SpaceTabs({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  // El parte trae su propia cabecera con la fecha. Encima de ella, esta barra
  // solo estorbaría: lo primero que se ve por la mañana tiene que ser qué pasa
  // hoy, no dónde estás.
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
        >
          <RadarMark />
          Radar
        </Link>

        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-xs text-[var(--color-faint)]">
            {userEmail}
          </span>
          <Link
            href="/"
            aria-label="Ir al parte"
            title="Ir al parte"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink)]"
          >
            <CasaMark />
          </Link>
        </span>
      </div>
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
