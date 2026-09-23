/**
 * La síntesis, partida en cosas que se pueden mandar sueltas.
 *
 * El Feed sale como una tirada de párrafos, cada uno empezando por su titular
 * en negrita. Entero no sirve para pasárselo a nadie: son dos mil caracteres
 * de los que al equipo de administración le interesa uno, y mandar el resto es
 * la forma más rápida de que dejen de leerlos.
 *
 * Partirlo por párrafos es suficiente porque así es como está escrito. No hace
 * falta que el modelo devuelva JSON ni una estructura aparte: lo que ya
 * produce tiene la forma correcta, y pedirle una segunda forma de lo mismo es
 * pagar dos veces por el mismo texto y tener dos sitios donde se puede romper.
 */
export interface Bloque {
  /** Estable dentro de una síntesis: su posición. Sirve de clave y de marca. */
  id: number;
  /** El titular en negrita, si lo trae. */
  titulo: string | null;
  /** Lo que viene después del titular, o el párrafo entero si no había. */
  cuerpo: string;
}

export function partir(markdown: string): Bloque[] {
  return markdown
    .split(/\n{2,}/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean)
    .map((parrafo, id) => {
      // El titular es la negrita con la que arranca el párrafo. Si empieza por
      // otra cosa —una línea de contexto, un cierre—, no hay titular y el
      // párrafo va entero como cuerpo.
      const marca = /^\*\*([^*]+)\*\*\s*/.exec(parrafo);
      if (!marca) {
        return { id, titulo: null, cuerpo: limpiar(parrafo) };
      }
      return {
        id,
        titulo: marca[1].trim(),
        cuerpo: limpiar(parrafo.slice(marca[0].length)),
      };
    });
}

/** Fuera las marcas de lista: en WhatsApp un guion suelto no es una viñeta. */
function limpiar(texto: string): string {
  return texto.replace(/^[-*]\s+/gm, "").trim();
}
