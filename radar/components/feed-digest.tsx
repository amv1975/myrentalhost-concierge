"use client";

import { useState } from "react";
import { partir } from "@/lib/feed/bloques";
import { textoDelFeed } from "@/lib/feed/compartir";
import { enlaceWhatsApp } from "@/lib/equipo";
import { primerEnlace, sinEnlace, trocear } from "@/lib/feed/markdown";

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
        // El titular lleva al artículo cuando lo hay: es lo que se mira
        // primero y lo que el pulgar busca. El nombre del medio se queda
        // igual al final, que es la otra cosa que uno quiere saber —de dónde
        // sale— y no estorba.
        const fuente = primerEnlace(bloque.cuerpo);
        return (
          <div key={bloque.id} className="feed-bloque" data-elegido={elegido}>
            <p>
              {bloque.titulo ? <b>{bloque.titulo}</b> : null}
              {bloque.titulo ? " " : null}
              <Rico
                texto={
                  fuente ? sinEnlace(bloque.cuerpo, fuente.url) : bloque.cuerpo
                }
              />
            </p>
            <div className="feed-acciones">
              {/* Un enlace subrayado dentro de un párrafo no se pulsa: hay que
                  encontrarlo primero. Fuera del texto y con forma de botón, se
                  ve sin buscarlo. */}
              {fuente ? (
                <a
                  className="feed-leer"
                  href={fuente.url}
                  target="_blank"
                  rel="noreferrer noopener nofollow"
                >
                  Leer en {fuente.medio} ↗
                </a>
              ) : null}
              <button
                type="button"
                className="feed-elegir"
                aria-pressed={elegido}
                onClick={() => alternar(bloque.id)}
              >
                {elegido ? "✓ Share" : "Share"}
              </button>
            </div>
          </div>
        );
      })}

      {elegidos.length > 0 ? (
        <div className="parte-equipo">
          <div>
            <button type="button" className="mandar" onClick={enviar}>
              {/* El número vale igual para uno que para cinco: nada de
                  plurales inventados ni de "Share 1 elemento". */}
              {enviado ? "Share otra vez" : `Share ${elegidos.length}`}
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

/**
 * Negritas y enlaces. Dos marcas no piden una librería de markdown.
 *
 * Los enlaces abren fuera y con `noreferrer`: la dirección viene de un correo
 * que no controlamos, así que la página de destino no tiene por qué saber de
 * dónde sale el clic ni poder tocar esta pestaña.
 */
function Rico({ texto }: { texto: string }) {
  return (
    <>
      {trocear(texto).map((trozo, i) => {
        if (trozo.tipo === "negrita") return <b key={i}>{trozo.texto}</b>;
        // El nombre del medio se queda como texto: el camino al artículo es
        // el botón de abajo, y dos caminos al mismo sitio en la misma línea
        // no ayudan, confunden.
        if (trozo.tipo === "enlace") return <span key={i}>{trozo.texto}</span>;
        return <span key={i}>{trozo.texto}</span>;
      })}
    </>
  );
}
