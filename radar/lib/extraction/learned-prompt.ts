export interface DismissedExample {
  title: string;
  type: string;
  count: number;
}

/**
 * El bloque que se añade al system prompt con lo que esta persona descarta.
 * Vacío si no hay nada aprendido: un encabezado sin ejemplos gastaría tokens en
 * cada correo y podría hacer que el modelo se invente qué evitar.
 *
 * Se pasan como ejemplos y no como una lista de palabras prohibidas, a
 * propósito: así generaliza. Quien descarta "Entrada del huésped en Balmes"
 * tampoco quiere "Salida del huésped en Consell de Cent", y un filtro por
 * texto no lo vería.
 */
export function buildLearnedSection(examples: DismissedExample[]): string {
  if (examples.length === 0) return "";

  const lines = examples.map((e) => {
    const veces = e.count > 1 ? ` (descartado ${e.count} veces)` : "";
    return `- ${e.title}${veces}`;
  });

  return `

## Lo que esta persona ya ha descartado

Estos compromisos se extrajeron y la persona los descartó a mano. No los vuelvas a extraer, **y tampoco extraigas los que se le parezcan en intención**, aunque cambien los nombres, las fechas o los sitios:

${lines.join("\n")}

Fíjate en qué tienen en común, no en las palabras exactas. Si alguien descarta los avisos de entrada de un huésped, tampoco quiere los de salida: lo que está diciendo es que ese tipo de aviso lo lleva otra persona.

Ante la duda entre extraer algo parecido a esta lista o no extraerlo, no lo extraigas: si se equivoca por defecto, lo verá en el correo; si se equivoca por exceso, vuelve a tener que descartarlo.`;
}
