/**
 * Los enlaces de la síntesis, convertidos en algo que se puede pulsar.
 *
 * El modelo escribe `[Hosteltur](https://…)` porque se lo pedimos, pero el
 * texto sale de un correo que no controlamos: la dirección que copia viene de
 * ahí. Por eso no se pinta cualquier cosa que tenga forma de enlace —solo
 * http y https—, y lo que no pasa el filtro se queda como texto plano en vez
 * de desaparecer: si algo raro llega, quiero verlo, no que se esconda.
 */

export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrita"; texto: string }
  | { tipo: "enlace"; texto: string; url: string };

const MARCAS = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;

export function trocear(texto: string): Trozo[] {
  const salida: Trozo[] = [];

  for (const parte of texto.split(MARCAS)) {
    if (!parte) continue;

    const enlace = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(parte);
    if (enlace) {
      const url = enlace[2].trim();
      if (/^https?:\/\//i.test(url)) {
        salida.push({ tipo: "enlace", texto: enlace[1], url });
      } else {
        // Ni se pinta como enlace ni se tira: se queda a la vista tal cual.
        salida.push({ tipo: "texto", texto: parte });
      }
      continue;
    }

    if (parte.startsWith("**") && parte.endsWith("**")) {
      salida.push({ tipo: "negrita", texto: parte.slice(2, -2) });
      continue;
    }

    salida.push({ tipo: "texto", texto: parte });
  }

  return salida;
}

/**
 * Lo mismo para WhatsApp, donde no hay enlaces con texto.
 *
 * `[Hosteltur](https://…)` pegado tal cual en un chat es ilegible y encima no
 * se puede pulsar. Una dirección suelta, sí.
 */
export function enlacesPlanos(texto: string): string {
  return texto.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (todo, etiqueta, url) => {
    const limpia = String(url).trim();
    if (!/^https?:\/\//i.test(limpia)) return String(etiqueta);
    return `${etiqueta}: ${limpia}`;
  });
}

/**
 * El primer enlace de un párrafo, para poder colgarlo también del titular.
 *
 * Un titular es lo que se mira primero y lo que el pulgar busca. Dejar el
 * único camino al artículo en el nombre del medio, al final del párrafo y en
 * letra pequeña, es esconderlo: hay que saber que está para encontrarlo.
 */
export function primerEnlace(
  texto: string,
): { url: string; medio: string } | null {
  for (const trozo of trocear(texto)) {
    if (trozo.tipo === "enlace") return { url: trozo.url, medio: trozo.texto };
  }
  return null;
}

/**
 * El párrafo sin el enlace que ya está en el botón.
 *
 * Dejarlo dentro deja el nombre del medio colgando al final de la frase
 * —"…es un buen momento para tenerlo blindado. 3CatInfo"— justo encima de un
 * botón que dice "Leer en 3CatInfo". Decirlo dos veces seguidas no informa
 * mejor, solo sobra.
 */
export function sinEnlace(texto: string, url: string): string {
  return texto
    .replace(
      /\s*\[([^\]]+)\]\(([^)]+)\)/g,
      (todo, _etiqueta, encontrada: string) =>
        encontrada.trim() === url ? "" : todo,
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
