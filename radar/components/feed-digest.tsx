"use client";

import { useState } from "react";
import { partir } from "@/lib/feed/bloques";
import { textoDelFeed } from "@/lib/feed/compartir";
import { enlaceWhatsApp } from "@/lib/equipo";

/**
 * La síntesis, con lo que hace falta para pasarle un trozo al equipo.
 *
 * Entera no sirve para mandarla: son dos mil caracteres de los que al equipo
 * le interesa uno, y mandarles el resto es la forma más rápida de que dejen de
 * leer lo que les mandas. Así que se elige, igual que en el parte: tocas los
 * párrafos que valen y se van solo esos.
 *
 * El gesto es el mismo que ya conoces del parte a propósito. Una app pequeña
 * que enseña dos formas distintas de hacer lo mismo es una app que hay que
 * aprender dos veces.
 */
export function FeedDigest({
  markdown,
  createdAt,
}: {
  markdown: string;
  createdAt: string;
}) {
  const bloques = partir(markdown);
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [enviado, setEnviado] = useState(false);

  function alternar(id: number) {
    setEnviado(false);
    setElegidos((previos) =>
      previos.includes(id)
        ? previos.filter((x) => x !== id)
        : [...previos, id],
    );
  }

  async function enviar() {
    // En el orden en que salen, no en el que se tocaron: el texto se lee como
    // la síntesis, no como el historial de mis dedos.
    const texto = textoDelFeed(
      bloques.filter((b) => elegidos.includes(b.id)),
      new Date(createdAt),
    );

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: texto });
        setEnviado(true);
        return;
      } catch {
        // Cancelado, o el navegador dijo que no: queda WhatsApp.
      }
    }
    window.open(enlaceWhatsApp(texto), "_blank", "noopener,noreferrer");
    setEnviado(true);
  }

  return (
    <>
      {bloques.map((bloque) => {
        const elegido = elegidos.includes(bloque.id);
        return (
          <div key={bloque.id} className="feed-bloque" data-elegido={elegido}>
            <p>
              {bloque.titulo ? <b>{bloque.titulo}</b> : null}
              {bloque.titulo ? " " : null}
              <Negritas texto={bloque.cuerpo} />
            </p>
            <button
              type="button"
              className="feed-elegir"
              aria-pressed={elegido}
              onClick={() => alternar(bloque.id)}
            >
              {elegido ? "✓ Para el equipo" : "Pasar al equipo"}
            </button>
          </div>
        );
      })}

      {elegidos.length > 0 ? (
        <div className="parte-equipo">
          <div>
            <button type="button" className="mandar" onClick={enviar}>
              {enviado
                ? "Enviar otra vez"
                : `Pasar ${elegidos.length} al equipo`}
            </button>
            <button
              type="button"
              className="quitar"
              onClick={() => {
                setElegidos([]);
                setEnviado(false);
              }}
            >
              Quitar
            </button>
          </div>
          {enviado ? <p className="aviso">Enviado.</p> : null}
        </div>
      ) : null}
    </>
  );
}

/** Las negritas de dentro del párrafo. Dos marcas no piden una librería. */
function Negritas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((trozo, i) =>
        trozo.startsWith("**") && trozo.endsWith("**") ? (
          <b key={i}>{trozo.slice(2, -2)}</b>
        ) : (
          <span key={i}>{trozo}</span>
        ),
      )}
    </>
  );
}
