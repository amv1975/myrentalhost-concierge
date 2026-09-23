import type { Bloque } from "@/lib/feed/bloques";

/**
 * Lo que llega al grupo del equipo.
 *
 * Se escribe para quien no ha abierto Radar nunca y lo lee entre otras veinte
 * cosas del grupo. Por eso lleva de dónde sale: sin esa línea, tres párrafos
 * sobre la ocupación en Barcelona aparecen sin contexto y nadie sabe si es una
 * noticia, una queja o una instrucción.
 *
 * WhatsApp marca la negrita con un asterisco, no con dos. Dejar el markdown
 * tal cual llegaba con los asteriscos a la vista, que es la señal más clara de
 * que un mensaje lo ha escrito una máquina y nadie lo ha mirado.
 */
export function textoDelFeed(bloques: Bloque[], cuando: Date): string {
  if (bloques.length === 0) return "";

  const fecha = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "long",
  }).format(cuando);

  const cabecera = `Del sector, ${fecha}:`;

  const partes = bloques.map((bloque) =>
    [bloque.titulo ? `*${bloque.titulo}*` : null, aWhatsApp(bloque.cuerpo)]
      .filter(Boolean)
      .join("\n"),
  );

  return [cabecera, ...partes].join("\n\n");
}

/** Negrita de markdown a negrita de WhatsApp. */
export function aWhatsApp(texto: string): string {
  return texto.replace(/\*\*([^*]+)\*\*/g, "*$1*");
}
