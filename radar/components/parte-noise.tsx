"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NoiseEntry } from "@/lib/parte";
import { SLUG_BY_SPACE, spaceLabel, type SpaceKey } from "@/lib/types";

/**
 * Lo que el filtro tiró, y la forma de decirle que se equivocó.
 *
 * Antes esto era una lista muerta con un pie que decía "si ves algo mal
 * descartado, dilo en Ajustes" — y en Ajustes no había nada que hacer. Enseñaba
 * el error sin dejar corregirlo, así que el filtro solo podía aprender de sus
 * aciertos: descartar enseñaba qué no traer, y no había ningún gesto que
 * enseñara qué no dejarse fuera.
 *
 * Hacen falta dos toques y no uno porque el filtro descartó el correo
 * precisamente por no saber de qué vida era. Esa es la información que falta, y
 * es la que hay que pedir.
 */
/** A qué vidas se puede mandar un correo rescatado, en el orden del filtro. */
const DESTINOS: readonly SpaceKey[] = ["work", "personal", "family"];

export function ParteNoise({
  total,
  entries,
}: {
  total: number;
  entries: NoiseEntry[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /** Cuál está preguntando a qué vida pertenece. */
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [encontrados, setEncontrados] = useState<NoiseEntry[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [hecho, setHecho] = useState<Record<string, string>>({});
  /** Lo que el correo resultó ser, en cuanto se lee. */
  const [resumen, setResumen] = useState<Record<string, string>>({});
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  /** Boletines que acabas de marcar para seguir. */
  const [siguiendo, setSiguiendo] = useState<Record<string, true>>({});

  /**
   * Buscar entre todos los descartados, no solo entre los que caben en la
   * pantalla.
   *
   * Se espera medio segundo desde la última tecla en vez de consultar en cada
   * pulsación: escribir "vecinos" son siete consultas de las que solo importa
   * la última.
   */
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setEncontrados(null);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    const cortar = new AbortController();
    const temporizador = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/emails/descartados?q=${encodeURIComponent(q)}`,
          { signal: cortar.signal },
        );
        const body = (await response.json()) as { results?: NoiseEntry[] };
        setEncontrados(body.results ?? []);
      } catch {
        // Abortada por una tecla nueva, o sin red: la siguiente lo resuelve.
      } finally {
        setBuscando(false);
      }
    }, 450);

    return () => {
      clearTimeout(temporizador);
      cortar.abort();
    };
  }, [busqueda]);

  /**
   * Seguir un boletín.
   *
   * El botón vive aquí y no en una pantalla de ajustes porque es exactamente
   * donde están: un boletín del sector es ruido para el parte —no tiene plazo
   * ni pide nada— y el filtro hace bien en tirarlo. La lista de descartados es
   * el único sitio donde uno se los encuentra.
   */
  async function seguir(entry: NoiseEntry) {
    setFallo(null);
    setSiguiendo((prev) => ({ ...prev, [entry.id]: true }));
    try {
      const response = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "seguir",
          fromEmail: entry.fromEmail,
          name: entry.who,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "No se pudo guardar.");
      }
    } catch (error) {
      setSiguiendo((prev) => {
        const copia = { ...prev };
        delete copia[entry.id];
        return copia;
      });
      setFallo(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function rescatar(id: string, espacio: SpaceKey) {
    setEligiendo(null);
    setFallo(null);
    // Optimista para el rescate, que es tu decisión y no puede fallar por
    // lentitud. El resumen sí espera: lo trae el servidor después de leerlo.
    setHecho((prev) => ({ ...prev, [id]: espacio }));
    setLeyendo(id);

    try {
      const response = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescatar", espacio }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        summary?: string | null;
      };
      if (!response.ok) {
        throw new Error(body.error ?? `El servidor respondió ${response.status}`);
      }
      if (body.summary) {
        setResumen((prev) => ({ ...prev, [id]: body.summary as string }));
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setHecho((prev) => {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      });
      setFallo(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setLeyendo(null);
    }
  }

  // Buscando manda lo encontrado; si no, los últimos que caben.
  const lista = encontrados ?? entries;

  return (
    <details className="parte-noise">
      <summary>
        {total} correos descartados por ruido
        {buscando ? " · buscando…" : null}
      </summary>

      {/*
        El buscador es el gesto de verdad. La lista sirve para comprobar que no
        se tiró nada gordo; encontrar UN correo entre seiscientos setenta y
        siete no se hace desplazándose, se hace buscándolo por lo poco que uno
        recuerda de él.
      */}
      <input
        type="search"
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
        placeholder="Buscar un correo: remitente o asunto"
        className="parte-buscar"
        aria-label="Buscar un correo que no esté en el parte"
      />

      {lista.length > 0 ? (
        <ul>
          {lista.map((entry) => {
            const rescatado = hecho[entry.id];

            return (
              <li key={entry.id}>
                <span className="nfrom">{entry.who}</span>
                <span className="nsubj">{entry.subject}</span>
                {entry.deGmail ? (
                  <span className="nsrc">encontrado en tu Gmail</span>
                ) : null}

                {rescatado ? (
                  <span className="nok">
                    {leyendo === entry.id
                      ? "Leyéndolo entero…"
                      : (resumen[entry.id] ??
                        "Rescatado · sube al parte en la próxima actualización")}
                  </span>
                ) : eligiendo === entry.id ? (
                  <span className="nacciones">
                    <span className="nlabel">¿De qué es?</span>
                    {DESTINOS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => rescatar(entry.id, key)}
                      >
                        {spaceLabel(key)}
                      </button>
                    ))}
                    <button type="button" onClick={() => setEligiendo(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <span className="nacciones">
                    <button type="button" onClick={() => setEligiendo(entry.id)}>
                      Esto sí me importa
                    </button>
                    {entry.fromEmail ? (
                      <button
                        type="button"
                        onClick={() => seguir(entry)}
                        disabled={siguiendo[entry.id]}
                      >
                        {siguiendo[entry.id] ? "✓ En el Feed" : "Seguir"}
                      </button>
                    ) : null}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {encontrados !== null && encontrados.length === 0 && !buscando ? (
        <p className="note">
          Nada con «{busqueda.trim()}», ni en lo descartado ni en tu Gmail.
          Prueba con el remitente, o con una palabra exacta del asunto.
        </p>
      ) : null}

      {fallo ? <p className="parte-error">{fallo}</p> : null}

      <p className="note">
        Está aquí para que puedas comprobar que no se tiró nada que importara.
        Lo que rescates vuelve a la cola, se lee entero y además le enseña al
        filtro qué no puede volver a dejarse fuera.
      </p>
    </details>
  );
}
