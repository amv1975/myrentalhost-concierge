"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatUsd } from "@/lib/usage";

/**
 * Busca correos, extrae compromisos y sincroniza el calendario, en los dos
 * espacios a la vez. Es lo primero que se pulsa al abrir la app, así que es el
 * botón más grande de la pantalla y no obliga a repetir la operación por
 * pestaña.
 */
export function RefreshButton({
  espacio: _espacio,
  /** Cuándo terminó la última pasada. Null si nunca ha corrido ninguna. */
  updatedAt = null,
}: {
  espacio?: string;
  updatedAt?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /**
   * Cuánto se ha vaciado la cola, de 0 a 1. Null mientras no se sabe.
   *
   * Es progreso de verdad, no una animación de cortesía: el pipeline devuelve
   * cuántos correos quedan por mirar y por leer, así que la barra mide el
   * trabajo que falta. La primera pasada no tiene con qué comparar todavía y
   * sale indeterminada.
   */
  const [progreso, setProgreso] = useState<number | null>(null);
  /** Que sea automático no puede significar dos pasadas a la vez. */
  const corriendo = useRef(false);
  /** Cuándo se intentó por última vez desde esta pantalla. */
  const ultimoIntento = useRef<number | null>(null);

  /**
   * Muchas pasadas cortas en vez de una larga.
   *
   * Una sola petición que trabajara hasta terminar tardaba casi un minuto, y
   * un móvil con la pantalla a medio apagar la mata antes: "Failed to fetch",
   * cero avance y ninguna pista de por qué. Cada pasada dura ahora unos
   * veinticinco segundos, siempre llega, y el botón vuelve a llamar mientras
   * queden correos por leer, contándote cuántos faltan.
   */
  const run = useCallback(async function run() {
    if (corriendo.current) return;
    corriendo.current = true;
    ultimoIntento.current = Date.now();
    setBusy(true);
    setMessage(null);
    setProgreso(null);

    /** La cola al empezar, para saber contra qué medir lo que queda. */
    let cola: number | null = null;

    let total = { created: 0, updated: 0, screened: 0, discarded: 0, read: 0, costUsd: 0 };
    let anterior: number | null = null;

    for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
      let body: Record<string, number | string | null>;

      try {
        const response = await fetch("/api/refresh", { method: "POST" });
        body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (body.error as string) ?? `El servidor respondió ${response.status}`,
          );
        }
      } catch (error) {
        setMessage(
          readable(error instanceof Error ? error.message : "Error inesperado"),
        );
        setBusy(false);
        setProgreso(null);
        corriendo.current = false;
        startTransition(() => router.refresh());
        return;
      }

      total = {
        created: total.created + ((body.created as number) ?? 0),
        updated: total.updated + ((body.updated as number) ?? 0),
        screened: total.screened + ((body.screened as number) ?? 0),
        discarded: total.discarded + ((body.discarded as number) ?? 0),
        read: total.read + ((body.read as number) ?? 0),
        costUsd: total.costUsd + ((body.costUsd as number) ?? 0),
      };

      if (body.error) {
        setMessage(readable(body.error as string));
        break;
      }

      // El trabajo que falta son las dos colas juntas. Mirar solo la de leer
      // daba un falso "no avanza": mientras el filtro trabaja, los correos que
      // pasan de "sin mirar" a "por leer" hacen SUBIR ese número aunque la
      // pasada haya hecho justo lo que tenía que hacer.
      const quedan =
        ((body.remaining as number) ?? 0) +
        ((body.pendingScreen as number) ?? 0);

      // La primera respuesta fija el denominador. Usar el total inicial y no
      // el de cada vuelta evita que la barra retroceda cuando el filtro
      // convierte correos "sin mirar" en correos "por leer": el trabajo no ha
      // crecido, solo ha cambiado de cola.
      if (cola === null) cola = Math.max(quedan, 1);
      setProgreso(Math.min(1, Math.max(0, 1 - quedan / cola)));

      if (quedan === 0) {
        setProgreso(1);
        setMessage(summary(total));
        break;
      }

      // Si una pasada entera no baja el total, repetir siete veces más son
      // tres minutos de espera para acabar donde empezaste. Algo lo impide y
      // hay que decirlo, no seguir dando vueltas.
      if (anterior !== null && quedan >= anterior) {
        setMessage(
          `Quedan ${quedan} y no avanzan. Mira "Cómo va la app".`,
        );
        break;
      }
      anterior = quedan;

      setMessage(`Procesando… quedan ${quedan}`);
      startTransition(() => router.refresh());

      if (vuelta === MAX_VUELTAS) {
        setMessage(`Quedan ${quedan} por leer.`);
      }
    }

    setBusy(false);
    setProgreso(null);
    corriendo.current = false;
    startTransition(() => router.refresh());
    // router queda fuera porque es estable en el App Router; meterlo volvería a
    // crear run() en cada render, que es justo lo que dispararía pasadas de más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Al abrir la app se pone al día sola.
   *
   * Abrir Radar y tener que pulsar un botón para que empiece a trabajar es
   * pedirle al usuario que haga de reloj. El botón sigue ahí para forzarlo,
   * pero deja de ser obligatorio.
   *
   * Con freno: si el parte es de hace un rato, no se vuelve a mirar el buzón.
   * Sin él, cambiar de aplicación y volver —que en un móvil es constante—
   * lanzaría una pasada cada vez, y cada una cuesta dinero.
   */
  useEffect(() => {
    const haceFalta = () => {
      if (corriendo.current) return false;
      // Un intento reciente no se repite aunque no llegara a actualizar nada:
      // si falló, reintentarlo cada vez que la app vuelve al frente sería un
      // bucle silencioso contra un servidor que ya dijo que no.
      if (
        ultimoIntento.current !== null &&
        Date.now() - ultimoIntento.current < FRESCURA_MS
      ) {
        return false;
      }
      if (!updatedAt) return true;
      const cuando = Date.parse(updatedAt);
      return Number.isNaN(cuando) || Date.now() - cuando > FRESCURA_MS;
    };

    if (haceFalta()) void run();

    const alVolver = () => {
      if (document.visibilityState === "visible" && haceFalta()) void run();
    };

    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [updatedAt, run]);

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className="relative w-full overflow-hidden rounded-xl bg-[var(--color-solid)] px-4 py-3.5 text-base font-medium text-[var(--color-solid-ink)] shadow-sm transition active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? (message ?? "Buscando y analizando…") : "Actualizar"}
        {busy ? (
          <span
            className="parte-progreso"
            data-indeterminado={progreso === null ? "true" : undefined}
            style={progreso === null ? undefined : { width: `${Math.round(progreso * 100)}%` }}
          />
        ) : null}
      </button>
      {message && !busy ? (
        <p className="parte-aviso">
          {message}
          {/* Un mensaje que dice qué hacer y no deja hacerlo es la peor clase
              de error. El permiso de Google caduca cada siete días en modo
              Testing y no había en ninguna pantalla forma de renovarlo. */}
          {necesitaReconectar(message) ? (
            <>
              {" "}
              <a href="/reconectar">Volver a conectar con Google</a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** Cuántas pasadas encadena un solo toque antes de pedirte otro. */
const MAX_VUELTAS = 8;

/**
 * Cuánto se considera reciente un parte.
 *
 * Diez minutos. Por debajo, volver a la app no vuelve a mirar el buzón: lo que
 * haya entrado en ese rato sigue ahí cuando vuelvas y no justifica una pasada
 * nueva cada vez que cambias de aplicación.
 */
const FRESCURA_MS = 10 * 60_000;

/**
 * Qué contar después de actualizar.
 *
 * Se mira todo el buzón, así que "sin novedades" a secas haría dudar de si ha
 * funcionado. Y como detrás hay un modelo que cobra por correo, el importe va
 * en la misma línea: es la única forma de que leer la bandeja entera no dé
 * miedo. Se enseña siempre, aunque sean céntimos, porque el día que suba se
 * tiene que ver ahí mismo y no en la factura.
 */
function summary(body: {
  created?: number;
  updated?: number;
  screened?: number;
  discarded?: number;
  read?: number;
  costUsd?: number;
}): string {
  const nuevos = body.created ?? 0;
  const cambios = body.updated ?? 0;
  const mirados = body.screened ?? 0;
  const ruido = body.discarded ?? 0;
  const leidos = body.read ?? 0;
  const coste = body.costUsd ? ` · ${formatUsd(body.costUsd)}` : "";

  if (nuevos + cambios > 0) {
    return `${nuevos} nuevos${cambios ? `, ${cambios} con cambios` : ""}${coste}`;
  }

  if (mirados > 0) {
    return `${mirados} correos mirados, ${ruido} descartados, ${leidos} leídos${coste}`;
  }

  if (leidos > 0) {
    return `${leidos} correos leídos, ningún compromiso nuevo${coste}`;
  }

  return "Sin novedades";
}

/**
 * Los errores de Google llegan como un JSON largo que no dice nada útil a quien
 * está mirando el móvil. Se traducen los que tienen una causa reconocible y del
 * resto se muestra solo el principio.
 */
/** Si el fallo se arregla volviendo a dar permiso. */
function necesitaReconectar(mensaje: string): boolean {
  return /permiso de Google|aceptando el acceso/i.test(mensaje);
}

function readable(raw: string): string {
  if (/Quota exceeded|rateLimitExceeded|429|limitando/i.test(raw)) {
    return "Gmail limitó las peticiones. Se guardó lo descargado; vuelve a pulsar en un minuto para el resto.";
  }
  if (/invalid_grant|refresh token/i.test(raw)) {
    return "El permiso de Google caducó —pasa cada siete días mientras la app esté en modo Testing—.";
  }
  if (/insufficient|insufficientPermissions|403/i.test(raw)) {
    return "Google rechazó la petición por permisos. Vuelve a entrar aceptando el acceso a Gmail y Calendar.";
  }
  // Un error desconocido se enseña casi entero: cortarlo a una línea es lo que
  // hacía imposible saber qué pasaba.
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}
