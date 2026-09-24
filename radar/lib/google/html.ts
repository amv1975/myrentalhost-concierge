/**
 * El HTML de un correo, convertido en algo que se pueda leer y resumir.
 *
 * Vive aparte de `gmail.ts` porque aquel importa `server-only` y esto es
 * manipulación de texto: justo lo que hay que poder probar. Y hay bastante que
 * probar — un boletín trae enlaces con javascript:, imágenes sin texto y
 * scripts, y cada uno se trata distinto.
 */
/**
 * HTML a texto, conservando a dónde llevan los enlaces.
 *
 * Antes se tiraban con el resto de las etiquetas, y en un boletín eso es tirar
 * casi todo: un resumen de prensa ES una lista de enlaces, y sin ellos la
 * síntesis podía contarte que hay una noticia pero no llevarte a leerla.
 *
 * El destino se escribe entre paréntesis detrás del texto, y no entre
 * corchetes angulares como en un correo de texto plano: el barrido de
 * etiquetas que viene justo después se comería los ángulos junto con el resto
 * del HTML, y el enlace llegaría sin destino — que era el punto de partida.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_todo, url: string, dentro: string) => {
          const texto = dentro.replace(/<[^>]+>/g, " ").trim();
          // Solo http(s): un javascript: o un data: en un correo no es un
          // enlace, es un intento.
          if (!/^https?:\/\//i.test(url)) return texto;
          if (!texto) return ` (${url}) `;
          return ` ${texto} (${url}) `;
        },
      )
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}
